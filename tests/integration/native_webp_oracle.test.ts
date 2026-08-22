import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { NativeWebpAdapter } from "../../src/infrastructure/native_webp/native_webp_adapter";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "../e2e/fixtures/sample.webp");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("native WebP sanitization with an independent ExifTool oracle", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it.each([
		{
			name: "preserves requested orientation, ICC profile, and timestamps",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveTimestamps: true,
			expectedOrientation: true,
			expectedColorProfile: true,
			expectedTimestampMatch: true,
		},
		{
			name: "removes optional orientation and ICC data when preservation is disabled",
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
			expectedOrientation: false,
			expectedColorProfile: false,
			expectedTimestampMatch: false,
		},
	])("$name without an ExifTool write", async (preservation) => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "native-webp-oracle-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, "sample.webp");
		const destination = path.join(dir, "sample-cleaned.webp");
		fs.copyFileSync(FIXTURE, source);
		const sourceDigest = sha256(source);
		const sourceStats = fs.statSync(source);
		const beforeDir = snapshotDir(dir);
		const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process });
		const native = new NativeWebpAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, nativeWebp: native });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");

		await process.open();
		try {
			const before = await exiftool.inspect({ source, purpose: "display" });
			expect(before).toMatchObject({ ok: true });
			if (!before.ok) return;
			expect(before.value.metadata).toMatchObject({
				"IFD0:Make": "TestCamera",
				"IFD0:Artist": "Test Author",
				"IFD0:Orientation": "Rotate 90 CW",
				"ICC_Profile:ProfileDescription": "Nikon Adobe RGB 4.0.0.3000",
			});

			const result = await hybrid.sanitize({
				source,
				destination,
				preserveOrientation: preservation.preserveOrientation,
				preserveColorProfile: preservation.preserveColorProfile,
				preserveTimestamps: preservation.preserveTimestamps,
			});

			expect(result).toEqual({ ok: true, value: undefined });
			expect(nativeWrite).toHaveBeenCalledOnce();
			expect(exiftoolWrite).not.toHaveBeenCalled();
			expect(destination).not.toBe(source);
			expect(fs.existsSync(destination)).toBe(true);
			expect(sha256(source)).toBe(sourceDigest);
			expect(fs.statSync(source)).toMatchObject({
			mtimeMs: sourceStats.mtimeMs,
		});
			assertDirEffect(beforeDir, snapshotDir(dir), {
				unchanged: ["sample.webp"],
				added: ["sample-cleaned.webp"],
				modified: [],
				removed: [],
			});

			const outputVerification = await exiftool.inspect({
				source: destination,
				purpose: "output-verification",
			});
			expect(outputVerification).toMatchObject({
				ok: true,
				value: { recordCount: 1, verification: { error: undefined } },
			});
			if (!outputVerification.ok) return;
			expect(String(outputVerification.value.verification.fileType)).toMatch(
				/WEBP/u,
			);

			const after = await exiftool.inspect({ source: destination, purpose: "display" });
			expect(after).toMatchObject({ ok: true });
			if (!after.ok) return;
			expect(after.value.metadata).not.toHaveProperty("IFD0:Make");
			expect(after.value.metadata).not.toHaveProperty("IFD0:Artist");
			expect(after.value.metadata).toHaveProperty(
			"IFD0:Orientation",
			preservation.expectedOrientation ? "Rotate 90 CW" : undefined,
		);
			expect(after.value.metadata).toHaveProperty(
			"ICC_Profile:ProfileDescription",
			preservation.expectedColorProfile
				? "Nikon Adobe RGB 4.0.0.3000"
				: undefined,
		);
			expect(fs.statSync(destination).mtimeMs === sourceStats.mtimeMs).toBe(
				preservation.expectedTimestampMatch,
			);
		} finally {
			await process.close();
		}
	});
});
