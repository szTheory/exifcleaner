import { beforeEach, describe, expect, test, vi } from "vitest";

const { getCapabilities, sanitizeFile } = vi.hoisted(() => ({
	getCapabilities: vi.fn(),
	sanitizeFile: vi.fn(),
}));

vi.mock("exifcleaner-node", () => ({ getCapabilities, sanitizeFile }));

import { NativeWebpAdapter } from "../../src/infrastructure/native_webp/native_webp_adapter";

const capabilities = {
	formats: [
		{
			format: "webp" as const,
			sanitize: true,
			detection: "magic" as const,
			preserves: {
				orientation: true,
				colorProfile: true,
				timestamps: true,
			},
		},
	],
};

describe("NativeWebpAdapter", () => {
	beforeEach(() => {
		getCapabilities.mockReset();
		sanitizeFile.mockReset();
		getCapabilities.mockReturnValue(capabilities);
	});

	test("caches the immutable package capabilities", () => {
		const adapter = new NativeWebpAdapter();

		expect(adapter.getCapabilities()).toBe(capabilities);
		expect(adapter.getCapabilities()).toBe(capabilities);
		expect(getCapabilities).toHaveBeenCalledTimes(1);
	});

	test("forwards semantic sanitize inputs and the identical signal", async () => {
		const adapter = new NativeWebpAdapter();
		const controller = new AbortController();
		const request = {
			source: "/tmp/source.webp",
			destination: "/tmp/clean.webp",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveTimestamps: true,
			signal: controller.signal,
		};
		sanitizeFile.mockResolvedValue({ ok: true, value: {} });

		expect(await adapter.sanitize(request)).toEqual({ ok: true, value: undefined });
		expect(sanitizeFile).toHaveBeenCalledWith({
			sourcePath: request.source,
			destinationPath: request.destination,
			preserveOrientation: request.preserveOrientation,
			preserveColorProfile: request.preserveColorProfile,
			preserveTimestamps: request.preserveTimestamps,
			signal: request.signal,
		});
	});

	test.each([
		{ code: "aborted", detail: "cancelled" },
		{ code: "invalid-options", detail: "invalid" },
		{ code: "not-found", detail: "missing", path: "/tmp/source.webp", cause: { message: "ENOENT" } },
		{ code: "unsupported-format", detail: "wrong type", path: "/tmp/source.webp" },
		{ code: "malformed-file", detail: "bad riff", path: "/tmp/source.webp" },
		{ code: "unsafe-structure", detail: "unsafe", path: "/tmp/source.webp" },
		{ code: "unsupported-feature", detail: "orientation", path: "/tmp/source.webp", feature: "orientation-preservation" },
		{ code: "source-changed", detail: "changed", path: "/tmp/source.webp" },
		{ code: "destination-exists", detail: "exists", path: "/tmp/clean.webp", cause: { code: "EEXIST", message: "exists" } },
		{ code: "destination-changed", detail: "changed", path: "/tmp/clean.webp" },
		{ code: "read-failed", detail: "read", path: "/tmp/source.webp", cause: { message: "EIO" } },
		{ code: "write-failed", detail: "write", path: "/tmp/clean.webp", cause: { message: "EIO" } },
		{ code: "verification-failed", detail: "verify", path: "/tmp/clean.webp", cause: { message: "mismatch" } },
		{ code: "cleanup-failed", detail: "cleanup", path: "/tmp/clean.webp", cause: { message: "EIO" } },
	] as const)("preserves complete typed package failure $code", async (error) => {
		const adapter = new NativeWebpAdapter();
		sanitizeFile.mockResolvedValue({ ok: false, error });

		const result = await adapter.sanitize({
			source: "/tmp/source.webp",
			destination: "/tmp/clean.webp",
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({
			ok: false,
			error: { ...error, code: "native-error", nativeCode: error.code, backend: "native-webp" },
		});
	});

	test("does not import or expose native inspection", async () => {
		const source = await import("node:fs/promises").then((fs) =>
			fs.readFile(
				new URL("../../src/infrastructure/native_webp/native_webp_adapter.ts", import.meta.url),
				"utf8",
			),
		);

		expect(source).not.toContain("inspectFile");
		expect("inspect" in new NativeWebpAdapter()).toBe(false);
	});
});
