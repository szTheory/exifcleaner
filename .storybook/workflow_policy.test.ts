import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// D-17 / SBK-04: policy for .github/workflows/storybook.yml, in the style of
// tests/scripts/homebrew_workflow_policy.test.ts. The policy is a pure function
// over the workflow text; the checked-in file must yield no problem and each
// planted mutation must yield a problem naming the property it broke.

const REQUIRED_PATHS = [
	"src/renderer/**",
	"src/domain/**",
	"src/common/**",
	"src/preload/api_types.ts",
	".storybook/**",
	"vitest.storybook.config.ts",
	"package.json",
	"yarn.lock",
	"tsconfig*.json",
	".resources/locales/**",
	".resources/strings.json",
	"tests/fakes/mock_window_api.ts",
	"tests/types/**",
	"brand.pin.json",
	"src/main/reveal_handlers.ts",
	"src/main/exif_handlers.ts",
	"src/application/queries/verify_generated_output_query.ts",
	"scripts/findings_ratchet.mjs",
	"scripts/storybook_budget_check.mjs",
	"docs/evidence/known-findings.json",
	"docs/evidence/storybook-ci-budget.json",
	".github/workflows/storybook.yml",
];

// The `paths:` list of one `on:` event (push or pull_request).
function eventPaths(text: string, event: string): string[] {
	const lines = text.split("\n");
	const start = lines.indexOf(`  ${event}:`);
	if (start === -1) return [];
	const paths: string[] = [];
	let inPaths = false;
	for (const line of lines.slice(start + 1)) {
		if (/^ {0,2}\S/.test(line)) break;
		if (line === "    paths:") {
			inPaths = true;
			continue;
		}
		if (inPaths) {
			const match = /^ {6}- "(.+)"$/.exec(line);
			if (match === null || match[1] === undefined) {
				inPaths = false;
				continue;
			}
			paths.push(match[1]);
		}
	}
	return paths;
}

function eventBlock(text: string, event: string): string {
	const lines = text.split("\n");
	const start = lines.indexOf(`  ${event}:`);
	if (start === -1) return "";
	const block: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (/^ {0,2}\S/.test(line)) break;
		block.push(line);
	}
	return block.join("\n");
}

function stepNames(text: string): string[] {
	return [...text.matchAll(/^ {6}- name: (.+)$/gm)].map((m) => m[1] ?? "");
}

export function workflowPolicyProblems(text: string): string[] {
	const problems: string[] = [];
	for (const event of ["push", "pull_request"]) {
		const listed = eventPaths(text, event);
		for (const required of REQUIRED_PATHS) {
			if (!listed.includes(required)) {
				problems.push(`${event} paths must include ${required}`);
			}
		}
	}
	if (
		JSON.stringify(eventPaths(text, "push")) !==
		JSON.stringify(eventPaths(text, "pull_request"))
	) {
		problems.push("push and pull_request path lists must be identical");
	}
	if (!/^ {4}branches: \[master\]$/m.test(eventBlock(text, "push"))) {
		problems.push("push must be filtered to branches: [master]");
	}
	if (!/^ {2}workflow_dispatch:/m.test(text)) {
		problems.push("workflow_dispatch trigger is missing");
	}
	if (/^ {2}pull_request_target:/m.test(text)) {
		problems.push("pull_request_target is forbidden");
	}
	if (!/^permissions:\n {2}contents: read$/m.test(text)) {
		problems.push("workflow permissions must be contents: read");
	}
	if (!/^ {4}runs-on: ubuntu-24\.04$/m.test(text)) {
		problems.push("runner must be ubuntu-24.04");
	}
	if (!/^ {4}timeout-minutes: 10$/m.test(text)) {
		problems.push("job timeout-minutes must be 10");
	}
	if (!/^env:\n {2}STORYBOOK_DISABLE_TELEMETRY: "true"$/m.test(text)) {
		problems.push("workflow env STORYBOOK_DISABLE_TELEMETRY must be true");
	}
	for (const line of text.split("\n")) {
		const match = /\buses:\s*(\S+)/.exec(line);
		if (match !== null && !/@[0-9a-f]{40}$/.test(match[1] ?? "")) {
			problems.push(`action must be pinned to a 40-hex SHA: ${match[1]}`);
		}
	}
	if (!/^ {10}fetch-depth: 0$/m.test(text)) {
		problems.push("checkout must use fetch-depth: 0");
	}
	if (!text.includes("run: yarn install --frozen-lockfile --ignore-scripts")) {
		problems.push("install must use --frozen-lockfile --ignore-scripts");
	}
	if (!/^ {8}run: yarn test:storybook$/m.test(text)) {
		problems.push("the yarn test:storybook step is missing");
	}
	const steps =
		text
			.split("    steps:\n")[1]
			?.split(/^ {6}- /m)
			.slice(1) ?? [];
	const first = steps[0] ?? "";
	if (
		!first.startsWith("name: Record job start") ||
		!first.includes('echo "STORYBOOK_JOB_START=$(date +%s)" >> "$GITHUB_ENV"')
	) {
		problems.push(
			"the first step must record STORYBOOK_JOB_START (Record job start)",
		);
	}
	const last = steps[steps.length - 1] ?? "";
	if (
		!last.startsWith("name: Runtime budget") ||
		!/^ {8}if: always\(\)$/m.test(last) ||
		!last.includes("run: node scripts/storybook_budget_check.mjs")
	) {
		problems.push(
			"the last step must be Runtime budget with if: always() running storybook_budget_check.mjs",
		);
	}
	const testAt = text.indexOf("run: yarn test:storybook\n");
	const ratchetAt = text.indexOf(
		"run: node scripts/findings_ratchet.mjs --check --index storybook-static/index.json",
	);
	if (ratchetAt === -1 || testAt === -1 || ratchetAt < testAt) {
		problems.push(
			"the findings_ratchet.mjs --check step must follow yarn test:storybook",
		);
	}
	// Phase 71 (D-05, T-71-16): the Catalog ratchets step is present, between the
	// findings ratchet and the runtime budget, and can neither be skipped nor
	// made non-fatal.
	const catalogRun =
		"run: node .storybook/catalog/catalog.mjs --check --index storybook-static/index.json";
	const catalogStep = steps.find((step) =>
		step.startsWith("name: Catalog ratchets\n"),
	);
	const catalogAt = text.indexOf(catalogRun);
	if (catalogStep === undefined || catalogAt === -1) {
		problems.push(
			"the Catalog ratchets step running catalog.mjs --check --index storybook-static/index.json is missing",
		);
	} else {
		const budgetAt = text.indexOf("- name: Runtime budget");
		if (ratchetAt === -1 || catalogAt < ratchetAt || catalogAt > budgetAt) {
			problems.push(
				"the Catalog ratchets step must follow the Findings ratchet step and precede Runtime budget",
			);
		}
		if (!catalogStep.includes(catalogRun)) {
			problems.push(
				"the Catalog ratchets step must run catalog.mjs --check --index storybook-static/index.json",
			);
		}
		if (/^ {8}continue-on-error:/m.test(catalogStep)) {
			problems.push("the Catalog ratchets step must not set continue-on-error");
		}
		if (/^ {8}if:/m.test(catalogStep)) {
			problems.push("the Catalog ratchets step must not carry an if:");
		}
	}
	return problems;
}

const WORKFLOW_FILE = path.resolve(
	import.meta.dirname,
	"../.github/workflows/storybook.yml",
);

describe("storybook.yml policy (D-17, SBK-04)", () => {
	const checkedIn = readFileSync(WORKFLOW_FILE, "utf8");

	test("the checked-in workflow satisfies the policy", () => {
		expect(workflowPolicyProblems(checkedIn)).toEqual([]);
	});

	test("the policy reads real step names (anti-vacuity)", () => {
		expect(stepNames(checkedIn).length).toBeGreaterThanOrEqual(5);
		expect(eventPaths(checkedIn, "push").length).toBe(REQUIRED_PATHS.length);
		expect(eventPaths(checkedIn, "pull_request").length).toBe(
			REQUIRED_PATHS.length,
		);
	});

	const MUTATIONS: ReadonlyArray<[string, (text: string) => string, string]> = [
		[
			"push list drops .storybook/**",
			(t) => t.replace('      - ".storybook/**"\n', ""),
			"push paths must include .storybook/**",
		],
		[
			"pull_request list drops .storybook/**",
			(t) => {
				const at = t.lastIndexOf('      - ".storybook/**"\n');
				return (
					t.slice(0, at) + t.slice(at + '      - ".storybook/**"\n'.length)
				);
			},
			"pull_request paths must include .storybook/**",
		],
		[
			"write permission",
			(t) => t.replace("contents: read", "contents: write"),
			"contents: read",
		],
		[
			"floating runner",
			(t) => t.replace("ubuntu-24.04", "ubuntu-latest"),
			"ubuntu-24.04",
		],
		[
			"timeout removed",
			(t) => t.replace("    timeout-minutes: 10\n", ""),
			"timeout-minutes",
		],
		[
			"telemetry env removed",
			(t) => t.replace('env:\n  STORYBOOK_DISABLE_TELEMETRY: "true"\n', ""),
			"STORYBOOK_DISABLE_TELEMETRY",
		],
		[
			"action pinned to a tag",
			(t) =>
				t.replace(
					/actions\/checkout@[0-9a-f]{40} # v7\.0\.1/,
					"actions/checkout@v4",
				),
			"40-hex SHA",
		],
		[
			"pull_request_target trigger",
			(t) => t.replace("  pull_request:\n", "  pull_request_target:\n"),
			"pull_request_target is forbidden",
		],
		[
			"push branch filter removed",
			(t) => t.replace("    branches: [master]\n", ""),
			"branches: [master]",
		],
		[
			"workflow_dispatch removed",
			(t) => t.replace("  workflow_dispatch:\n", ""),
			"workflow_dispatch",
		],
		[
			"shallow checkout",
			(t) => t.replace("          fetch-depth: 0\n", ""),
			"fetch-depth: 0",
		],
		[
			"install without --ignore-scripts",
			(t) => t.replace(" --ignore-scripts", ""),
			"--ignore-scripts",
		],
		[
			"test step removed",
			(t) => t.replace("        run: yarn test:storybook\n", ""),
			"yarn test:storybook",
		],
		[
			"ratchet step removed",
			(t) =>
				t.replace(
					/\n {6}# Shrink-only baseline[\s\S]*?storybook-static\/index\.json\n/,
					"\n",
				),
			"findings_ratchet.mjs --check",
		],
		[
			"catalog step removed",
			(t) =>
				t.replace(
					/\n {6}# Phase 71 \(D-05\)[\s\S]*?storybook-static\/index\.json\n/,
					"\n",
				),
			"the Catalog ratchets step running catalog.mjs --check",
		],
		[
			"catalog step moved before findings ratchet",
			(t) => {
				const found =
					/\n( {6}# Phase 71 \(D-05\)[\s\S]*?storybook-static\/index\.json\n)/.exec(
						t,
					);
				if (found === null || found[1] === undefined) return t;
				return t
					.replace(found[0], "\n")
					.replace(
						"      # Shrink-only baseline",
						`${found[1]}\n      # Shrink-only baseline`,
					);
			},
			"must follow the Findings ratchet step",
		],
		[
			"catalog step continue-on-error",
			(t) =>
				t.replace(
					"        run: node .storybook/catalog/catalog.mjs",
					"        continue-on-error: true\n        run: node .storybook/catalog/catalog.mjs",
				),
			"the Catalog ratchets step must not set continue-on-error",
		],
		[
			"catalog step gains if",
			(t) =>
				t.replace(
					"        run: node .storybook/catalog/catalog.mjs",
					"        if: github.event_name == 'pull_request'\n        run: node .storybook/catalog/catalog.mjs",
				),
			"the Catalog ratchets step must not carry an if:",
		],
		[
			"brand.pin.json dropped from push",
			(t) => t.replace('      - "brand.pin.json"\n', ""),
			"push paths must include brand.pin.json",
		],
		[
			"reveal_handlers dropped from pull_request",
			(t) => {
				const entry = '      - "src/main/reveal_handlers.ts"\n';
				const at = t.lastIndexOf(entry);
				return t.slice(0, at) + t.slice(at + entry.length);
			},
			"pull_request paths must include src/main/reveal_handlers.ts",
		],
		[
			"budget step removed",
			(t) =>
				t.replace(/\n {6}# SBK-04 \/ D-18[\s\S]*budget_check\.mjs\n/, "\n"),
			"the last step must be Runtime budget",
		],
		[
			"budget step loses always()",
			(t) => t.replace("        if: always()\n", ""),
			"if: always()",
		],
		[
			"job start step removed",
			(t) => t.replace(/\n {6}# First step[\s\S]*GITHUB_ENV"\n/, ""),
			"STORYBOOK_JOB_START",
		],
	];

	test.each(MUTATIONS)("rejects %s", (_name, mutate, property) => {
		const mutated = mutate(checkedIn);
		expect(mutated).not.toBe(checkedIn);
		const problems = workflowPolicyProblems(mutated);
		expect(problems.length).toBeGreaterThan(0);
		expect(problems.join("\n")).toContain(property);
	});
});
