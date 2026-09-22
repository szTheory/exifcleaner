// Phase 51 D-28: a permanent negative control showing the shared TIFF tag assertion is red
// against the historical pre-fix argument list and green against the product adapter's
// arguments -- both halves calling the SAME retainedPrivateTags/gpsKeys/findSentinels
// assertion tiff-private-tags.spec.ts uses, so this cannot drift the way a re-typed
// assertion could. Per D-28/Phase 50 D-18b, no title here carries an NC- number: this test
// is a negative control in substance but deliberately not registered in the numbered NC
// ledger (tests/contracts/negative_control_evidence.test.ts), which pins only the v4.8
// native-seam controls. EXPECTED_CONTROL_TITLES and scripts/nc_evidence_gate.mjs are
// untouched by this file.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import {
	retainedPrivateTags,
	gpsKeys,
	findSentinels,
	readTiffGroupedTags,
	readSingleStrip,
} from "../helpers/tiff_probe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "../e2e/fixtures/sample.tif");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

const SENTINELS = ["ZZP51-DESC", "ZZP51-SOFT", "ZZP51-ARTIST", "ZZP51-COPY"];

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("TIFF private-tag assertion discriminates the defect from the fix (D-28)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	// Each `it` opens its own mkdtemp directory and, where ExifTool is used directly, its own
	// ExiftoolProcess -- opened and closed in `finally` -- so parallel vitest workers or an
	// interrupted run cannot share or corrupt state or touch the committed fixture.
	it("the pre-fix argument list leaves all four IFD0 private tags while removing GPS", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tiff-nc-prefix-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, "sample.tif");
		fs.copyFileSync(FIXTURE, source);
		const outputPath = path.join(dir, "sample-out.tif");
		const before = snapshotDir(dir);

		// The literal historical argument list from EVIDENCE F-2 -- the exact args in place
		// before the -CommonIFD0= fix.
		execFileSync(EXIFTOOL_PATH, [
			"-all=",
			"-TagsFromFile",
			"@",
			"-Orientation",
			"-ICC_Profile",
			"-o",
			outputPath,
			source,
		]);

		const after = snapshotDir(dir);
		assertDirEffect(before, after, {
			added: [path.basename(outputPath)],
			modified: [],
			removed: [],
			unchanged: ["sample.tif"],
		});

		const tags = readTiffGroupedTags(outputPath, EXIFTOOL_PATH);
		expect(retainedPrivateTags(tags, "IFD0")).toEqual([
			"IFD0:ImageDescription",
			"IFD0:Software",
			"IFD0:Artist",
			"IFD0:Copyright",
		]);
		expect(findSentinels(outputPath, SENTINELS)).toEqual(SENTINELS);
		expect(gpsKeys(tags)).toEqual([]);
	});

	// This half runs the arguments the product actually builds via sanitize(), so it cannot
	// drift from the real adapter the way a re-typed argument list could.
	it("the product adapter's default arguments remove all four IFD0 private tags and GPS", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tiff-nc-product-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, "sample.tif");
		fs.copyFileSync(FIXTURE, source);
		const sourceDigestBefore = sha256(source);
		const destination = path.join(dir, "sample-cleaned.tif");
		const before = snapshotDir(dir);

		const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process });
		await process.open();
		try {
			const result = await exiftool.sanitize({
				source,
				destination,
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveTimestamps: false,
			});
			expect(result).toEqual({ ok: true, value: undefined });
		} finally {
			await process.close();
		}

		const after = snapshotDir(dir);
		assertDirEffect(before, after, {
			added: [path.basename(destination)],
			modified: [],
			removed: [],
			unchanged: ["sample.tif"],
		});
		expect(sha256(source)).toBe(sourceDigestBefore);

		const tags = readTiffGroupedTags(destination, EXIFTOOL_PATH);
		expect(retainedPrivateTags(tags, "IFD0")).toEqual([]);
		expect(findSentinels(destination, SENTINELS)).toEqual([]);
		expect(gpsKeys(tags)).toEqual([]);
	});

	it("the strip-content comparison detects a one-byte pixel change", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tiff-nc-strip-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, "sample.tif");
		fs.copyFileSync(FIXTURE, source);
		const destination = path.join(dir, "sample-cleaned.tif");
		const flipped = path.join(dir, "sample-cleaned-flipped.tif");
		const before = snapshotDir(dir);

		const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process });
		await process.open();
		try {
			const result = await exiftool.sanitize({
				source,
				destination,
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveTimestamps: false,
			});
			expect(result).toEqual({ ok: true, value: undefined });
		} finally {
			await process.close();
		}

		const pristineStrip = readSingleStrip(FIXTURE, "IFD0", EXIFTOOL_PATH);
		const outputStrip = readSingleStrip(destination, "IFD0", EXIFTOOL_PATH);
		expect(outputStrip.bytes.equals(pristineStrip.bytes)).toBe(true);

		// Flip the first byte of the output's strip and confirm the comparator now
		// disagrees -- proving the comparison actually discriminates, not just returns true.
		const flippedBytes = fs.readFileSync(destination);
		flippedBytes[outputStrip.offset] = flippedBytes[outputStrip.offset]! ^ 0xff;
		fs.writeFileSync(flipped, flippedBytes);

		const after = snapshotDir(dir);
		assertDirEffect(before, after, {
			added: [path.basename(destination), path.basename(flipped)],
			modified: [],
			removed: [],
			unchanged: ["sample.tif"],
		});

		const flippedStrip = readSingleStrip(flipped, "IFD0", EXIFTOOL_PATH);
		expect(flippedStrip.bytes.equals(pristineStrip.bytes)).toBe(false);
	});
});
