import { execFileSync } from "node:child_process";
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

describe("cumulative same-layout gate", () => {
	test("passes the fixed v5.0 tree against the cumulative Phase 76-79 tree", () => {
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

	test("rejects table column changes beyond the approved width rebalance", () => {
		const planted = cloneFiles(candidateFiles);
		const file = "src/renderer/styles/file_table.css";
		const changed = replaceOnce(
			source(planted, file),
			".file-table__header {\n\tposition: sticky;\n\ttop: 0;\n\tdisplay: grid;\n\tgrid-template-columns: 28px minmax(0, 1fr) 64px 144px 72px 136px;",
			".file-table__header {\n\tposition: sticky;\n\ttop: 0;\n\tdisplay: grid;\n\tgrid-template-columns: 28px minmax(0, 1fr) 64px 160px 72px 136px;",
		);
		planted.set(file, Buffer.from(changed, "utf8"));
		expect(
			compareSnapshots({
				baseFiles: baselineFiles,
				candidateFiles: planted,
				paths,
				baseRef: BASELINE,
			}),
		).toContain("approved table grid declaration changed");
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
