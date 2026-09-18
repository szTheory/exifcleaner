// D-27 NC-9: three source-scanning containment gates, each individually negative-controlled,
// mirroring scripts/dir_effect_gate.mjs's house convention (prose header, plain literal
// alternation with no nested/overlapping quantifiers, a self-pruning EXEMPT map, and a
// companion literal-fixture proof that each gate can actually fire).
//
// - NC-9a: the "exifcleaner-node" library package specifier is imported only from a known,
//   deliberate, small allowlist of sites under src/ — never sprawled.
// - NC-9b: the deleted error-code identifier ("nativeCode") appears zero times in the hybrid
//   engine module, so D-05's removed switch cannot silently be reintroduced there.
// - NC-9c: the fallback-authority grant brand identifier appears only in its own mint module.
//
// TREE-VS-PLAN FINDING (hard constraint 6/12, recorded here and in the SUMMARY): the plan's
// literal NC-9a wording ("imported from exactly one module — the native adapter") and its
// verify command's `-le 2` bound both predate 47-02's D-07 fix. At authoring time three files
// legitimately import "exifcleaner-node" under src/: native_metadata_adapter.ts (the sanctioned
// adapter), native_fallback_authority.ts (D-06's mint module needs classifyFallback/
// MetadataError to mint authority from real proof), and src/domain/exif/exif_errors.ts (D-07's
// explicit-field-mapping fix needs MetadataError to type phase/nativeWrite without a cast). The
// tree is the truth: NC-9a below pins this exact three-file allowlist, self-pruning if any
// exemption entry stops being genuinely needed, rather than restating the plan's stale count.
//
// Scanned band: everything under src/ (recursively), EXCLUDING tests/contracts/ (this
// directory is not under src/ at all, so no scan ever touches this file — comment-text
// discipline holds trivially here, unlike the D-28 contract-freeze test).

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");
const SRC_DIR = path.join(REPO_ROOT, "src");

interface ScannedFile {
	readonly path: string; // relative to REPO_ROOT, posix separators
	readonly content: string;
}

function walkTsFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of fs.readdirSync(dir)) {
		const absolute = path.join(dir, name);
		const stat = fs.statSync(absolute);
		if (stat.isDirectory()) {
			out.push(...walkTsFiles(absolute));
			continue;
		}
		if (absolute.endsWith(".ts") || absolute.endsWith(".tsx")) {
			out.push(absolute);
		}
	}
	return out;
}

function loadSrcFiles(): ScannedFile[] {
	return walkTsFiles(SRC_DIR).map((absolute) => ({
		path: path.relative(REPO_ROOT, absolute).split(path.sep).join("/"),
		content: fs.readFileSync(absolute, "utf8"),
	}));
}

// ---------------------------------------------------------------------------------------
// NC-9a: "exifcleaner-node" import confinement
// ---------------------------------------------------------------------------------------

// Plain literal string containment — no regex, no quantifiers, nothing that could
// pathologically backtrack against the gate itself (V5 / dir_effect_gate.mjs convention).
const LIBRARY_IMPORT_TOKEN = 'from "exifcleaner-node"';

const ADAPTER_IMPORT_PATH =
	"src/infrastructure/metadata/native_metadata_adapter.ts";

// Self-pruning exemption map (dir_effect_gate.mjs convention): each entry is a KNOWN,
// PERMANENT, COUNTABLE additional site allowed to import the library beyond the adapter.
// An entry is stale — and therefore a FAILURE — the moment its file no longer imports the
// library at all (see checkImportExemptionsAreLive below). Do not add an entry here to
// silence a real leak; the gap closes by removing the import, not by exempting it.
const LIBRARY_IMPORT_EXEMPTIONS = new Map<string, string>([
	[
		"src/infrastructure/metadata/native_fallback_authority.ts",
		"D-06: the sole mint module needs the library's own classifyFallback and " +
			"MetadataError to mint fallback authority from real proof, never a restated table.",
	],
	[
		"src/domain/exif/exif_errors.ts",
		"D-07: explicit field mapping needs the library's MetadataError type to declare " +
			"phase/nativeWrite on NativeMetadataError without an unsafe cast.",
	],
]);

/**
 * Pure classifier for NC-9a. Given the full set of scanned files, returns the relative paths
 * of any file OTHER than the adapter or a live exemption that imports "exifcleaner-node".
 */
function findLibraryImportViolations(files: readonly ScannedFile[]): string[] {
	const violations: string[] = [];
	for (const file of files) {
		if (!file.content.includes(LIBRARY_IMPORT_TOKEN)) continue;
		if (file.path === ADAPTER_IMPORT_PATH) continue;
		if (LIBRARY_IMPORT_EXEMPTIONS.has(file.path)) continue;
		violations.push(file.path);
	}
	return violations;
}

/**
 * Stale-exemption check: an exemption is stale (and must fail) if its file no longer imports
 * the library at all — i.e. the exemption is no longer genuinely needed and must be pruned.
 */
function findStaleImportExemptions(files: readonly ScannedFile[]): string[] {
	const byPath = new Map(files.map((file) => [file.path, file]));
	const stale: string[] = [];
	for (const [relPath] of LIBRARY_IMPORT_EXEMPTIONS) {
		const file = byPath.get(relPath);
		if (file === undefined) {
			stale.push(`${relPath} no longer exists`);
			continue;
		}
		if (!file.content.includes(LIBRARY_IMPORT_TOKEN)) {
			stale.push(`${relPath} no longer imports "exifcleaner-node"`);
		}
	}
	return stale;
}

// ---------------------------------------------------------------------------------------
// NC-9b: zero "nativeCode" identifier occurrences in the hybrid engine
// ---------------------------------------------------------------------------------------

const HYBRID_ENGINE_PATH =
	"src/infrastructure/metadata/hybrid_metadata_engine.ts";

/**
 * Pure classifier for NC-9b: counts whole-word occurrences of `identifier` in `content`.
 * Word-boundary anchors only — a single, non-nested, non-overlapping quantifier-free regex.
 */
function countIdentifierOccurrences({
	content,
	identifier,
}: {
	content: string;
	identifier: string;
}): number {
	const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`\\b${escaped}\\b`, "g");
	const matches = content.match(pattern);
	return matches === null ? 0 : matches.length;
}

// ---------------------------------------------------------------------------------------
// NC-9c: the fallback-authority grant brand appears only in its own mint module
// ---------------------------------------------------------------------------------------

const GRANT_BRAND_IDENTIFIER = "fallbackGrantBrand";
const MINT_MODULE_PATH =
	"src/infrastructure/metadata/native_fallback_authority.ts";

/**
 * Pure classifier for NC-9c: returns the relative paths of any file OTHER than the mint
 * module that references the grant brand identifier.
 */
function findGrantBrandLeaks(files: readonly ScannedFile[]): string[] {
	const violations: string[] = [];
	for (const file of files) {
		if (file.path === MINT_MODULE_PATH) continue;
		if (
			countIdentifierOccurrences({
				content: file.content,
				identifier: GRANT_BRAND_IDENTIFIER,
			}) > 0
		) {
			violations.push(file.path);
		}
	}
	return violations;
}

// ---------------------------------------------------------------------------------------
// Real-tree assertions
// ---------------------------------------------------------------------------------------

describe("NC-9a: exifcleaner-node import confinement", () => {
	it("NC-9a: the library is imported only by the native adapter and its live exemptions", () => {
		const files = loadSrcFiles();
		expect(files.length).toBeGreaterThan(0);
		const violations = findLibraryImportViolations(files);
		expect(violations).toEqual([]);
	});

	it("NC-9a: every declared import exemption is still live (not stale)", () => {
		const files = loadSrcFiles();
		const stale = findStaleImportExemptions(files);
		expect(stale).toEqual([]);
	});

	it("NC-9a negative control: a synthetic file outside the adapter/exemptions importing the library is reported as a violation", () => {
		const syntheticFiles: ScannedFile[] = [
			{
				path: "src/renderer/some_unrelated_module.ts",
				content: 'import { sanitizeFile } from "exifcleaner-node";',
			},
			{
				path: ADAPTER_IMPORT_PATH,
				content: 'import { sanitizeFile } from "exifcleaner-node";',
			},
		];
		const violations = findLibraryImportViolations(syntheticFiles);
		expect(violations).toEqual(["src/renderer/some_unrelated_module.ts"]);
	});

	it("NC-9a negative control: an exemption whose file no longer imports the library is reported stale", () => {
		const syntheticFiles: ScannedFile[] = [
			{
				path: "src/infrastructure/metadata/native_fallback_authority.ts",
				// No longer imports the library — this exemption should now be pruned.
				content: "export const nothingHere = true;",
			},
			{
				path: "src/domain/exif/exif_errors.ts",
				content: 'import type { MetadataError } from "exifcleaner-node";',
			},
		];
		const stale = findStaleImportExemptions(syntheticFiles);
		expect(stale).toEqual([
			'src/infrastructure/metadata/native_fallback_authority.ts no longer imports "exifcleaner-node"',
		]);
	});
});

describe("NC-9b: zero nativeCode identifier occurrences in the hybrid engine", () => {
	it("NC-9b: hybrid_metadata_engine.ts contains zero occurrences of the nativeCode identifier", () => {
		const absolute = path.join(REPO_ROOT, HYBRID_ENGINE_PATH);
		const content = fs.readFileSync(absolute, "utf8");
		const count = countIdentifierOccurrences({
			content,
			identifier: "nativeCode",
		});
		expect(count).toBe(0);
	});

	it("NC-9b negative control: a synthetic reintroduction of the deleted error-code switch is detected", () => {
		const synthetic = `
			switch (native.error.nativeCode) {
				case "malformed-file":
					return this.exiftool.sanitize(request);
				default:
					return native;
			}
		`;
		const count = countIdentifierOccurrences({
			content: synthetic,
			identifier: "nativeCode",
		});
		expect(count).toBeGreaterThan(0);
	});
});

describe("NC-9c: grant brand confined to its own mint module", () => {
	it("NC-9c: the grant brand identifier appears only in native_fallback_authority.ts", () => {
		const files = loadSrcFiles();
		expect(files.length).toBeGreaterThan(0);
		const leaks = findGrantBrandLeaks(files);
		expect(leaks).toEqual([]);
	});

	it("NC-9c negative control: a synthetic file outside the mint module referencing the brand is reported as a leak", () => {
		const syntheticFiles: ScannedFile[] = [
			{
				path: MINT_MODULE_PATH,
				content: "declare const fallbackGrantBrand: unique symbol;",
			},
			{
				path: "src/infrastructure/metadata/hybrid_metadata_engine.ts",
				content: "const forged = { [fallbackGrantBrand]: true };",
			},
		];
		const leaks = findGrantBrandLeaks(syntheticFiles);
		expect(leaks).toEqual([
			"src/infrastructure/metadata/hybrid_metadata_engine.ts",
		]);
	});
});
