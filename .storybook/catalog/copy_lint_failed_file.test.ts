import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import en from "../../.resources/locales/en.json";
import type { FileEntry } from "../../src/renderer/contexts/AppContext";
import { normalizeForLint } from "./copy_lint.mjs";
import { repoRoot } from "./temp_repo";

// D-11: a failed file says what happened to the original. The table is keyed by
// the real failureKind union, so a new kind breaks `yarn typecheck` until it
// has a row here; each row is tied to the renderer source and the en key.
type FailureKind = NonNullable<FileEntry["failureKind"]>;
type Claim = "original-unchanged" | "metadata-removed";

const FAILED_FILE = {
	write: { key: "writeFailedSummary", claim: "original-unchanged" },
	verification: {
		key: "verificationFailedSummary",
		claim: "original-unchanged",
	},
	cleanup: { key: "cleanupFailedSummary", claim: "original-unchanged" },
	commit: { key: "commitFailedSummary", claim: "original-unchanged" },
	refused: { key: "outcome.refusedRaf", claim: "original-unchanged" },
	// In overwrite mode the file WAS cleaned, so claiming "original unchanged"
	// would be false: this row pins the honest claim instead.
	xattr: { key: "xattrFailedSummary", claim: "metadata-removed" },
} satisfies Record<FailureKind, { key: string; claim: Claim }>;

const FILE_ROW = fs.readFileSync(
	path.join(repoRoot, "src/renderer/components/file-list/FileRow.tsx"),
	"utf8",
);

const ORIGINAL_UNCHANGED = /\boriginal\b[^.]*\bunchanged\b/i;
const METADATA_REMOVED = /\bmetadata (was|were) removed\b/i;
const FAILED_KEY = /FailedSummary$|^outcome\.refused/;

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Every way the failed-file promise can be broken, for a dictionary and a
// FileRow source passed in so mutated clones never touch the real files.
function failedFileProblems({
	dictionary,
	fileRowSource,
}: {
	dictionary: Record<string, string>;
	fileRowSource: string;
}): string[] {
	const problems: string[] = [];
	for (const [kind, row] of Object.entries(FAILED_FILE)) {
		const value = dictionary[row.key];
		if (value === undefined) {
			problems.push(`${kind}: ${row.key} is missing from en.json`);
			continue;
		}
		const text = normalizeForLint(value);
		if (row.claim === "original-unchanged") {
			if (!ORIGINAL_UNCHANGED.test(text)) {
				problems.push(
					`${kind}: ${row.key} does not say the original is unchanged`,
				);
			}
		} else if (!METADATA_REMOVED.test(text) || /unchanged/i.test(text)) {
			problems.push(
				`${kind}: ${row.key} must say the metadata was removed and never claim unchanged`,
			);
		}
		const tie = new RegExp(
			`failureKind === "${kind}"\\s*\\?\\s*t\\("${escapeRegExp(row.key)}"\\)`,
		);
		if (!tie.test(fileRowSource)) {
			problems.push(`${kind}: FileRow.tsx does not map it to ${row.key}`);
		}
	}
	const listed = new Set(Object.values(FAILED_FILE).map((row) => row.key));
	for (const key of Object.keys(dictionary)) {
		if (FAILED_KEY.test(key) && !listed.has(key)) {
			problems.push(`${key}: a failed-file string that is not in the table`);
		}
	}
	return problems;
}

const DICTIONARY: Record<string, string> = en;

describe("the failed-file rule (D-11)", () => {
	test("the table covers exactly the six failure kinds", () => {
		expect(Object.keys(FAILED_FILE).sort()).toEqual([
			"cleanup",
			"commit",
			"refused",
			"verification",
			"write",
			"xattr",
		]);
	});

	test("the real strings keep their promise and FileRow.tsx maps every kind", () => {
		expect(
			failedFileProblems({ dictionary: DICTIONARY, fileRowSource: FILE_ROW }),
		).toEqual([]);
	});

	test("shown red: original-unchanged removed", () => {
		const text = DICTIONARY["writeFailedSummary"] ?? "";
		const dictionary = {
			...DICTIONARY,
			writeFailedSummary: text
				.replace("Your original is unchanged.", "")
				.trim(),
		};
		expect(failedFileProblems({ dictionary, fileRowSource: FILE_ROW })).toEqual(
			["write: writeFailedSummary does not say the original is unchanged"],
		);
	});

	test("shown red: xattr claims unchanged", () => {
		const dictionary = {
			...DICTIONARY,
			xattrFailedSummary: `${DICTIONARY["xattrFailedSummary"] ?? ""} Your original is unchanged.`,
		};
		expect(failedFileProblems({ dictionary, fileRowSource: FILE_ROW })).toEqual(
			[
				"xattr: xattrFailedSummary must say the metadata was removed and never claim unchanged",
			],
		);
	});

	test("shown red: unlisted FailedSummary key", () => {
		const dictionary = {
			...DICTIONARY,
			"planted.FailedSummary": "Couldn't do it. Your original is unchanged.",
		};
		expect(failedFileProblems({ dictionary, fileRowSource: FILE_ROW })).toEqual(
			["planted.FailedSummary: a failed-file string that is not in the table"],
		);
	});

	test("shown red: FileRow tie", () => {
		const planted = FILE_ROW.replace(
			't("writeFailedSummary")',
			't("commitFailedSummary")',
		);
		expect(planted).not.toBe(FILE_ROW);
		expect(
			failedFileProblems({ dictionary: DICTIONARY, fileRowSource: planted }),
		).toEqual(["write: FileRow.tsx does not map it to writeFailedSummary"]);
	});

	test("status.error is a label, not a failed-file message", () => {
		expect(FAILED_KEY.test("status.error")).toBe(false);
	});
});
