import { execFileSync } from "node:child_process";
import postcss, { type Declaration } from "postcss";
import { describe, expect, test } from "vitest";
import {
	BASELINE,
	changedPaths,
	compareSnapshots,
	motionSignature,
	readGitSnapshot,
} from "../../scripts/same_layout_gate.mjs";

const cwd = process.cwd();
const head = execFileSync("git", ["rev-parse", "HEAD"], {
	cwd,
	encoding: "utf8",
}).trim();
const baselineFiles = readGitSnapshot(BASELINE, cwd);
const candidateFiles = readGitSnapshot(head, cwd);
const paths = changedPaths(BASELINE, head, cwd);
const TABLE_GRID_SELECTORS = [
	".file-table__header",
	".file-table__row",
] as const;

function cloneFiles(files: Map<string, Buffer>): Map<string, Buffer> {
	return new Map(
		[...files].map(([file, contents]) => [file, Buffer.from(contents)]),
	);
}

function source(files: Map<string, Buffer>, file: string): string {
	const value = files.get(file);
	if (value === undefined) throw new Error("test fixture is missing " + file);
	return value.toString("utf8");
}

function replaceOnce(input: string, before: string, after: string): string {
	const index = input.indexOf(before);
	if (index < 0 || input.indexOf(before, index + before.length) >= 0) {
		throw new Error("expected exactly one fixture occurrence: " + before);
	}
	return input.slice(0, index) + after + input.slice(index + before.length);
}

function selectTableGrid(css: string): {
	root: postcss.Root;
	selections: Map<string, { ruleCount: number; declarations: Declaration[] }>;
} {
	const root = postcss.parse(css, {
		from: "src/renderer/styles/file_table.css",
	});
	const selections = new Map<
		string,
		{ ruleCount: number; declarations: Declaration[] }
	>();
	for (const selector of TABLE_GRID_SELECTORS) {
		selections.set(selector, { ruleCount: 0, declarations: [] });
	}
	root.walkRules((rule) => {
		const selected = selections.get(rule.selector);
		if (selected === undefined) return;
		selected.ruleCount += 1;
		rule.walkDecls("grid-template-columns", (declaration) => {
			selected.declarations.push(declaration);
		});
	});
	return { root, selections };
}

describe("cumulative same-layout gate", () => {
	test("passes the fixed v5.0 tree against the cumulative Phase 76-80 tree", () => {
		expect(
			compareSnapshots({
				baseFiles: baselineFiles,
				candidateFiles,
				paths,
				baseRef: BASELINE,
			}),
		).toEqual([]);
	});

	test("rejects locale catalog changes outside the approved intake labels", () => {
		const planted = cloneFiles(candidateFiles);
		const file = ".resources/locales/en.json";
		const changed = replaceOnce(
			source(planted, file),
			'"empty.title": "Add files to clean",',
			'"empty.title": "Add files",',
		);
		planted.set(file, Buffer.from(changed, "utf8"));
		expect(
			compareSnapshots({
				baseFiles: baselineFiles,
				candidateFiles: planted,
				paths,
				baseRef: BASELINE,
			}),
		).toContain(
			"locale catalog differs outside the two approved intake labels: .resources/locales/en.json",
		);
	});

	test("rejects a translated button label that is not only missing its ellipsis", () => {
		const planted = cloneFiles(candidateFiles);
		const file = ".resources/locales/de.json";
		const changed = replaceOnce(
			source(planted, file),
			'"intake.chooseFiles": "Dateien auswählen",',
			'"intake.chooseFiles": "Dateien wählen",',
		);
		planted.set(file, Buffer.from(changed, "utf8"));
		expect(
			compareSnapshots({
				baseFiles: baselineFiles,
				candidateFiles: planted,
				paths,
				baseRef: BASELINE,
			}),
		).toContain(
			"locale catalog differs outside the two approved intake labels: .resources/locales/de.json",
		);
	});

	test.each(TABLE_GRID_SELECTORS)(
		"rejects a one-track grid drift on %s",
		(selector) => {
			const planted = cloneFiles(candidateFiles);
			const file = "src/renderer/styles/file_table.css";
			const selected = selectTableGrid(source(planted, file));
			for (const tableSelector of TABLE_GRID_SELECTORS) {
				const entry = selected.selections.get(tableSelector);
				expect(entry?.ruleCount, tableSelector).toBe(1);
				expect(entry?.declarations, tableSelector).toHaveLength(1);
			}

			const selectedBefore = selected.selections.get(selector);
			const otherSelector = TABLE_GRID_SELECTORS.find(
				(candidate) => candidate !== selector,
			);
			if (selectedBefore === undefined || otherSelector === undefined) {
				throw new Error("selected grid selector was not found: " + selector);
			}
			const otherBefore = selected.selections.get(otherSelector);
			if (otherBefore === undefined) {
				throw new Error("other grid selector was not found: " + otherSelector);
			}

			const declaration = selectedBefore.declarations[0];
			if (declaration === undefined) {
				throw new Error("grid declaration was not found: " + selector);
			}
			const beforeValue = declaration.value.trim();
			const firstTrack = /^(\d+)(\.\d+)?(px|ch)(?=\s)/u.exec(beforeValue);
			if (firstTrack === null) {
				throw new Error("grid declaration has no supported fixed first track");
			}
			const changedFirstTrack = `${Number(firstTrack[1]) + 1}${firstTrack[2] ?? ""}${firstTrack[3]}`;
			const changedValue = replaceOnce(
				beforeValue,
				firstTrack[0],
				changedFirstTrack,
			);
			const beforeTracks = beforeValue.match(/\S+/gu) ?? [];
			const changedTracks = changedValue.match(/\S+/gu) ?? [];
			expect(changedTracks).toHaveLength(beforeTracks.length);
			expect(
				changedTracks.filter((track, index) => track !== beforeTracks[index]),
			).toHaveLength(1);
			declaration.value = changedValue;

			const changedCss = selected.root.toString();
			const after = selectTableGrid(changedCss).selections;
			const selectedAfter = after.get(selector);
			const otherAfter = after.get(otherSelector);
			expect(selectedAfter?.ruleCount).toBe(1);
			expect(
				selectedAfter?.declarations.map((item) => item.value.trim()),
			).toEqual([changedValue]);
			expect(otherAfter?.ruleCount).toBe(1);
			expect(otherAfter?.declarations.map((item) => item.value.trim())).toEqual(
				otherBefore.declarations.map((item) => item.value.trim()),
			);
			planted.set(file, Buffer.from(changedCss, "utf8"));
			expect(
				compareSnapshots({
					baseFiles: baselineFiles,
					candidateFiles: planted,
					paths,
					baseRef: BASELINE,
				}),
			).toContain("approved table grid declaration changed");
		},
	);

	test("rejects processing-spinner styling outside the exact visual correction", () => {
		const planted = cloneFiles(candidateFiles);
		const file = "src/renderer/styles/status_icon.css";
		const changed = replaceOnce(
			source(planted, file),
			"border: 2px solid var(--ec-color-border);",
			"border: 2px solid var(--ec-color-surface);",
		);
		planted.set(file, Buffer.from(changed, "utf8"));
		expect(
			compareSnapshots({
				baseFiles: baselineFiles,
				candidateFiles: planted,
				paths,
				baseRef: BASELINE,
			}),
		).toContain("approved presentation rule changed: VIS-80-SPINNER-CLARITY");
	});

	test("rejects error-summary styling outside the exact semantic treatment", () => {
		const planted = cloneFiles(candidateFiles);
		const file = "src/renderer/styles/file_table.css";
		const changed = replaceOnce(
			source(planted, file),
			".file-table__error-summary {\n\tcolor: var(--ec-color-text-secondary);",
			".file-table__error-summary {\n\tcolor: var(--ec-color-error);",
		);
		planted.set(file, Buffer.from(changed, "utf8"));
		expect(
			compareSnapshots({
				baseFiles: baselineFiles,
				candidateFiles: planted,
				paths,
				baseRef: BASELINE,
			}),
		).toContain("approved presentation rule changed: VIS-80-ERROR-SUMMARY");
	});

	test("rejects disclosure-icon changes beyond the approved expanded state", () => {
		const planted = cloneFiles(candidateFiles);
		const file = "src/renderer/components/icons/ChevronIcon.tsx";
		const changed = replaceOnce(
			source(planted, file),
			"strokeWidth={expanded ? 2 : 1.5}",
			"strokeWidth={expanded ? 2.25 : 1.5}",
		);
		planted.set(file, Buffer.from(changed, "utf8"));
		expect(
			compareSnapshots({
				baseFiles: baselineFiles,
				candidateFiles: planted,
				paths,
				baseRef: BASELINE,
			}),
		).toContain("approved chevron presentation changed");
	});

	test("rejects a non-color keyframe transform change", () => {
		const planted = cloneFiles(candidateFiles);
		const file = "src/renderer/styles/status_icon.css";
		const changed = replaceOnce(
			source(planted, file),
			"transform: rotate(360deg)",
			"transform: rotate(359deg)",
		);
		planted.set(file, Buffer.from(changed, "utf8"));
		const baseMotion = motionSignature(baselineFiles);
		const plantedMotion = motionSignature(planted);
		expect(plantedMotion.keyframes).not.toEqual(baseMotion.keyframes);
		expect(
			compareSnapshots({
				baseFiles: baselineFiles,
				candidateFiles: planted,
				paths,
				baseRef: BASELINE,
			}),
		).toContain(
			"keyframe structure, selector, timing, or non-color value changed",
		);
	});

	test("rejects removal of the existing toggle thumb slide transition", () => {
		const planted = cloneFiles(candidateFiles);
		const file = "src/renderer/styles/toggle_switch.css";
		const changed = replaceOnce(
			source(planted, file),
			"transition: left 200ms cubic-bezier(0.34, 1.56, 0.64, 1);",
			"",
		);
		planted.set(file, Buffer.from(changed, "utf8"));
		expect(
			compareSnapshots({
				baseFiles: baselineFiles,
				candidateFiles: planted,
				paths,
				baseRef: BASELINE,
			}),
		).toContain("required toggle thumb transition is missing");
	});

	test("rejects an unapproved wrapper around the D-03 callsite", () => {
		const planted = cloneFiles(candidateFiles);
		const file = "src/renderer/components/file-list/FileRow.tsx";
		const changed = replaceOnce(
			source(planted, file),
			"<EscapedName segments={shownNameSegments} />",
			"<div><EscapedName segments={shownNameSegments} /></div>",
		);
		planted.set(file, Buffer.from(changed, "utf8"));
		expect(
			compareSnapshots({
				baseFiles: baselineFiles,
				candidateFiles: planted,
				paths,
				baseRef: BASELINE,
			}),
		).toContain("ordered JSX structure changed: " + file);
	});

	test("rejects a new EscapedName use outside the three recorded callsites", () => {
		const planted = cloneFiles(candidateFiles);
		const file = "src/renderer/components/ui/StatusIcon.tsx";
		planted.set(
			file,
			Buffer.from(
				source(planted, file) + "\nconst extra = <EscapedName />;\n",
				"utf8",
			),
		);
		expect(
			compareSnapshots({
				baseFiles: baselineFiles,
				candidateFiles: planted,
				paths,
				baseRef: BASELINE,
			}),
		).toContain("ordered JSX structure changed: " + file);
	});

	test("permits only a keyframe color token change", () => {
		const planted = cloneFiles(candidateFiles);
		const file = "src/renderer/styles/status_icon.css";
		const synthetic = [
			"@keyframes color-plant {",
			"  from { color: #112233; }",
			"  to { color: rgb(10, 20, 30); }",
			"}",
		].join("\n");
		const changed = [
			"@keyframes color-plant {",
			"  from { color: #aabbcc; }",
			"  to { color: rgb(30, 40, 50); }",
			"}",
		].join("\n");
		const base = cloneFiles(candidateFiles);
		base.set(file, Buffer.from(source(base, file) + "\n" + synthetic, "utf8"));
		planted.set(
			file,
			Buffer.from(source(planted, file) + "\n" + changed, "utf8"),
		);
		expect(motionSignature(planted).keyframes).toEqual(
			motionSignature(base).keyframes,
		);
	});
});
