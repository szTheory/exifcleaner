// The browser-safe half of the journey dead-end check (FLW-01, D-22, D-23).
//
// This module has no import statement at all. `.storybook/journey_gate.test.tsx`
// runs it in a real browser (the storybook-a11y-gate project), and every other
// catalog module reaches node:fs or the typescript compiler, so the probe
// contract lives here on its own and journeys.mjs (node only) composes its full
// code list from these codes. The code-unit comparison is copied from
// closed.mjs, not imported, for the same reason (closed.mjs imports node:fs).
//
// What a passing `story` step means, honestly: in some story of the step's
// scenario the control is present, named exactly, enabled and keyboard
// reachable. It does not claim the control works; effects are proven by an e2e
// test or a play function. Names match by exact, case-sensitive accessible-name
// equality, never by substring.
//
// `stepProblems` is pure: the DOM, and the story runs that fill it, come in as
// the injected `probe`, so a node test can drive every code with a fake probe.

export const JOURNEY_PROBE_CODES = Object.freeze([
	"action-disabled",
	"action-missing",
	"action-unreachable",
	"story-run-failed",
	"unknown-scenario",
]);

/**
 * The derived step id: `J-04.3` is the third step of job J-04. It is never
 * stored in a journey file, so reordering steps cannot leave a stale id.
 *
 * @param {string} job
 * @param {number} index zero-based position of the step in the file
 * @returns {string}
 */
export function stepId(job, index) {
	return `${job}.${index + 1}`;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareCodeUnits(a, b) {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

// What a failed probe says about the step, by status.
const STATUS_CODES = {
	missing: "action-missing",
	disabled: "action-disabled",
	unreachable: "action-unreachable",
	"run-failed": "story-run-failed",
};

// When several stories of one scenario fail differently, the step reports the
// one nearest to a pass: an enabled control no keyboard reaches, then a disabled
// one, then none at all. A story that did not even run says the least, so
// run-failed is reported only when every story of the scenario failed to run.
const NEAREST_FIRST = ["unreachable", "disabled", "missing", "run-failed"];

/**
 * @param {unknown} result
 * @returns {{ status: string, message: string }}
 */
function normalize(result) {
	if (typeof result !== "object" || result === null) {
		return { status: "run-failed", message: "the probe returned no result" };
	}
	const status = Reflect.get(result, "status");
	const message = Reflect.get(result, "message");
	const text = typeof message === "string" ? message : "";
	if (status === "ok" || Object.hasOwn(STATUS_CODES, String(status))) {
		return { status: String(status), message: text };
	}
	return {
		status: "run-failed",
		message: `the probe returned an unknown status ${String(status)}`,
	};
}

/**
 * Probes every `story` and `story+e2e` step that has a `{ role, name }` action;
 * e2e, unproven and gesture steps are never probed.
 *
 * @param {object} inputs
 * @param {{ job: string, steps?: ReadonlyArray<any> }} inputs.journey
 * @param {ReadonlyMap<string, readonly string[]>} inputs.scenarios scenario id to its story ids
 * @param {(storyId: string, action: { role: string, name: string }) => Promise<{ status: string, message?: string }>} inputs.probe
 * @returns {Promise<Array<{ code: string, job: string, step: string, scenario: string, message: string }>>}
 */
export async function stepProblems({ journey, scenarios, probe }) {
	const problems = [];
	const steps = Array.isArray(journey.steps) ? journey.steps : [];
	for (const [index, step] of steps.entries()) {
		if (step.proof !== "story" && step.proof !== "story+e2e") continue;
		const action = step.action;
		if (typeof action?.role !== "string" || typeof action?.name !== "string") {
			continue;
		}
		const id = stepId(journey.job, index);
		const where = `${id} (${step.scenario}): ${action.role} "${action.name}"`;
		const storyIds = scenarios.get(step.scenario);
		if (storyIds === undefined) {
			problems.push({
				code: "unknown-scenario",
				job: journey.job,
				step: id,
				scenario: step.scenario,
				message: `${where}: scenario ${step.scenario} is not in the scenario manifest`,
			});
			continue;
		}
		/** @type {Array<{ storyId: string, status: string, message: string }>} */
		const failures = [];
		let resolved = false;
		for (const storyId of storyIds) {
			let result;
			try {
				result = normalize(
					await probe(storyId, { role: action.role, name: action.name }),
				);
			} catch (error) {
				result = {
					status: "run-failed",
					message: error instanceof Error ? error.message : String(error),
				};
			}
			if (result.status === "ok") {
				resolved = true;
				break;
			}
			failures.push({ storyId, ...result });
		}
		if (resolved) continue;
		const best = NEAREST_FIRST.find((status) =>
			failures.some((failure) => failure.status === status),
		);
		const status = best ?? "missing";
		const evidence = failures
			.filter((failure) => failure.status === status)
			.map((failure) =>
				failure.message === ""
					? failure.storyId
					: `${failure.storyId} (${failure.message})`,
			)
			.join(", ");
		problems.push({
			code: STATUS_CODES[/** @type {keyof typeof STATUS_CODES} */ (status)],
			job: journey.job,
			step: id,
			scenario: step.scenario,
			message:
				failures.length === 0
					? `${where}: scenario ${step.scenario} lists no stories`
					: `${where}: ${status} in ${evidence}`,
		});
	}
	return problems.sort(
		(a, b) =>
			compareCodeUnits(a.code, b.code) ||
			compareCodeUnits(a.job, b.job) ||
			compareCodeUnits(a.step, b.step),
	);
}
