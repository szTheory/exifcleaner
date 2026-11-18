import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

type VisualCase = {
	story: string;
	theme: "light" | "dark";
	locale: string;
	width: 580 | 960;
	height: 800;
	file: string;
};
type VisualContract = {
	schemaVersion: number;
	maxImages: number;
	cases: VisualCase[];
};

const ROOT = process.cwd();
const CONTRACT_PATH = path.join(ROOT, ".storybook/visual-baselines.json");
const WORKFLOW_PATH = path.join(ROOT, ".github/workflows/visual.yml");
const IMAGE =
	"mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f";
const contract = JSON.parse(
	readFileSync(CONTRACT_PATH, "utf8"),
) as VisualContract;
const workflow = readFileSync(WORKFLOW_PATH, "utf8");

function expectedCases(): VisualCase[] {
	const compactStories = [
		"screens-app--empty",
		"screens-app--mid-batch",
		"screens-app--all-done",
		"screens-app--large-batch",
		"screens-app--all-error",
		"screens-app--empty-copy-mode",
		"screens-app--drawer-open",
		"screens-app--error-boundary-failure",
	];
	const wideStories = compactStories.slice(0, 4);
	const themes = ["light", "dark"] as const;
	const rows: VisualCase[] = [];
	for (const [stories, width] of [
		[compactStories, 580],
		[wideStories, 960],
	] as const) {
		for (const story of stories) {
			for (const theme of themes) {
				rows.push({
					story,
					theme,
					locale: "en",
					width,
					height: 800,
					file: `${story}.${theme}.en.${width}.png`,
				});
			}
		}
	}
	rows.push({
		story: "screens-app--empty",
		theme: "light",
		locale: "de",
		width: 580,
		height: 800,
		file: "screens-app--empty.light.de.580.png",
	});
	return rows;
}

function eventNames(text: string): string[] {
	const start = text.indexOf("\non:\n");
	const end = text.indexOf("\npermissions:", start);
	if (start === -1 || end === -1) return [];
	return [...text.slice(start, end).matchAll(/^ {2}([A-Za-z0-9_-]+):/gm)].map(
		(match) => match[1] ?? "",
	);
}

function workflowPolicyProblems(text: string, data: VisualContract): string[] {
	const problems: string[] = [];
	if (data.schemaVersion !== 1) problems.push("schemaVersion must be 1");
	if (
		!Number.isInteger(data.maxImages) ||
		data.maxImages < 25 ||
		data.maxImages > 40
	) {
		problems.push("maxImages must be from 25 to 40");
	}
	if (!Array.isArray(data.cases) || data.cases.length !== 25) {
		problems.push("the capture contract must contain exactly 25 images");
	} else {
		const files = data.cases.map((item) => item.file);
		const identities = data.cases.map(
			(item) => `${item.story}|${item.theme}|${item.locale}|${item.width}`,
		);
		if (new Set(files).size !== files.length) {
			problems.push("case filenames must be unique");
		}
		if (new Set(identities).size !== identities.length) {
			problems.push("case identities must be unique");
		}
		const expected = expectedCases();
		if (JSON.stringify(data.cases) !== JSON.stringify(expected)) {
			problems.push(
				"ordered case list differs from the approved 25-case contract",
			);
		}
	}

	const events = eventNames(text);
	if (JSON.stringify(events) !== JSON.stringify(["workflow_dispatch"])) {
		problems.push("the only workflow event must be workflow_dispatch");
	}
	if (!/^permissions:\n {2}contents: read$/m.test(text)) {
		problems.push("workflow permissions must be contents: read");
	}
	if (!text.includes(`EXIFCLEANER_VISUAL_IMAGE: ${IMAGE}`)) {
		problems.push("manifest image identity must use the approved full digest");
	}
	if (!text.includes(`      image: ${IMAGE}`)) {
		problems.push("capture container must use the approved full digest");
	}
	for (const line of text.split(/\r?\n/u)) {
		const match = /^\s*-?\s*uses:\s*(\S+)/u.exec(line);
		if (
			match !== null &&
			!/@[0-9a-f]{40}(?:\s+#\s+\S.*)?$/u.test(match[1] ?? "")
		) {
			problems.push(`action must use a full 40-hex SHA: ${match[1]}`);
		}
	}
	if (
		/contents:\s*write|git\s+push|gh\s+api\s+.*\b(refs|contents)\b/iu.test(text)
	) {
		problems.push("workflow must not have repository write behavior");
	}
	if (!text.includes("run: yarn visual:capture")) {
		problems.push("workflow must run the declared visual capture command");
	}
	if (!text.includes("node scripts/validate_visual_artifact.mjs")) {
		problems.push("workflow must validate its capture artifact before upload");
	}
	if (!text.includes("node scripts/contact_sheet.mjs")) {
		problems.push("workflow must generate the labeled contact sheet");
	}
	if (text.includes("set -euo pipefail") && !/^ {8}shell: bash$/m.test(text)) {
		problems.push("steps using pipefail must explicitly select bash");
	}
	const uploadStart = text.indexOf("uses: actions/upload-artifact@");
	const uploadBlock = uploadStart < 0 ? "" : text.slice(uploadStart);
	for (const required of [
		"manifest.json",
		"contact-sheet.png",
		"contact-sheet.html",
		"*.png",
	]) {
		if (!uploadBlock.includes(required)) {
			problems.push(`artifact upload must include ${required}`);
		}
	}
	if (!text.includes("retention-days: 90")) {
		problems.push("capture artifact retention must request 90 days");
	}
	return problems;
}

describe("visual workflow and case contract policy", () => {
	test("declares the exact 25 cases once and stays below the cap", () => {
		expect(contract.cases).toHaveLength(25);
		expect(contract.maxImages).toBe(40);
		expect(new Set(contract.cases.map((item) => item.file)).size).toBe(25);
		expect(contract.cases).toEqual(expectedCases());
	});

	test("the dispatch-only workflow meets its read-only artifact policy", () => {
		expect(workflowPolicyProblems(workflow, contract)).toEqual([]);
	});

	test("rejects an added case even when the cap would allow it", () => {
		const changed = structuredClone(contract);
		const first = changed.cases[0];
		if (first === undefined) throw new Error("fixture has no first case");
		changed.cases.push({ ...first });
		expect(workflowPolicyProblems(workflow, changed)).toContain(
			"the capture contract must contain exactly 25 images",
		);
	});

	test("rejects a missing case", () => {
		const changed = structuredClone(contract);
		changed.cases.pop();
		expect(workflowPolicyProblems(workflow, changed)).toContain(
			"the capture contract must contain exactly 25 images",
		);
	});

	test("rejects a changed case in the same-sized contract", () => {
		const changed = structuredClone(contract);
		const last = changed.cases[changed.cases.length - 1];
		if (last === undefined) throw new Error("fixture has no cases");
		changed.cases[changed.cases.length - 1] = { ...last, locale: "en" };
		expect(workflowPolicyProblems(workflow, changed)).toContain(
			"ordered case list differs from the approved 25-case contract",
		);
	});

	test("rejects a case cap above 40", () => {
		const changed = { ...contract, maxImages: 41 };
		expect(workflowPolicyProblems(workflow, changed)).toContain(
			"maxImages must be from 25 to 40",
		);
	});

	test("rejects duplicate case identities", () => {
		const changed = structuredClone(contract);
		const first = changed.cases[0];
		const second = changed.cases[1];
		if (first === undefined || second === undefined) {
			throw new Error("fixture has fewer than two cases");
		}
		changed.cases[1] = { ...first, file: second.file };
		const problems = workflowPolicyProblems(workflow, changed);
		expect(problems).toContain("case identities must be unique");
	});

	test("rejects duplicate filenames", () => {
		const changed = structuredClone(contract);
		const first = changed.cases[0];
		const second = changed.cases[1];
		if (first === undefined || second === undefined) {
			throw new Error("fixture has fewer than two cases");
		}
		changed.cases[1] = { ...second, file: first.file };
		expect(workflowPolicyProblems(workflow, changed)).toContain(
			"case filenames must be unique",
		);
	});

	test("rejects a pull-request trigger", () => {
		const changed = workflow.replace(
			"  workflow_dispatch:\n",
			"  pull_request:\n  workflow_dispatch:\n",
		);
		expect(workflowPolicyProblems(changed, contract)).toContain(
			"the only workflow event must be workflow_dispatch",
		);
	});

	test("rejects writable permissions", () => {
		const changed = workflow.replace("  contents: read", "  contents: write");
		expect(workflowPolicyProblems(changed, contract)).toContain(
			"workflow permissions must be contents: read",
		);
	});

	test("rejects a missing container digest", () => {
		const changed = workflow.replace(
			`      image: ${IMAGE}`,
			"      image: mcr.microsoft.com/playwright:v1.64.1-noble",
		);
		expect(workflowPolicyProblems(changed, contract)).toContain(
			"capture container must use the approved full digest",
		);
	});

	test("rejects an unpinned action", () => {
		const changed = workflow.replace(
			/actions\/checkout@[0-9a-f]{40}/u,
			"actions/checkout@v4",
		);
		expect(
			workflowPolicyProblems(changed, contract).some((item) =>
				item.includes("full 40-hex SHA"),
			),
		).toBe(true);
	});

	test("rejects a pipefail step without a Bash shell", () => {
		const changed = workflow.replace("        shell: bash\n", "");
		expect(workflowPolicyProblems(changed, contract)).toContain(
			"steps using pipefail must explicitly select bash",
		);
	});

	test("rejects an artifact that omits the contact sheet", () => {
		const changed = workflow.replace(
			"            ${{ env.EXIFCLEANER_VISUAL_OUTPUT_DIR }}/contact-sheet.png\n",
			"",
		);
		const problems = workflowPolicyProblems(changed, contract);
		expect(problems).toContain(
			"artifact upload must include contact-sheet.png",
		);
	});
});

export { expectedCases, workflowPolicyProblems };
