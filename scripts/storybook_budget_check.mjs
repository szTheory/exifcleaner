// Self-enforcing runtime budget for the Storybook CI job (SBK-04, D-18).
//
// docs/evidence/storybook-ci-budget.json records the runtime measured from a
// real hosted run (`runId`) and the budget the job may not exceed. The job's
// first step exports STORYBOOK_JOB_START (epoch seconds); its final
// `if: always()` step runs this script, which fails when the elapsed time is
// over the budget. A missing budget file is the one bootstrap case: the file
// can only name the run id of a run that already happened (P-13), so the run
// that produces it passes with a BOOTSTRAP notice.
//
// STORYBOOK_JOB_NOW (epoch seconds) pins the clock for the CLI tests.
// Nothing in TypeScript imports this script; its tests drive the CLI.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUDGET_PATH = "docs/evidence/storybook-ci-budget.json";

const KEYS = ["phase", "stories", "measuredSeconds", "budgetSeconds", "runId"];

function problem(code, message) {
	return { code, message };
}

function isPositiveInteger(value) {
	return Number.isInteger(value) && value > 0;
}

/**
 * Anything else, including placeholders, is a problem.
 *
 * @param {unknown} doc
 * @returns {{code: string, message: string}[]}
 */
export function validateBudget(doc) {
	if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
		return [problem("not-object", "budget must be a JSON object")];
	}
	const problems = [];
	for (const key of KEYS) {
		if (!(key in doc)) {
			problems.push(problem("missing-field", `missing field ${key}`));
		}
	}
	for (const key of Object.keys(doc)) {
		if (!KEYS.includes(key)) {
			problems.push(problem("unknown-field", `unknown field ${key}`));
		}
	}
	if (problems.length > 0) return problems;
	if (typeof doc.phase !== "string" || doc.phase === "") {
		problems.push(problem("bad-phase", "phase must be a non-empty string"));
	}
	if (!isPositiveInteger(doc.stories)) {
		problems.push(problem("bad-stories", "stories must be a positive integer"));
	}
	if (!isPositiveInteger(doc.measuredSeconds)) {
		problems.push(
			problem("bad-measured", "measuredSeconds must be a positive integer"),
		);
	}
	if (!isPositiveInteger(doc.budgetSeconds)) {
		problems.push(
			problem("bad-budget", "budgetSeconds must be a positive integer"),
		);
	}
	if (typeof doc.runId !== "string" || !/^[0-9]+$/.test(doc.runId)) {
		problems.push(
			problem("bad-run-id", "runId must be a string of digits (a real run id)"),
		);
	}
	if (
		isPositiveInteger(doc.measuredSeconds) &&
		isPositiveInteger(doc.budgetSeconds) &&
		doc.measuredSeconds > doc.budgetSeconds
	) {
		problems.push(
			problem(
				"measured-over-budget",
				`measuredSeconds ${doc.measuredSeconds} exceeds budgetSeconds ${doc.budgetSeconds}`,
			),
		);
	}
	return problems;
}

/**
 * @param {{elapsedSeconds: number, budgetSeconds: number}} subject
 * @returns {{ok: boolean, message: string}}
 */
export function evaluateBudget({ elapsedSeconds, budgetSeconds }) {
	const ok = elapsedSeconds <= budgetSeconds;
	return {
		ok,
		message: ok
			? `elapsed ${elapsedSeconds}s is within the ${budgetSeconds}s budget`
			: `elapsed ${elapsedSeconds}s exceeds the ${budgetSeconds}s budget`,
	};
}

/**
 * @param {string[]} _argv
 * @returns {number} exit code
 */
export function main(_argv = process.argv.slice(2)) {
	try {
		const startText = process.env["STORYBOOK_JOB_START"];
		if (startText === undefined || !/^[0-9]+$/.test(startText)) {
			console.error(
				"✗ STORYBOOK BUDGET FAILED: start-missing: STORYBOOK_JOB_START must be epoch seconds (the job's first step exports it)",
			);
			return 1;
		}
		const nowText = process.env["STORYBOOK_JOB_NOW"];
		const now =
			nowText !== undefined && /^[0-9]+$/.test(nowText)
				? Number(nowText)
				: Math.floor(Date.now() / 1000);
		const elapsedSeconds = now - Number(startText);

		const file = path.join(process.cwd(), BUDGET_PATH);
		if (!fs.existsSync(file)) {
			console.log(`BOOTSTRAP: no budget file yet; elapsed ${elapsedSeconds}s`);
			return 0;
		}
		const budget = JSON.parse(fs.readFileSync(file, "utf8"));
		const problems = validateBudget(budget);
		if (problems.length > 0) {
			for (const found of problems) {
				console.error(
					`✗ STORYBOOK BUDGET FAILED: ${found.code}: ${found.message}`,
				);
			}
			return 1;
		}
		const result = evaluateBudget({
			elapsedSeconds,
			budgetSeconds: budget.budgetSeconds,
		});
		const summary = process.env["GITHUB_STEP_SUMMARY"];
		if (summary !== undefined && summary !== "") {
			fs.appendFileSync(
				summary,
				[
					"### Storybook runtime budget",
					"",
					"| elapsed (s) | budget (s) | measured (s) | measured run |",
					"| --- | --- | --- | --- |",
					`| ${elapsedSeconds} | ${budget.budgetSeconds} | ${budget.measuredSeconds} | ${budget.runId} |`,
					"",
				].join("\n"),
			);
		}
		if (!result.ok) {
			console.error(
				`✗ STORYBOOK BUDGET FAILED: over-budget: ${result.message}`,
			);
			return 1;
		}
		console.log(`✓ STORYBOOK BUDGET PASSED — ${result.message}`);
		return 0;
	} catch (error) {
		console.error(
			`✗ STORYBOOK BUDGET FAILED: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
