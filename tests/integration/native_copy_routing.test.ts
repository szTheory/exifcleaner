// 58-01 tracer (ADP-01, ADP-02): real-bytes proof that extension-identified routing sends
// PNG/JPEG copy requests to the real native engine and WebP-with-resolution to the real
// bundled ExifTool, through the real HybridMetadataEngine — no fakes, no mocks of the engines
// themselves (only vi.spyOn call-count tracking, mirroring native_metadata_oracle.test.ts).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../e2e/fixtures");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("58-01: extension-identified native copy routing with real bytes", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function makeTempDir(prefix: string): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
		temporaryDirs.push(dir);
		return dir;
	}

	it("routes an orientation.jpg copy request to native, never ExifTool, preserving orientation", async () => {
		const dir = makeTempDir("native-copy-routing-jpeg-");
		const source = path.join(dir, "orientation.jpg");
		const destination = path.join(dir, "orientation-cleaned.jpg");
		fs.copyFileSync(path.join(FIXTURES, "orientation.jpg"), source);
		const sourceDigest = sha256(source);
		const beforeDir = snapshotDir(dir);

		const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process });
		const native = new NativeMetadataAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");

		await process.open();
		try {
			const result = await hybrid.sanitize({
				source,
				destination,
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});

			expect(result).toEqual({ ok: true, value: undefined });
			expect(nativeWrite).toHaveBeenCalledOnce();
			expect(exiftoolWrite).not.toHaveBeenCalled();
			expect(fs.existsSync(destination)).toBe(true);
			expect(sha256(source)).toBe(sourceDigest);

			assertDirEffect(beforeDir, snapshotDir(dir), {
				unchanged: ["orientation.jpg"],
				added: ["orientation-cleaned.jpg"],
				modified: [],
				removed: [],
			});

			const after = await exiftool.inspect({
				source: destination,
				purpose: "display",
			});
			expect(after).toMatchObject({ ok: true });
			if (!after.ok) return;
			expect(after.value.metadata).toHaveProperty(
				"Image:Orientation",
				"Rotate 90 CW",
			);
		} finally {
			await process.close();
		}
	});

	it("routes a sample.png copy request to native, never ExifTool", async () => {
		const dir = makeTempDir("native-copy-routing-png-");
		const source = path.join(dir, "sample.png");
		const destination = path.join(dir, "sample-cleaned.png");
		fs.copyFileSync(path.join(FIXTURES, "sample.png"), source);
		const sourceDigest = sha256(source);
		const beforeDir = snapshotDir(dir);

		const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process });
		const native = new NativeMetadataAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");

		await process.open();
		try {
			const result = await hybrid.sanitize({
				source,
				destination,
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});

			expect(result).toEqual({ ok: true, value: undefined });
			expect(nativeWrite).toHaveBeenCalledOnce();
			expect(exiftoolWrite).not.toHaveBeenCalled();
			expect(fs.existsSync(destination)).toBe(true);
			expect(sha256(source)).toBe(sourceDigest);

			assertDirEffect(beforeDir, snapshotDir(dir), {
				unchanged: ["sample.png"],
				added: ["sample-cleaned.png"],
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
				/PNG/u,
			);
		} finally {
			await process.close();
		}
	});

	it("routes a WebP copy request with preserveResolution true to ExifTool, never native, keeping IFD0 XResolution", async () => {
		const dir = makeTempDir("native-copy-routing-webp-on-");
		const source = path.join(dir, "sample.webp");
		const destination = path.join(dir, "sample-cleaned.webp");
		fs.copyFileSync(path.join(FIXTURES, "sample.webp"), source);
		execFileSync(EXIFTOOL_PATH, [
			"-overwrite_original",
			"-IFD0:XResolution=300",
			"-IFD0:YResolution=300",
			"-IFD0:ResolutionUnit=inches",
			source,
		]);
		const sourceDigest = sha256(source);
		const beforeDir = snapshotDir(dir);

		const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process });
		const native = new NativeMetadataAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");

		await process.open();
		try {
			const result = await hybrid.sanitize({
				source,
				destination,
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});

			expect(result).toMatchObject({ ok: true });
			expect(nativeWrite).not.toHaveBeenCalled();
			expect(exiftoolWrite).toHaveBeenCalledOnce();
			expect(fs.existsSync(destination)).toBe(true);
			expect(sha256(source)).toBe(sourceDigest);

			assertDirEffect(beforeDir, snapshotDir(dir), {
				unchanged: ["sample.webp"],
				added: ["sample-cleaned.webp"],
				modified: [],
				removed: [],
			});

			const after = await exiftool.inspect({
				source: destination,
				purpose: "display",
			});
			expect(after).toMatchObject({ ok: true });
			if (!after.ok) return;
			expect(after.value.metadata).toHaveProperty("Image:XResolution", 300);
		} finally {
			await process.close();
		}
	});

	it("routes the same seeded WebP with preserveResolution false to native, never ExifTool", async () => {
		const dir = makeTempDir("native-copy-routing-webp-off-");
		const source = path.join(dir, "sample.webp");
		const destination = path.join(dir, "sample-cleaned.webp");
		fs.copyFileSync(path.join(FIXTURES, "sample.webp"), source);
		execFileSync(EXIFTOOL_PATH, [
			"-overwrite_original",
			"-IFD0:XResolution=300",
			"-IFD0:YResolution=300",
			"-IFD0:ResolutionUnit=inches",
			source,
		]);
		const sourceDigest = sha256(source);
		const beforeDir = snapshotDir(dir);

		const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process });
		const native = new NativeMetadataAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");

		await process.open();
		try {
			const result = await hybrid.sanitize({
				source,
				destination,
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: false,
				preserveTimestamps: false,
			});

			expect(result).toEqual({ ok: true, value: undefined });
			expect(nativeWrite).toHaveBeenCalledOnce();
			expect(exiftoolWrite).not.toHaveBeenCalled();
			expect(fs.existsSync(destination)).toBe(true);
			expect(sha256(source)).toBe(sourceDigest);

			assertDirEffect(beforeDir, snapshotDir(dir), {
				unchanged: ["sample.webp"],
				added: ["sample-cleaned.webp"],
				modified: [],
				removed: [],
			});
		} finally {
			await process.close();
		}
	});
});
