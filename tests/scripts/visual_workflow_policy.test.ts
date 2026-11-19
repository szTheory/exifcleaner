import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

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
	baselines: Record<string, { path: string; sha256: string }>;
};
type WorkflowStep = {
	name?: string;
	id?: string;
	if?: string;
	run?: string;
	uses?: string;
	with?: Record<string, unknown>;
};
type WorkflowDocument = {
	permissions?: Record<string, string>;
	jobs?: Record<
		string,
		{
			if?: string;
			"continue-on-error"?: boolean;
			permissions?: Record<string, string>;
			steps?: WorkflowStep[];
		}
	>;
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
const parseYaml = createRequire(import.meta.url)("js-yaml").load as (
	text: string,
) => unknown;

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

function baselineProblems(
	data: VisualContract,
	repositoryRoot = ROOT,
): string[] {
	const problems: string[] = [];
	const names = Array.isArray(data.cases)
		? data.cases.map((item) => item.file)
		: [];
	const expectedNames = new Set(names);
	const baselines = data.baselines;
	if (
		baselines === undefined ||
		typeof baselines !== "object" ||
		baselines === null
	) {
		return ["baseline hashes must be declared for every case"];
	}
	const declaredNames = Object.keys(baselines);
	if (
		declaredNames.length !== expectedNames.size ||
		declaredNames.some((name) => !expectedNames.has(name))
	) {
		problems.push("baseline hash map must match the exact case filename set");
	}
	for (const name of expectedNames) {
		const row = baselines[name];
		if (
			row === undefined ||
			row.path !== path.posix.join("visual-baselines", name) ||
			!/^[a-f0-9]{64}$/u.test(row.sha256)
		) {
			problems.push("baseline path or SHA-256 is invalid: " + name);
		}
	}
	const directory = path.join(repositoryRoot, ".storybook/visual-baselines");
	let entries: Dirent<string>[];
	try {
		const directoryInfo = lstatSync(directory);
		if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
			return [...problems, "baseline directory must be a real directory"];
		}
		entries = readdirSync(directory, {
			withFileTypes: true,
			encoding: "utf8",
		});
	} catch {
		return [...problems, "baseline directory is missing"];
	}
	const pngEntries = entries.filter((entry) => entry.name.endsWith(".png"));
	if (
		entries.length !== expectedNames.size ||
		pngEntries.length !== expectedNames.size ||
		entries.some((entry) => !expectedNames.has(entry.name))
	) {
		problems.push(
			"baseline directory must contain exactly the declared PNG set",
		);
	}
	for (const name of expectedNames) {
		const entry = entries.find((candidate) => candidate.name === name);
		const row = baselines[name];
		if (
			entry === undefined ||
			!entry.isFile() ||
			entry.isSymbolicLink() ||
			row === undefined
		) {
			problems.push("baseline PNG is missing or not a regular file: " + name);
			continue;
		}
		const actual = createHash("sha256")
			.update(readFileSync(path.join(directory, name)))
			.digest("hex");
		if (actual !== row.sha256) problems.push("baseline SHA-256 drift: " + name);
	}
	return problems;
}

function workflowPolicyProblems(text: string, data: VisualContract): string[] {
	const problems: string[] = [];
	const parsed = parseYaml(text) as WorkflowDocument;
	const jobs = parsed.jobs ?? {};
	const findStep = (
		jobName: string,
		stepName: string,
	): WorkflowStep | undefined =>
		jobs[jobName]?.steps?.find((step) => step.name === stepName);
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
	if (
		data.baselines === undefined ||
		JSON.stringify(Object.keys(data.baselines).sort()) !==
			JSON.stringify(data.cases.map((item) => item.file).sort())
	) {
		problems.push("baseline hash map must match the exact case filename set");
	} else {
		for (const item of data.cases) {
			const row = data.baselines[item.file];
			if (
				row === undefined ||
				row.path !== path.posix.join("visual-baselines", item.file) ||
				!/^[a-f0-9]{64}$/u.test(row.sha256)
			) {
				problems.push("baseline path or SHA-256 is invalid: " + item.file);
			}
		}
	}

	const events = eventNames(text);
	if (
		JSON.stringify(events) !==
		JSON.stringify(["pull_request", "workflow_dispatch"])
	) {
		problems.push(
			"workflow events must be pull_request and workflow_dispatch only",
		);
	}
	const permissionEntries = Object.entries(parsed.permissions ?? {});
	if (
		permissionEntries.length !== 1 ||
		parsed.permissions?.contents !== "read"
	) {
		problems.push("workflow permissions must be contents: read");
	}
	if (Object.values(jobs).some((job) => job.permissions !== undefined)) {
		problems.push("job-level permission overrides are not allowed");
	}
	if (!text.includes(`EXIFCLEANER_VISUAL_IMAGE: ${IMAGE}`)) {
		problems.push("manifest image identity must use the approved full digest");
	}
	if (!text.includes(`      image: ${IMAGE}`)) {
		problems.push("capture container must use the approved full digest");
	}
	const containerImages = [...text.matchAll(/^\s+image:\s*(\S+)/gm)].map(
		(match) => match[1] ?? "",
	);
	if (
		containerImages.length < 2 ||
		containerImages.some((image) => image !== IMAGE)
	) {
		problems.push("every capture container must use the approved full digest");
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
	const comparisonJob = jobs.compare;
	if (
		comparisonJob?.if !== "github.event_name == 'pull_request'" ||
		comparisonJob["continue-on-error"] !== true ||
		!findStep("compare", "Validate capture artifact")?.run?.includes(
			'--expected-ref "$GITHUB_REF"',
		)
	) {
		problems.push(
			"pull-request comparison must be advisory and upload its artifact",
		);
	}
	const refreshJob = jobs.refresh;
	if (
		refreshJob?.if !== "github.event_name == 'workflow_dispatch'" ||
		!findStep("refresh", "Require the default branch")?.run?.includes(
			'test "$GITHUB_REF" = "refs/heads/master"',
		)
	) {
		problems.push(
			"manual refresh must be dispatch-only, master-bound, and artifact-only",
		);
	}
	for (const [name, job] of [
		["compare", comparisonJob],
		["refresh", refreshJob],
	] as const) {
		const validate = findStep(name, "Validate capture artifact");
		if (
			validate?.id !== "validate" ||
			validate.if !== undefined ||
			!validate.run?.includes('--expected-commit "$GITHUB_SHA"') ||
			!validate.run?.includes('--expected-run-id "$GITHUB_RUN_ID"') ||
			!validate.run?.includes('--expected-run-attempt "$GITHUB_RUN_ATTEMPT"')
		) {
			problems.push(
				name +
					" validator must bind capture metadata to the trusted workflow run",
			);
		}
		for (const stepName of [
			"Build artifact-only contact sheet",
			name === "compare"
				? "Upload comparison artifact"
				: "Upload baseline proposal artifact",
		]) {
			const step = findStep(name, stepName);
			if (step?.if !== "steps.validate.outcome == 'success'") {
				problems.push(
					name + " " + stepName + " must require successful validation",
				);
			}
		}
	}
	const steps = text.split(/^      - name: /m).slice(1);
	for (const step of steps) {
		if (
			step.includes("set -euo pipefail") &&
			!/^ {8}shell: bash$/m.test(step)
		) {
			problems.push("steps using pipefail must explicitly select bash");
			break;
		}
	}
	for (const [name, jobName] of [
		["compare", "compare"],
		["refresh", "refresh"],
	] as const) {
		const upload = (jobs[jobName]?.steps ?? []).find((step) =>
			step.uses?.startsWith("actions/upload-artifact@"),
		);
		if (upload?.with?.path !== "/tmp/exifcleaner-visual/*") {
			problems.push(
				name + " artifact upload must include all external capture outputs",
			);
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

	test("the advisory pull-request job and manual refresh meet the read-only artifact policy", () => {
		expect(workflowPolicyProblems(workflow, contract)).toEqual([]);
		expect(baselineProblems(contract)).toEqual([]);
	});

	test("rejects success gates that appear only in YAML comments", () => {
		const weakened = workflow.replace(
			"      - name: Upload comparison artifact\n        if: steps.validate.outcome == 'success'",
			"      - name: Upload comparison artifact\n        if: failure()\n        # if: steps.validate.outcome == 'success'",
		);
		expect(weakened).not.toBe(workflow);
		expect(workflowPolicyProblems(weakened, contract)).toContain(
			"compare Upload comparison artifact must require successful validation",
		);
	});

	test("rejects extra workflow write permissions", () => {
		const expanded = workflow.replace(
			"permissions:\n  contents: read",
			"permissions:\n  contents: read\n  pull-requests: write",
		);
		expect(expanded).not.toBe(workflow);
		expect(workflowPolicyProblems(expanded, contract)).toContain(
			"workflow permissions must be contents: read",
		);
	});

	test("rejects job-level permission overrides", () => {
		const expanded = workflow.replace(
			"  compare:\n    name: Advisory visual comparison",
			"  compare:\n    permissions:\n      pull-requests: write\n    name: Advisory visual comparison",
		);
		expect(expanded).not.toBe(workflow);
		expect(workflowPolicyProblems(expanded, contract)).toContain(
			"job-level permission overrides are not allowed",
		);
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

	test("rejects a missing baseline hash", () => {
		const changed = structuredClone(contract);
		delete changed.baselines[changed.cases[0]!.file];
		expect(workflowPolicyProblems(workflow, changed)).toContain(
			"baseline hash map must match the exact case filename set",
		);
	});

	test("rejects missing baseline files", () => {
		const temporary = mkdtempSync(
			path.join(os.tmpdir(), "visual-baselines-missing-"),
		);
		const before = snapshotDir(temporary);
		try {
			expect(baselineProblems(contract, temporary)).toContain(
				"baseline directory is missing",
			);
		} finally {
			try {
				assertDirEffect(before, snapshotDir(temporary), {});
			} finally {
				rmSync(temporary, { recursive: true, force: true });
			}
		}
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

	test("rejects a pull-request event that can run the refresh job", () => {
		const changed = workflow.replace(
			"if: github.event_name == 'workflow_dispatch'",
			"if: always()",
		);
		expect(workflowPolicyProblems(changed, contract)).toContain(
			"manual refresh must be dispatch-only, master-bound, and artifact-only",
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
			"every capture container must use the approved full digest",
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

	test("rejects an upload path that can omit capture outputs", () => {
		const changed = workflow.replaceAll(
			"path: /tmp/exifcleaner-visual/*",
			"path: /tmp/exifcleaner-visual/manifest.json",
		);
		const problems = workflowPolicyProblems(changed, contract);
		expect(problems).toContain(
			"compare artifact upload must include all external capture outputs",
		);
		expect(problems).toContain(
			"refresh artifact upload must include all external capture outputs",
		);
	});
});

export { baselineProblems, expectedCases, workflowPolicyProblems };
