import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPosixHost, assertPosixUserHost } from "./posix_host";

// Negative controls for the host preconditions that replaced skipIf (69-16): a host that cannot
// give the test its meaning must make it fail by name, never pass without having asserted.
describe("POSIX host preconditions", () => {
	const platform = Object.getOwnPropertyDescriptor(process, "platform");

	afterEach(() => {
		vi.restoreAllMocks();
		if (platform !== undefined) {
			Object.defineProperty(process, "platform", platform);
		}
	});

	it("passes on a POSIX non-root host", () => {
		vi.spyOn(process, "getuid").mockReturnValue(501);
		Object.defineProperty(process, "platform", { value: "darwin" });
		expect(() => assertPosixHost()).not.toThrow();
		expect(() => assertPosixUserHost()).not.toThrow();
	});

	it("refuses a win32 host by name, for both preconditions", () => {
		Object.defineProperty(process, "platform", { value: "win32" });
		expect(() => assertPosixHost()).toThrow(
			"POSIX host precondition failed: mode, ownership and hard-link semantics are unavailable on win32",
		);
		expect(() => assertPosixUserHost()).toThrow(
			"POSIX host precondition failed",
		);
	});

	it("refuses a root host only for the user precondition", () => {
		vi.spyOn(process, "getuid").mockReturnValue(0);
		Object.defineProperty(process, "platform", { value: "linux" });
		expect(() => assertPosixHost()).not.toThrow();
		expect(() => assertPosixUserHost()).toThrow(
			"POSIX user host precondition failed: running as root, which ignores permission bits",
		);
	});
});
