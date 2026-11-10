// 69-11 (OVR-03, D-15, D-16): every limitation the staged overwrite has (NOTES_REQUIRED_FACTS)
// and every measured legacy-versus-staged difference (KNOWN_DIFFERENCES) must be stated in the
// release notes. The real RELEASE_NOTES.md is checked once the package version is 4.8.0 (the
// release this behaviour ships in); before that the check is skipped with a printed reason, and
// the in-memory controls below always run so the checker itself cannot go vacuous.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	KNOWN_DIFFERENCES,
	NOTES_REQUIRED_FACTS,
	missingNotesPhrases,
	type KnownDifference,
} from "../helpers/overwrite_parity";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const version = (
	JSON.parse(fs.readFileSync(`${ROOT}package.json`, "utf8")) as {
		version: string;
	}
).version;
const active = version === "4.8.0";

// A stand-in difference so the control covers the KNOWN_DIFFERENCES branch while the real list
// is empty.
const SAMPLE_DIFFERENCE: KnownDifference = {
	id: "sample-difference",
	observation: "a measured difference used only by this control",
	notesPhrase: "the measured sample difference",
};

function notesWith(skipId?: string): string {
	const lines = [
		...NOTES_REQUIRED_FACTS.map((fact) => ({ id: fact.id, text: fact.phrase })),
		...KNOWN_DIFFERENCES.map((entry) => ({
			id: entry.id,
			text: entry.notesPhrase,
		})),
		{ id: SAMPLE_DIFFERENCE.id, text: SAMPLE_DIFFERENCE.notesPhrase },
	];
	return lines
		.filter((line) => line.id !== skipId)
		.map((line) => `- ${line.text}.`)
		.join("\n");
}

const ALL_IDS = [
	...NOTES_REQUIRED_FACTS.map((fact) => fact.id),
	...KNOWN_DIFFERENCES.map((entry) => entry.id),
	SAMPLE_DIFFERENCE.id,
];

describe("overwrite notes cross-check (69-11)", () => {
	it("reports why the real release notes check is inactive (never silently absent)", () => {
		console.log(
			active
				? "OVERWRITE-NOTES-CROSSCHECK: active (package version 4.8.0)"
				: `OVERWRITE-NOTES-CROSSCHECK: inactive, package version is ${version}; it activates at 4.8.0`,
		);
		expect(typeof version).toBe("string");
	});

	it.skipIf(!active)(
		"RELEASE_NOTES.md states every required fact and every known difference",
		() => {
			const notes = fs.readFileSync(`${ROOT}RELEASE_NOTES.md`, "utf8");
			expect(missingNotesPhrases(notes)).toEqual([]);
		},
	);

	describe("negative control (always run)", () => {
		const options = { differences: [...KNOWN_DIFFERENCES, SAMPLE_DIFFERENCE] };

		it("a notes text with every phrase yields none missing", () => {
			expect(missingNotesPhrases(notesWith(), options)).toEqual([]);
		});

		it.each(ALL_IDS)(
			"a notes text missing only %s yields exactly that one",
			(id) => {
				expect(missingNotesPhrases(notesWith(id), options)).toEqual([id]);
			},
		);

		it("an empty notes text yields every phrase", () => {
			expect(missingNotesPhrases("", options)).toEqual(ALL_IDS);
		});

		it("is case-insensitive and tolerant of line wrapping, but not of a paraphrase", () => {
			const wrapped = notesWith().toUpperCase().replace(/ /g, "\n   ");
			expect(missingNotesPhrases(wrapped, options)).toEqual([]);
			const paraphrased = notesWith().replace(
				"hard link keeps the old bytes and metadata",
				"hard links keep their old content",
			);
			expect(missingNotesPhrases(paraphrased, options)).toEqual([
				"hard-link-keeps-old",
			]);
		});

		it("the required fact list is non-empty and names the hard-link limitation", () => {
			expect(NOTES_REQUIRED_FACTS.length).toBeGreaterThanOrEqual(4);
			expect(
				NOTES_REQUIRED_FACTS.some((fact) =>
					fact.phrase.includes("hard link keeps the old bytes"),
				),
			).toBe(true);
		});
	});
});
