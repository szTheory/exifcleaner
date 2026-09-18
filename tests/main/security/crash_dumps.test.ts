import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({
	setPath: vi.fn(),
	crashReporterStart: vi.fn(),
}));
const fsMock = vi.hoisted(() => ({
	mkdirSync: vi.fn(),
}));

vi.mock("electron", () => ({
	app: { setPath: electronMock.setPath },
	crashReporter: { start: electronMock.crashReporterStart },
}));
// No real disk write: this is a pure unit test of the env-var gate, not an integration test
// of directory creation.
vi.mock("node:fs", () => ({ default: fsMock, ...fsMock }));

import {
	CRASH_DUMPS_DIR_ENV_VAR,
	maybeEnableCrashDumps,
} from "../../../src/main/security/crash_dumps";

const ORIGINAL_ENV = process.env[CRASH_DUMPS_DIR_ENV_VAR];

beforeEach(() => {
	electronMock.setPath.mockClear();
	electronMock.crashReporterStart.mockClear();
	fsMock.mkdirSync.mockClear();
	delete process.env[CRASH_DUMPS_DIR_ENV_VAR];
});

afterEach(() => {
	if (ORIGINAL_ENV === undefined) {
		delete process.env[CRASH_DUMPS_DIR_ENV_VAR];
	} else {
		process.env[CRASH_DUMPS_DIR_ENV_VAR] = ORIGINAL_ENV;
	}
});

describe("maybeEnableCrashDumps", () => {
	it("is a no-op — the real user/production gate — when the env var is unset", () => {
		maybeEnableCrashDumps();

		expect(fsMock.mkdirSync).not.toHaveBeenCalled();
		expect(electronMock.setPath).not.toHaveBeenCalled();
		expect(electronMock.crashReporterStart).not.toHaveBeenCalled();
	});

	it("is a no-op when the env var is set to an empty string", () => {
		process.env[CRASH_DUMPS_DIR_ENV_VAR] = "";

		maybeEnableCrashDumps();

		expect(fsMock.mkdirSync).not.toHaveBeenCalled();
		expect(electronMock.setPath).not.toHaveBeenCalled();
		expect(electronMock.crashReporterStart).not.toHaveBeenCalled();
	});

	it("enables local-only crash dumps when the env var is set (CI diagnostic path)", () => {
		process.env[CRASH_DUMPS_DIR_ENV_VAR] = "/tmp/exifcleaner-crash-dumps";

		maybeEnableCrashDumps();

		expect(fsMock.mkdirSync).toHaveBeenCalledWith(
			"/tmp/exifcleaner-crash-dumps",
			{ recursive: true },
		);
		expect(electronMock.setPath).toHaveBeenCalledWith(
			"crashDumps",
			"/tmp/exifcleaner-crash-dumps",
		);
		expect(electronMock.crashReporterStart).toHaveBeenCalledOnce();
	});

	it("never sets a submitURL and always disables server upload — no-telemetry gate", () => {
		process.env[CRASH_DUMPS_DIR_ENV_VAR] = "/tmp/exifcleaner-crash-dumps";

		maybeEnableCrashDumps();

		const options = electronMock.crashReporterStart.mock.calls[0]?.[0] as
			{ submitURL?: string; uploadToServer?: boolean } | undefined;
		expect(options).toBeDefined();
		expect(options?.uploadToServer).toBe(false);
		expect(options?.submitURL).toBe("");
	});
});
