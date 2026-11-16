import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// GAT-01 / D-13, RESEARCH R7: ci.yml's `test` job runs one step, "Brand pin, quote and drift
// gates", that fetches the pinned brand cache and runs the brand and gate-data checks. A
// pull request must not be able to weaken or skip it, so this policy pins the step, its
// position, its commands, and the absence of an `if:` or `continue-on-error`, plus the
// `fetch-depth: 0` the merge-base check needs.
//
// The test lives under tests/ (run by `yarn test:ci`, always) and not in .storybook/,
// because the Storybook workflow's path filter does not list ci.yml: a policy test placed
// there would be skipped for a pull request that touches only ci.yml.
//
// The job slicer below is a copy of the one in scripts/exifcleaner_node_dependency_gate.mjs
// (not exported there; that gate is sealed and is not edited here). The seal-after-install
// rule is that gate's; it is repeated so that a step moved between them is named here too.

export const BRAND_STEP_NAME = "Brand pin, quote and drift gates";

// Every command of the step's `run: |` block, in order. Later plans append commands here
// in the same pull request that adds them to ci.yml.
export const EXPECTED_BRAND_STEP_COMMANDS: readonly string[] = [
	"set -euo pipefail",
	"yarn brand:fetch",
	"node .storybook/catalog/brand_quote_check.mjs",
];

function workflowJob(source: string, name: string): string | undefined {
	const header = new RegExp(`^ {2}${name}:\\s*$`, "mu").exec(source);
	if (header === null) return undefined;
	const rest = source.slice(header.index + header[0].length);
	const next = /^ {2}[A-Za-z0-9_-]+:\s*$/mu.exec(rest);
	return source.slice(
		header.index,
		next === null
			? source.length
			: header.index + header[0].length + next.index,
	);
}

function stepNames(job: string): string[] {
	return [...job.matchAll(/^ {6}- name: (.+)$/gm)].map((m) => m[1] ?? "");
}

// The text of one step: from its `- name:` line to the next step's `- ` line.
function stepChunk(job: string, name: string): string | undefined {
	const start = job.indexOf(`      - name: ${name}\n`);
	if (start === -1) return undefined;
	const rest = job.slice(start + 1);
	const next = /^ {6}- /m.exec(rest);
	return next === null
		? job.slice(start)
		: job.slice(start, start + 1 + next.index);
}

// The lines of the step's `run: |` block, trimmed.
function runCommands(chunk: string): string[] {
	const block = /^ {8}run: \|\n((?: {10}.*\n?)+)/m.exec(chunk);
	if (block === null) return [];
	return (block[1] ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
}

export function ciWorkflowPolicyProblems(text: string): string[] {
	const problems: string[] = [];
	const job = workflowJob(text, "test");
	if (job === undefined) {
		return ["the test job is missing"];
	}
	const names = stepNames(job);

	const occurrences = names.filter((name) => name === BRAND_STEP_NAME).length;
	if (occurrences !== 1) {
		problems.push(
			`the ${BRAND_STEP_NAME} step must exist exactly once in the test job (found ${occurrences})`,
		);
	}
	const brandAt = names.indexOf(BRAND_STEP_NAME);
	const docsAt = names.indexOf("Documentation drift");
	const lintAt = names.indexOf("Lint (Prettier)");
	if (docsAt === -1 || lintAt === -1) {
		problems.push(
			"the Documentation drift and Lint (Prettier) steps must exist to anchor the position",
		);
	} else if (brandAt !== -1 && !(docsAt < brandAt && brandAt < lintAt)) {
		problems.push(
			`the ${BRAND_STEP_NAME} step must sit after Documentation drift and before Lint (Prettier)`,
		);
	}

	const installAt = names.indexOf("Install dependencies");
	const sealAt = names.indexOf("Seal native dependency");
	if (installAt === -1 || sealAt === -1 || sealAt !== installAt + 1) {
		problems.push(
			"the native dependency seal step must immediately follow the install step",
		);
	}

	const chunk = stepChunk(job, BRAND_STEP_NAME);
	if (chunk !== undefined) {
		const commands = runCommands(chunk);
		for (const expected of EXPECTED_BRAND_STEP_COMMANDS) {
			if (!commands.includes(expected)) {
				problems.push(`the brand step is missing the command: ${expected}`);
			}
		}
		for (const found of commands) {
			if (!EXPECTED_BRAND_STEP_COMMANDS.includes(found)) {
				problems.push(`the brand step has an unexpected command: ${found}`);
			}
		}
		const sameSet =
			commands.length === EXPECTED_BRAND_STEP_COMMANDS.length &&
			EXPECTED_BRAND_STEP_COMMANDS.every((expected) =>
				commands.includes(expected),
			);
		if (
			sameSet &&
			commands.join("\n") !== EXPECTED_BRAND_STEP_COMMANDS.join("\n")
		) {
			problems.push("the brand step commands are out of order");
		}
		if (/^ {8}continue-on-error:/m.test(chunk)) {
			problems.push("the brand step must not set continue-on-error");
		}
		if (/^ {8}if:/m.test(chunk)) {
			problems.push("the brand step must not carry an if:");
		}
	}

	// The first step of the job is the checkout; the merge-base check reads history from it.
	const firstStep = job.split("    steps:\n")[1]?.split(/^ {6}- /m)[1] ?? "";
	if (
		!/uses: actions\/checkout@/.test(firstStep) ||
		!/^ {10}fetch-depth: 0$/m.test(firstStep)
	) {
		problems.push("the test job checkout must set fetch-depth: 0");
	}
	return problems;
}

const WORKFLOW_FILE = path.resolve(
	import.meta.dirname,
	"../../.github/workflows/ci.yml",
);

describe("ci.yml policy: Brand pin, quote and drift gates (GAT-01, D-13)", () => {
	const checkedIn = readFileSync(WORKFLOW_FILE, "utf8");

	test("the checked-in workflow satisfies the policy", () => {
		expect(ciWorkflowPolicyProblems(checkedIn)).toEqual([]);
	});

	test("the policy reads real step names (anti-vacuity)", () => {
		const job = workflowJob(checkedIn, "test");
		expect(job).toBeDefined();
		const names = stepNames(job ?? "");
		expect(names.length).toBeGreaterThanOrEqual(15);
		for (const anchor of [
			"Install dependencies",
			"Seal native dependency",
			"Documentation drift",
			BRAND_STEP_NAME,
			"Lint (Prettier)",
		]) {
			expect(names).toContain(anchor);
		}
		const chunk = stepChunk(job ?? "", BRAND_STEP_NAME);
		expect(runCommands(chunk ?? "")).toEqual([...EXPECTED_BRAND_STEP_COMMANDS]);
	});

	const STEP_PATTERN = new RegExp(
		`^ {6}- name: ${BRAND_STEP_NAME}\\n(?: {8}.*\\n)+`,
		"m",
	);

	function removeStep(text: string): { without: string; step: string } {
		const found = STEP_PATTERN.exec(text);
		if (found === null)
			throw new Error("the brand step is missing from ci.yml");
		return { without: text.replace(found[0], ""), step: found[0] };
	}

	const MUTATIONS: ReadonlyArray<[string, (text: string) => string, string]> = [
		["step removed", (t) => removeStep(t).without, "must exist exactly once"],
		[
			"continue-on-error added",
			(t) =>
				t.replace(
					`      - name: ${BRAND_STEP_NAME}\n`,
					`      - name: ${BRAND_STEP_NAME}\n        continue-on-error: true\n`,
				),
			"must not set continue-on-error",
		],
		[
			"if: false added",
			(t) =>
				t.replace(
					`      - name: ${BRAND_STEP_NAME}\n`,
					`      - name: ${BRAND_STEP_NAME}\n        if: false\n`,
				),
			"must not carry an if:",
		],
		[
			"step moved after Lint (Prettier)",
			(t) => {
				const { without, step } = removeStep(t);
				const lint = "      - name: Lint (Prettier)\n        run: yarn lint\n";
				return without.replace(lint, `${lint}\n${step}`);
			},
			"must sit after Documentation drift and before Lint (Prettier)",
		],
		[
			"step moved between install and seal",
			(t) => {
				const { without, step } = removeStep(t);
				const install =
					"      - name: Install dependencies\n        run: yarn install --frozen-lockfile\n";
				return without.replace(install, `${install}\n${step}`);
			},
			"must immediately follow the install step",
		],
		[
			"a command dropped",
			(t) => t.replace("          yarn brand:fetch\n", ""),
			"is missing the command: yarn brand:fetch",
		],
		[
			"two commands swapped",
			(t) =>
				t.replace(
					"          yarn brand:fetch\n          node .storybook/catalog/brand_quote_check.mjs\n",
					"          node .storybook/catalog/brand_quote_check.mjs\n          yarn brand:fetch\n",
				),
			"commands are out of order",
		],
		[
			"an unexpected command added",
			(t) =>
				t.replace(
					"          node .storybook/catalog/brand_quote_check.mjs\n",
					"          node .storybook/catalog/brand_quote_check.mjs\n          echo skipped\n",
				),
			"has an unexpected command: echo skipped",
		],
		[
			"fetch-depth: 0 removed",
			(t) => t.replace("        with:\n          fetch-depth: 0\n", ""),
			"checkout must set fetch-depth: 0",
		],
	];

	test.each(MUTATIONS)("rejects %s", (_name, mutate, property) => {
		const mutated = mutate(checkedIn);
		expect(mutated).not.toBe(checkedIn);
		expect(ciWorkflowPolicyProblems(mutated).join("\n")).toContain(property);
	});
});
