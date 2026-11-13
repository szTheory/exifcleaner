// Boundary fixtures for the area stories (Phase 73, D-17, STY-03): file names that stress
// bidirectional text, length and grapheme joining, and a deterministic batch of rows.
//
// Test support in the production source tree (V3): only *.stories.tsx files and
// story_support itself import it (.storybook/story_support_imports.test.ts), so it never
// reaches a bundle.
//
// Bidirectional controls (U+202A to U+202E, U+2066 to U+2069) are written as escapes,
// never as raw characters, so a reviewer reads them in a diff (Trojan Source,
// https://trojansource.codes/). Every non-ASCII character here is an escape for the same
// reason, and the stories assert the rendered name against a typed literal of the same
// escapes. Every name ends in a supported extension.
import { FileProcessingStatus } from "../../domain";
import type { FileEntry } from "../contexts/AppContext";
import { OUTCOME_CASES, entryFor, fileEntry } from "./process_outcomes";

// "report-" + Hebrew word + "-final.jpg": a right-to-left run inside a left-to-right name.
export const HEBREW_LATIN_NAME = "report-\u05E9\u05DC\u05D5\u05DD-final.jpg";

// Arabic words around Latin text and Arabic-Indic digits.
export const ARABIC_DIGITS_NAME =
	"\u062A\u0642\u0631\u064A\u0631-photo-\u0661\u0662\u0663-\u0627\u0644\u0646\u0647\u0627\u064A\u0629.png";

// A right-to-left override (U+202E) with no pop: the tail displays reversed.
export const RLO_NAME = "holiday\u202Egnp.jpg";

// A left-to-right override and a right-to-left override, each closed by a pop (U+202C).
export const LRO_PDF_NAME = "scan-\u202Dabc\u202C-\u202Edef\u202C.png";

// 180 UTF-16 code units in total, extension included (String.length counts code units,
// not graphemes); the stories assert the length so a builder change cannot shorten it.
export const LONG_UNBROKEN_NAME = "a".repeat(180 - ".jpg".length) + ".jpg";

// A family emoji joined by zero width joiners (U+200D), four code points that draw as one.
export const ZWJ_FAMILY_NAME =
	"family-\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}.png";

// A run of 16 dots before the extension.
export const MANY_DOTS_NAME = "archive" + ".".repeat(16) + "jpg";

// A long German compound word (a, o and u with umlauts as escapes).
export const GERMAN_COMPOUND_NAME =
	"Donaudampfschifffahrtsgesellschaftskapit\u00E4nsm\u00FCtze-Urlaubsfoto.jpg";

// A long Japanese name with no spaces to wrap at.
export const JAPANESE_LONG_NAME =
	"\u6771\u4EAC\u306E\u5915\u66AE\u308C\u524D\u306B\u64AE\u5F71\u3057\u305F\u5BB6\u65CF\u65C5\u884C\u306E\u5199\u771F\u3068\u52D5\u753B\u3092\u3059\u3079\u3066\u307E\u3068\u3081\u305F\u9577\u3044\u30D5\u30A1\u30A4\u30EB\u540D.jpg";

// The name of the zero-byte file; the stories give the entry size 0.
export const ZERO_BYTE_NAME = "empty.jpg";

const BATCH_EXTENSIONS = ["JPG", "PNG", "WEBP", "HEIC"] as const;

// Rows a real run can show mid-batch: Complete rows come from the real reducer fold of the
// cleaned case (so each carries outcomeKind cleaned and the tag counts the pipeline
// dispatches before Complete, use_process_files.ts), Pending and Processing rows are bare
// entries (the pipeline sets their tag counts later). No Error or NoMetadataFound row.
const BATCH_STATUSES = [
	FileProcessingStatus.Complete,
	FileProcessingStatus.Pending,
	FileProcessingStatus.Processing,
] as const;

// Pure and index-derived: no random source, no clock, no module state, so every story run
// and both themes see identical rows. Size is a Knuth multiplicative hash of the index,
// held in uint32 by the `>>> 0`; status and extension cycle with the index.
export function batch(count: number): FileEntry[] {
	const rows: FileEntry[] = [];
	for (let i = 0; i < count; i++) {
		const extension = BATCH_EXTENSIONS[i % BATCH_EXTENSIONS.length] ?? "JPG";
		const status =
			BATCH_STATUSES[i % BATCH_STATUSES.length] ?? FileProcessingStatus.Pending;
		const name = `batch-photo-${i}.${extension.toLowerCase()}`;
		const identity = {
			id: `batch-${i}`,
			path: `/batch/${name}`,
			name,
			size: (i * 2654435761) >>> 0,
			extension,
		};
		rows.push(
			status === FileProcessingStatus.Complete
				? entryFor(OUTCOME_CASES.cleaned, identity)
				: fileEntry({ ...identity, status }),
		);
	}
	return rows;
}
