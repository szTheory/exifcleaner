import { describe, expect, it } from "vitest";
import {
	classifyStayOpenLeftovers,
	isGoneIn,
	parsePsRows,
	type ProcessRow,
} from "../helpers/orphan_processes";

const REPO = "/work/exifcleaner/exifcleaner-electron";
const TMP = "/tmp/exifcleaner-tests";
const RUNNER = 500;
const EXIFTOOL = `${REPO}/.resources/nix/bin/exiftool -stay_open True -@ -`;

function row(overrides: Partial<ProcessRow>): ProcessRow {
	return { pid: 900, ppid: 1, stat: "S", args: EXIFTOOL, ...overrides };
}

function classify(
	rows: ProcessRow[],
	extra: { preexisting?: number[]; reapers?: number[] } = {},
): ProcessRow[] {
	return classifyStayOpenLeftovers({
		rows,
		scopeRoots: [REPO, TMP],
		preexisting: new Set(extra.preexisting ?? []),
		runnerPid: RUNNER,
		reaperPids: new Set([1, ...(extra.reapers ?? [])]),
	});
}

describe("parsePsRows", () => {
	it("keeps inner spaces in args and skips blank lines", () => {
		const rows = parsePsRows(
			"  12   1 Ss   /a b/exiftool -stay_open True\n\n   13  12 Z+   (exiftool)\n",
		);
		expect(rows).toEqual([
			{ pid: 12, ppid: 1, stat: "Ss", args: "/a b/exiftool -stay_open True" },
			{ pid: 13, ppid: 12, stat: "Z+", args: "(exiftool)" },
		]);
	});
});

describe("isGoneIn", () => {
	it("treats an absent pid as gone", () => {
		expect(isGoneIn({ rows: [row({ pid: 1 })], pid: 2 })).toBe(true);
	});
	it.each(["Z", "Z+"])("treats stat %s as gone", (stat) => {
		expect(isGoneIn({ rows: [row({ pid: 2, stat })], pid: 2 })).toBe(true);
	});
	it("treats a live row as not gone", () => {
		expect(isGoneIn({ rows: [row({ pid: 2 })], pid: 2 })).toBe(false);
	});
});

describe("classifyStayOpenLeftovers", () => {
	it("returns nothing for an empty process table", () => {
		expect(classify([])).toEqual([]);
	});

	it("returns nothing when only excluded rows exist", () => {
		expect(
			classify([
				row({ pid: 1, ppid: 0, args: "/sbin/launchd" }),
				row({ pid: 901, stat: "Z" }),
			]),
		).toEqual([]);
	});

	it("flags an orphan reparented to init", () => {
		const orphan = row({ pid: 901, ppid: 1 });
		expect(classify([orphan])).toEqual([orphan]);
	});

	it("flags an orphan reparented to the observed subreaper", () => {
		const orphan = row({ pid: 901, ppid: 77 });
		expect(classify([orphan], { reapers: [77] })).toEqual([orphan]);
		// differs by one field: the same row with no such reaper is a concurrent process
		expect(
			classify([row({ pid: 901, ppid: 77 }), row({ pid: 77, ppid: 3 })]),
		).toEqual([]);
	});

	it("flags a row still descended from the runner", () => {
		const rows = [
			row({ pid: 600, ppid: RUNNER, args: "node worker" }),
			row({ pid: 901, ppid: 600 }),
		];
		expect(classify(rows)).toEqual([rows[1]]);
	});

	it("flags a row whose temp-dir binary is in scope", () => {
		const orphan = row({
			pid: 901,
			args: `${TMP}/stub/exiftool -stay_open True -@ -`,
		});
		expect(classify([orphan])).toEqual([orphan]);
	});

	it("excludes a pid present at setup", () => {
		expect(classify([row({ pid: 901 })], { preexisting: [901] })).toEqual([]);
	});

	it.each(["Z", "Z+"])("excludes a zombie (stat %s)", (stat) => {
		expect(classify([row({ pid: 901, stat })])).toEqual([]);
	});

	it("excludes a child of a live process outside the runner's tree", () => {
		const rows = [
			row({ pid: 700, ppid: 1, args: "/other/app" }),
			row({ pid: 901, ppid: 700 }),
		];
		expect(classify(rows)).toEqual([]);
	});

	it("excludes a one-shot exiftool run", () => {
		expect(
			classify([
				row({ pid: 901, args: `${REPO}/.resources/nix/bin/exiftool -ver` }),
			]),
		).toEqual([]);
	});

	it("excludes a binary outside the repo and temp roots", () => {
		expect(
			classify([
				row({
					pid: 901,
					args: "/Applications/ExifCleaner.app/Contents/Resources/nix/bin/exiftool -stay_open True -@ -",
				}),
			]),
		).toEqual([]);
	});

	it("terminates on a ppid cycle", () => {
		const rows = [
			row({ pid: 10, ppid: 11, args: "a" }),
			row({ pid: 11, ppid: 10, args: "b" }),
			row({ pid: 901, ppid: 10 }),
		];
		expect(classify(rows)).toEqual([]);
	});
});
