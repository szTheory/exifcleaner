import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { EXIFCLEANER_PARENT_PID_ENV } from "../../src/infrastructure/exiftool/exiftool_spawn_args";

const ROOT = path.resolve(import.meta.dirname, "../..");
const EXIFTOOL = path.join(ROOT, ".resources/nix/bin/exiftool");
const CONFIG = path.join(
	ROOT,
	".resources/nix/exiftool-config/watchdog.config",
);
const HOME_FIXTURE = path.join(ROOT, "tests/scripts/fixtures/exiftool_home");
const HOME_MARKER = "EXIFCLEANER_HOME_CONFIG_LOADED";

interface ExtraResource {
	from: string;
	to: string;
	filter: string[];
}

interface PackageJson {
	build: Record<string, { extraResources?: ExtraResource[] } | undefined>;
}

function readPackageJson(): PackageJson {
	return JSON.parse(
		fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
	) as PackageJson;
}

/** The nix ExifTool is a Perl script, so the executing cases need a POSIX host. */
function assertPosixPackagingHost(): void {
	if (process.platform === "win32") {
		throw new Error(
			"watchdog_packaging executes the nix ExifTool and needs a POSIX host",
		);
	}
}

function runExiftool({
	args,
	env,
}: {
	args: string[];
	env?: NodeJS.ProcessEnv;
}): { status: number | null; stdout: string; stderr: string } {
	assertPosixPackagingHost();
	const result = spawnSync(EXIFTOOL, args, { encoding: "utf8", env });
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

describe("watchdog packaging (D-03)", () => {
	const WATCHDOG_RESOURCE: ExtraResource = {
		from: ".resources/nix/exiftool-config",
		to: "nix/exiftool-config",
		filter: ["**/*"],
	};

	test.each(["mac", "linux"])(
		"build.%s ships the watchdog config exactly once",
		(target) => {
			const resources = readPackageJson().build[target]?.extraResources ?? [];
			const matches = resources.filter((r) =>
				r.from.includes("exiftool-config"),
			);
			expect(matches).toEqual([WATCHDOG_RESOURCE]);
			expect(resources.map((r) => r.from)).toContain(".resources/nix/bin");
		},
	);

	test("build.win never ships the watchdog config", () => {
		const win = readPackageJson().build.win;
		expect(win).toBeDefined();
		expect(JSON.stringify(win)).not.toContain("exiftool-config");
	});
});

describe("watchdog config shape and drift", () => {
	test("keeps the markers the lifecycle depends on and the env name in step with TS", () => {
		expect(fs.existsSync(CONFIG)).toBe(true);
		const text = fs.readFileSync(CONFIG, "utf8");
		const lines = text.split("\n").filter((l) => l.trim() !== "");
		expect(lines.at(-1)?.trim()).toBe("1;");
		expect(text).toContain("main::ReadStayOpen");
		expect(text).toContain("SA_RESTART");
		expect(text).toContain("POSIX::_exit(0)");
		expect(text).toContain(`$ENV{${EXIFCLEANER_PARENT_PID_ENV}}`);
	});
});

describe("watchdog config load (D-04, D-05, D-06)", () => {
	test("a first-argument -config loads cleanly: exit 0, empty stderr, version on stdout", () => {
		const r = runExiftool({ args: ["-config", CONFIG, "-ver"] });
		expect(r.status).toBe(0);
		expect(r.stderr).toBe("");
		expect(r.stdout).toMatch(/^\d+\.\d+\s*$/);
	});

	test("a missing config warns and still serves (negative control, D-05)", () => {
		const missing = path.resolve(
			ROOT,
			".resources/nix/exiftool-config/does-not-exist.config",
		);
		const r = runExiftool({ args: ["-config", missing, "-ver"] });
		expect(r.status).toBe(0);
		expect(r.stderr).toContain("Config file not found");
		expect(r.stdout).toMatch(/^\d+\.\d+\s*$/);
	});

	test("a non-first -config is ignored with a warning (ordering negative control, D-04)", () => {
		const r = runExiftool({ args: ["-ver", "-config", CONFIG] });
		expect(r.stderr).toContain("Ignored -config option");
	});

	test("without -config the home config loads (negative control for D-06)", () => {
		const r = runExiftool({
			args: ["-ver"],
			env: { ...process.env, HOME: HOME_FIXTURE, EXIFTOOL_HOME: HOME_FIXTURE },
		});
		expect(r.stderr).toContain(HOME_MARKER);
	});

	test("with -config the home config is not loaded (D-06)", () => {
		const r = runExiftool({
			args: ["-config", CONFIG, "-ver"],
			env: { ...process.env, HOME: HOME_FIXTURE, EXIFTOOL_HOME: HOME_FIXTURE },
		});
		expect(r.status).toBe(0);
		expect(r.stderr).not.toContain(HOME_MARKER);
	});
});
