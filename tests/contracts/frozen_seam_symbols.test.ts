// ROADMAP SC1 and D-18 (Phase 63): the native seam and the standing code rules in CLAUDE.md
// stay unedited while HEIC/HEIF/AVIF adoption lands around them. Each pinned item below is
// extracted from its source file by literal anchor scanning (no regular expressions) and
// compared by sha256 of the extracted text, so an edit to the symbol fails here while edits
// elsewhere in the same file (file_types.ts and hybrid_metadata_engine.ts are legitimately
// edited by other Phase 63 plans) do not.
//
// A pin changes only under a requirement that names the symbol. A red pin is a
// stop-and-report, never a reason to update the hash.
//
// Pinned (hashes recorded from origin/master 9a52398):
//   1. NativeSanitizeRequest      (native_metadata_port.ts)
//   2. NativeMetadataPort         (native_metadata_port.ts)
//   3. isNativeCopyCandidate      (hybrid_metadata_engine.ts, the method)
//   4. MEDIA_EXTENSIONS           (file_types.ts, through its closing "]);")
//   5. isMediaFile                (file_types.ts)
//   6. the beforeTags === 0 early-exit block (use_process_files.ts, origin/master lines 30-52)
//   7. scripts/phase25_public_state_gate.mjs (whole file)
//
// Extraction fails loudly when an anchor is missing or braces do not balance; it never
// returns an empty string that could hash to a stable-looking value.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string): string {
	return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function sha256(text: string): string {
	return crypto.createHash("sha256").update(text).digest("hex");
}

function requireAnchor(source: string, startAnchor: string): number {
	const start = source.indexOf(startAnchor);
	if (start === -1) {
		throw new Error(`anchor not found: ${startAnchor}`);
	}
	if (source.indexOf(startAnchor, start + 1) !== -1) {
		throw new Error(`anchor is not unique: ${startAnchor}`);
	}
	return start;
}

// Brace-balanced block starting at the anchor. The opening brace is the first "{" that
// ends a line after the anchor, so destructured parameters such as `({ filename }: P)`
// are not mistaken for the body.
function extractBlock(source: string, startAnchor: string): string {
	const start = requireAnchor(source, startAnchor);
	let open = -1;
	for (let i = start; i < source.length - 1; i++) {
		if (source[i] === "{" && source[i + 1] === "\n") {
			open = i;
			break;
		}
	}
	if (open === -1) {
		throw new Error(
			`no line-ending opening brace after anchor: ${startAnchor}`,
		);
	}
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === "{") depth++;
		if (source[i] === "}") {
			depth--;
			if (depth === 0) return source.slice(start, i + 1);
		}
	}
	throw new Error(`unbalanced braces after anchor: ${startAnchor}`);
}

function extractThrough(
	source: string,
	startAnchor: string,
	endLiteral: string,
): string {
	const start = requireAnchor(source, startAnchor);
	const end = source.indexOf(endLiteral, start);
	if (end === -1) {
		throw new Error(`end literal not found after anchor: ${startAnchor}`);
	}
	return source.slice(start, end + endLiteral.length);
}

const PORT = "src/infrastructure/metadata/native_metadata_port.ts";
const ENGINE = "src/infrastructure/metadata/hybrid_metadata_engine.ts";
const FILE_TYPES = "src/domain/files/file_types.ts";
const HOOK = "src/renderer/hooks/use_process_files.ts";
const PHASE25_GATE = "scripts/phase25_public_state_gate.mjs";

interface Pin {
	readonly label: string;
	readonly extract: () => string;
	readonly sha256: string;
}

const PINS: readonly Pin[] = [
	{
		label: "NativeSanitizeRequest",
		extract: () =>
			extractBlock(read(PORT), "export interface NativeSanitizeRequest {"),
		sha256: "1422298ed2f09140d37290e0b008873d272dcf7d634fe3818984a62b59102dcb",
	},
	{
		label: "NativeMetadataPort",
		extract: () =>
			extractBlock(read(PORT), "export interface NativeMetadataPort {"),
		sha256: "505ee96030c822826ec85a5811096263d1125507fa8a1fdd1ee1d2b2ece70fee",
	},
	{
		label: "isNativeCopyCandidate",
		extract: () => extractBlock(read(ENGINE), "private isNativeCopyCandidate("),
		sha256: "c43ea0a94b5fb77b32e92008c2cd6e55bdc685aabf350e619ae1f48fca45dd78",
	},
	{
		label: "MEDIA_EXTENSIONS",
		extract: () =>
			extractThrough(read(FILE_TYPES), "export const MEDIA_EXTENSIONS", "]);"),
		sha256: "f864b5620d7b9f9ade521aac3c0d508cf35fed5d796c58d08b3e713e9c2dabc2",
	},
	{
		label: "isMediaFile",
		extract: () =>
			extractBlock(read(FILE_TYPES), "export function isMediaFile"),
		sha256: "63959878d3d003e1befe4f13e5a2e8c777189ff1c4220b67d57417cf85c7d1fd",
	},
	{
		label: "use_process_files beforeTags === 0 early exit",
		extract: () =>
			extractBlock(
				read(HOOK),
				"if (beforeTags === 0 && !settings.removeXattrs) {",
			),
		sha256: "e2b5e280ac2f35b1ddb74329f878746353a4653e156ab6ec0804d24efe8c3fcd",
	},
	{
		label: "scripts/phase25_public_state_gate.mjs",
		extract: () => read(PHASE25_GATE),
		sha256: "a0b3589ac3363451ffe808d913f68784f362f4e4cbed9016ab73d25a3e0a06e6",
	},
];

describe("frozen seam symbols are unedited (ROADMAP SC1, D-18)", () => {
	it("pins exactly seven items", () => {
		expect(PINS).toHaveLength(7);
	});

	it.each(PINS.map((pin) => [pin.label, pin] as const))(
		"%s matches its origin/master text",
		(_label, pin) => {
			const text = pin.extract();
			expect(text.length).toBeGreaterThan(40);
			expect(sha256(text)).toBe(pin.sha256);
		},
	);

	it("extractBlock fails on a missing anchor instead of passing silently", () => {
		expect(() =>
			extractBlock("const a = 1;\n", "export interface Nope {"),
		).toThrow("anchor not found");
	});
});
