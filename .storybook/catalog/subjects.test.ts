import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import {
	SUBJECTS_PATH,
	SUBJECT_CODES,
	loadSubjects,
	scanSubjectIds,
	validateSubjects,
} from "./subjects.mjs";
import { repoRoot } from "./temp_repo";

type Subject = { id: string; tier: string };

const real = JSON.parse(
	fs.readFileSync(path.join(repoRoot, SUBJECTS_PATH), "utf8"),
) as Subject[];
const scan = scanSubjectIds(repoRoot);

const scratch: string[] = [];
afterAll(() => {
	for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});

function brief(doc: unknown, against = scan) {
	return validateSubjects(doc, against).map((problem) => ({
		code: problem.code,
		...(problem.id === undefined ? {} : { id: problem.id }),
	}));
}

describe("the real subjects", () => {
	test("the registry and the component scan close in both directions", () => {
		expect(validateSubjects(real, scan)).toEqual([]);
		expect(scan.ids).toHaveLength(21);
		expect(scan.ids).toEqual(real.map((subject) => subject.id));
		expect(scan.collisions).toEqual([]);
	});

	test("tiers split primitive 6, pattern 9, area 5, screen 1", () => {
		const count = (tier: string) =>
			real.filter((subject) => subject.tier === tier).length;
		expect([
			count("primitive"),
			count("pattern"),
			count("area"),
			count("screen"),
		]).toEqual([6, 9, 5, 1]);
	});

	test("loadSubjects returns the id to tier map", () => {
		const subjects = loadSubjects(repoRoot);
		expect(subjects.size).toBe(21);
		expect(subjects.get("LanguageDropdown")).toBe("pattern");
		expect(subjects.get("App")).toBe("screen");
	});
});

const first = real[0] as Subject;
const MUTANTS: ReadonlyArray<
	[string, unknown, typeof scan, Array<Record<string, string>>]
> = [
	[
		"a component with no row",
		real,
		{ ids: [...scan.ids, "ZzNewThing"], collisions: [] },
		[{ code: "subject-unregistered", id: "ZzNewThing" }],
	],
	[
		"a row for a deleted component",
		[...real, { id: "ZzGone", tier: "primitive" }],
		scan,
		[{ code: "subject-stale", id: "ZzGone" }],
	],
	[
		"a basename collision",
		real,
		{ ids: scan.ids, collisions: ["Toast"] },
		[{ code: "subject-collision", id: "Toast" }],
	],
	[
		"a bad tier",
		real.map((subject, index) =>
			index === 0 ? { ...subject, tier: "widget" } : subject,
		),
		scan,
		[{ code: "bad-tier", id: first.id }],
	],
	["an unsorted registry", [...real].reverse(), scan, [{ code: "unsorted" }]],
	[
		"an object document instead of the bare array",
		{ schemaVersion: 1, subjects: real },
		scan,
		[{ code: "not-array" }],
	],
	["a row that is not an object", [...real, 5], scan, [{ code: "not-object" }]],
	[
		"an unknown field on a row",
		real.map((subject, index) =>
			index === 0 ? { ...subject, extra: 1 } : subject,
		),
		scan,
		[{ code: "unknown-field" }],
	],
	[
		"a row without a tier",
		real.map((subject, index) => (index === 0 ? { id: subject.id } : subject)),
		scan,
		[{ code: "missing-field" }],
	],
	[
		"a lower-case id",
		real.map((subject, index) =>
			index === 0 ? { ...subject, id: "app" } : subject,
		),
		scan,
		[{ code: "bad-id" }],
	],
	[
		"a duplicate row",
		[...real, { ...(real[real.length - 1] as Subject) }],
		scan,
		[{ code: "duplicate-id", id: (real[real.length - 1] as Subject).id }],
	],
];

describe("planted subject defects", () => {
	test.each(MUTANTS)(
		"shown red: %s yields exactly its code",
		(_name, doc, against, expected) => {
			expect(brief(doc, against)).toEqual(expected);
		},
	);

	test("every code has a mutant row", () => {
		const covered = new Set(MUTANTS.map((row) => row[3][0]?.["code"]));
		expect([...covered].sort()).toEqual([...SUBJECT_CODES].sort());
	});
});

describe("scanSubjectIds on a planted tree", () => {
	test("stories are not subjects, App is, and a repeated basename is a collision", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "subjects-scan-"));
		scratch.push(root);
		const put = (rel: string) => {
			const file = path.join(root, rel);
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, "export {};\n");
		};
		put("src/renderer/App.tsx");
		put("src/renderer/components/a/Widget.tsx");
		put("src/renderer/components/b/Widget.tsx");
		put("src/renderer/components/b/Widget.stories.tsx");
		put("src/renderer/components/b/helper.ts");
		expect(scanSubjectIds(root)).toEqual({
			ids: ["App", "Widget"],
			collisions: ["Widget"],
		});
	});
});
