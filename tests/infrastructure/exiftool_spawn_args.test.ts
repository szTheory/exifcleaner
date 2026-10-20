import { EventEmitter } from "node:events";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	EXIFCLEANER_PARENT_PID_ENV,
	exiftoolSpawnArgs,
	exiftoolSpawnEnv,
} from "../../src/infrastructure/exiftool/exiftool_spawn_args";

const mockSpawn = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
	spawn: mockSpawn,
}));

const { ExiftoolProcess } =
	await import("../../src/infrastructure/exiftool/ExiftoolProcess");

const CONFIG = path.resolve(
	"/opt/exifcleaner/nix/exiftool-config/watchdog.config",
);
const BIN = "/opt/exifcleaner/nix/bin/exiftool";
const STAY_OPEN = ["-stay_open", "True", "-@", "-"];

/** The named precondition for the class cases: they assert the POSIX argv on the real host. */
function assertPosixHost(): void {
	if (process.platform === "win32") {
		throw new Error(
			"exiftool_spawn_args.test.ts class cases require a POSIX host (win32 never passes -config)",
		);
	}
}

/** D-07: `-config` is argv index 0 and its value is an absolute path. */
function assertConfigFirstAndAbsolute(
	args: string[],
	configPath: string,
): void {
	if (args[0] !== "-config") {
		throw new Error(
			`-config must be argv index 0, got ${JSON.stringify(args)}`,
		);
	}
	if (args[1] !== configPath || !path.isAbsolute(args[1] ?? "")) {
		throw new Error(
			`-config value must be the absolute path ${configPath}, got ${JSON.stringify(args[1])}`,
		);
	}
}

interface FakeChild extends EventEmitter {
	pid: number;
	stdin: PassThrough;
	stdout: PassThrough;
	stderr: PassThrough;
	kill: ReturnType<typeof vi.fn>;
}

function fakeChild(): FakeChild {
	const child = new EventEmitter() as FakeChild;
	child.pid = 4242;
	child.stdin = new PassThrough();
	child.stdout = new PassThrough();
	child.stderr = new PassThrough();
	child.kill = vi.fn();
	return child;
}

describe("exiftoolSpawnArgs", () => {
	it.each(["darwin", "linux"] as const)(
		"%s puts an absolute -config first, then the stay_open args",
		(platform) => {
			const args = exiftoolSpawnArgs({ platform, configPath: CONFIG });
			assertConfigFirstAndAbsolute(args, CONFIG);
			expect(args.slice(2)).toEqual(STAY_OPEN);
		},
	);

	it("win32 returns the plain stay_open args without -config", () => {
		const args = exiftoolSpawnArgs({ platform: "win32", configPath: CONFIG });
		expect(args).toEqual(STAY_OPEN);
		expect(args).not.toContain("-config");
	});

	describe("negative controls for assertConfigFirstAndAbsolute", () => {
		it("throws when -config comes after -stay_open", () => {
			expect(() =>
				assertConfigFirstAndAbsolute(
					["-stay_open", "True", "-config", CONFIG, "-@", "-"],
					CONFIG,
				),
			).toThrow(/argv index 0/);
		});

		it("throws on a relative config path", () => {
			expect(() =>
				assertConfigFirstAndAbsolute(
					["-config", "watchdog.config", ...STAY_OPEN],
					CONFIG,
				),
			).toThrow(/absolute path/);
		});

		it("throws on the win32 output", () => {
			expect(() =>
				assertConfigFirstAndAbsolute(
					exiftoolSpawnArgs({ platform: "win32", configPath: CONFIG }),
					CONFIG,
				),
			).toThrow(/argv index 0/);
		});
	});
});

describe("exiftoolSpawnEnv", () => {
	it.each(["darwin", "linux"] as const)(
		"%s adds the parent pid, keeps base keys and leaves base unmodified",
		(platform) => {
			const base = { PATH: "/usr/bin", HOME: "/home/u" };
			const env = exiftoolSpawnEnv({ platform, base, parentPid: 777 });
			expect(env[EXIFCLEANER_PARENT_PID_ENV]).toBe("777");
			expect(env.PATH).toBe("/usr/bin");
			expect(env.HOME).toBe("/home/u");
			expect(EXIFCLEANER_PARENT_PID_ENV in base).toBe(false);
		},
	);

	it("overwrites a pre-set parent pid in the inherited env", () => {
		const base = { [EXIFCLEANER_PARENT_PID_ENV]: "1" };
		const env = exiftoolSpawnEnv({ platform: "linux", base, parentPid: 55 });
		expect(env[EXIFCLEANER_PARENT_PID_ENV]).toBe("55");
	});

	it("win32 returns base without the parent pid key", () => {
		const base = { PATH: "C:\\Windows" };
		const env = exiftoolSpawnEnv({ platform: "win32", base, parentPid: 777 });
		expect(EXIFCLEANER_PARENT_PID_ENV in env).toBe(false);
		expect(env.PATH).toBe("C:\\Windows");
	});
});

describe("ExiftoolProcess spawn call", () => {
	afterEach(() => {
		mockSpawn.mockReset();
	});

	it("passes -config first and the parent pid env when configPath is given (POSIX)", async () => {
		assertPosixHost();
		const child = fakeChild();
		mockSpawn.mockReturnValue(child);
		const process_ = new ExiftoolProcess({ binPath: BIN, configPath: CONFIG });
		await process_.open();
		try {
			expect(mockSpawn).toHaveBeenCalledTimes(1);
			const call = mockSpawn.mock.calls[0] as [
				string,
				string[],
				{ env: NodeJS.ProcessEnv },
			];
			expect(call[0]).toBe(BIN);
			assertConfigFirstAndAbsolute(call[1], CONFIG);
			expect(call[1]).toEqual(["-config", CONFIG, ...STAY_OPEN]);
			expect(call[2]).toEqual({
				env: expect.objectContaining({
					[EXIFCLEANER_PARENT_PID_ENV]: String(process.pid),
				}),
			});
		} finally {
			child.stdin.destroy();
			child.stdout.destroy();
			child.stderr.destroy();
			child.removeAllListeners();
		}
	});

	it("keeps the legacy two-argument spawn when no configPath is given", async () => {
		const child = fakeChild();
		mockSpawn.mockReturnValue(child);
		const process_ = new ExiftoolProcess({ binPath: BIN });
		await process_.open();
		try {
			expect(mockSpawn).toHaveBeenCalledTimes(1);
			expect(mockSpawn.mock.calls[0]).toEqual([BIN, STAY_OPEN]);
		} finally {
			child.stdin.destroy();
			child.stdout.destroy();
			child.stderr.destroy();
			child.removeAllListeners();
		}
	});
});
