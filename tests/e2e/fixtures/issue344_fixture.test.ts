import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ExiftoolProcess } from "../../../src/infrastructure/exiftool/ExiftoolProcess";
import { ExifToolAdapter } from "../../../src/infrastructure/exiftool/exiftool_adapter";
import { ReadMetadataQuery } from "../../../src/application/queries/read_metadata_query";
import { VerifyGeneratedOutputQuery } from "../../../src/application/queries/verify_generated_output_query";
import { classifyInspectionDiagnostics } from "../../../src/infrastructure/exiftool/exiftool_diagnostics";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = __dirname;
const EXIFTOOL =
	process.platform === "win32"
		? path.resolve(__dirname, "../../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../../.resources/nix/bin/exiftool");

// Pinned per this repo's own fixture-governance convention
// (tests/e2e/fixtures/fixture_integrity.test.ts:17-19's RAF_SHA256/RAF_SIZE_BYTES) --
// hardcoded constants asserted directly, not a JSON manifest schema (Phase 46's corpus
// manifest governs a different repo and format and does not transfer here).
const ISSUE_344_MICROSOFT_PHOTO_FIXTURE = "issue344_microsoft_photo.jpg";
const ISSUE_344_MICROSOFT_PHOTO_SHA256 =
	"bec21360ee22aa8c85ab79bc031201c047ffd5bd0b7b3186054386614329d37d";
const ISSUE_344_MICROSOFT_PHOTO_SIZE_BYTES = 723;
const ISSUE_344_EXPECTED_WARNING =
	"[minor] Fixed incorrect URI for xmlns:MicrosoftPhoto";

// D-06 settlement fixture (Task 2): the same MicrosoftPhoto XMP defect PLUS an independent
// non-minor ExifTool-group diagnostic (corrupted EXIF IFD1 value offset) on one record.
const ISSUE_344_COOCCURRENCE_FIXTURE = "issue344_cooccurrence.jpg";
const ISSUE_344_COOCCURRENCE_SHA256 =
	"5b4769bdf1afde6ad6228e30fec3c309277dbe81aa33b02c9b6d69596fe8dde0";
const ISSUE_344_COOCCURRENCE_SIZE_BYTES = 765;
const ISSUE_344_COOCCURRENCE_NON_MINOR_WARNING = "Bad offset for IFD1 Make";

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("issue #344 fixture pins", () => {
	it("pins the MicrosoftPhoto fixture's genuine bytes (SHA-256 and size)", () => {
		const filePath = path.join(FIXTURES_DIR, ISSUE_344_MICROSOFT_PHOTO_FIXTURE);
		expect(sha256(filePath)).toBe(ISSUE_344_MICROSOFT_PHOTO_SHA256);
		expect(fs.statSync(filePath).size).toBe(
			ISSUE_344_MICROSOFT_PHOTO_SIZE_BYTES,
		);
	});

	it("pins the co-occurrence fixture's genuine bytes (SHA-256 and size)", () => {
		const filePath = path.join(FIXTURES_DIR, ISSUE_344_COOCCURRENCE_FIXTURE);
		expect(sha256(filePath)).toBe(ISSUE_344_COOCCURRENCE_SHA256);
		expect(fs.statSync(filePath).size).toBe(ISSUE_344_COOCCURRENCE_SIZE_BYTES);
	});
});

describe("issue #344 end-to-end: one path only", () => {
	const process_ = new ExiftoolProcess({ binPath: EXIFTOOL });
	const adapter = new ExifToolAdapter({ process: process_ });
	const readMetadataQuery = new ReadMetadataQuery({ exiftool: adapter });
	const verifyGeneratedOutputQuery = new VerifyGeneratedOutputQuery({
		exiftool: adapter,
	});

	beforeAll(async () => {
		await adapter.open();
	});

	afterAll(async () => {
		await adapter.close();
	});

	it("the display path is lenient on a [minor] MicrosoftPhoto warning (NC-vacuity target)", async () => {
		const filePath = path.join(FIXTURES_DIR, ISSUE_344_MICROSOFT_PHOTO_FIXTURE);
		const result = await readMetadataQuery.execute({ filePath });
		expect(result.ok).toBe(true);
	});

	it("the output-verification path stays strict on the same [minor] warning (D-03 mode scoping, NC-2)", async () => {
		const filePath = path.join(FIXTURES_DIR, ISSUE_344_MICROSOFT_PHOTO_FIXTURE);
		const result = await verifyGeneratedOutputQuery.execute({
			generatedPath: filePath,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("output-verification-failed");
		}
	});

	it("the bundled binary emits exactly the expected [minor] warning value (D-10 text-drift guard)", () => {
		const filePath = path.join(FIXTURES_DIR, ISSUE_344_MICROSOFT_PHOTO_FIXTURE);
		const output = execFileSync(EXIFTOOL, ["-j", "-G1:2", filePath], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		const parsed = JSON.parse(output) as Record<string, unknown>[];
		expect(parsed).toHaveLength(1);
		expect(parsed[0]!["ExifTool:Warning"]).toBe(ISSUE_344_EXPECTED_WARNING);
	});

	it("the display path stays fatal when a non-minor warning co-occurs with the [minor] one (D-06/NC-4: a benign warning must never mask a serious sibling)", async () => {
		const filePath = path.join(FIXTURES_DIR, ISSUE_344_COOCCURRENCE_FIXTURE);
		const result = await readMetadataQuery.execute({ filePath });

		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("exiftool-error");
		if (result.error.code === "exiftool-error") {
			expect(result.error.detail).toBe(
				ISSUE_344_COOCCURRENCE_NON_MINOR_WARNING,
			);
		}
	});

	// P48-NC-4 (48-02-PLAN.md Task 1): must run through ReadMetadataQuery against a real
	// ExifToolAdapter over the bundled binary and the committed cooccurrence fixture, not a
	// hand-built object -- a hand-built object cannot prove what ExifTool's own JSON
	// serialization does under co-occurrence. Named mutation: revert D-05's full scan back
	// to a first-match predicate (.find).
	it("P48-NC-4: a record carrying both a minor and a non-minor warning is fatal on display", async () => {
		const filePath = path.join(FIXTURES_DIR, ISSUE_344_COOCCURRENCE_FIXTURE);
		const result = await readMetadataQuery.execute({ filePath });

		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("exiftool-error");
		if (result.error.code === "exiftool-error") {
			expect(result.error.detail).toBe(
				ISSUE_344_COOCCURRENCE_NON_MINOR_WARNING,
			);
		}
	});
});

describe("classifyInspectionDiagnostics purity (TRI-01 concurrency edge)", () => {
	it("two interleaved calls over one frozen record return per-purpose verdicts and never mutate the record", () => {
		const record = Object.freeze({
			"ExifTool:Warning": ISSUE_344_EXPECTED_WARNING,
		});
		const before = JSON.parse(JSON.stringify(record)) as Record<
			string,
			unknown
		>;

		const displayVerdict = classifyInspectionDiagnostics({
			record,
			purpose: "display",
		});
		const verificationVerdict = classifyInspectionDiagnostics({
			record,
			purpose: "output-verification",
		});

		expect(displayVerdict.fatal).toBe(false);
		expect(verificationVerdict.fatal).toBe(true);
		expect(record).toEqual(before);
	});
});
