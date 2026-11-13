import { describe, expect, test } from "vitest";
import config from "../vitest.storybook.config";
import { HOVER_TIMEOUT_MS } from "../src/renderer/story_support/real_pointer";

// WR-01 (review): withRealHover's own timeout only produces its helpful message if the
// test that calls it lives longer. Vitest browser mode defaults to 15 s, so a 20 s hover
// limit was unreachable in every story project that did not set testTimeout. The addon
// generates the story tests, so the project's testTimeout is the only knob.
const MARGIN_MS = 10_000;

// A project's own testTimeout, or undefined when it sets none (vitest then applies 15 s
// in browser mode and 5 s otherwise).
export function projectTimeout(
	projects: ReadonlyArray<unknown>,
	name: string,
): number | undefined {
	for (const project of projects) {
		const test = (project as { test?: Record<string, unknown> }).test;
		if (test?.["name"] === name) {
			const timeout = test["testTimeout"];
			return typeof timeout === "number" ? timeout : undefined;
		}
	}
	throw new Error(`no vitest project named ${name}`);
}

export function timeoutProblems(
	projects: ReadonlyArray<unknown>,
	names: readonly string[],
	hoverMs: number,
): string[] {
	const problems: string[] = [];
	for (const name of names) {
		const timeout = projectTimeout(projects, name);
		if (timeout === undefined || timeout < hoverMs + MARGIN_MS) {
			problems.push(
				`${name}: testTimeout is ${String(timeout)}, below the ${hoverMs} ms hover limit plus ${MARGIN_MS} ms`,
			);
		}
	}
	return problems.sort();
}

const STORY_PROJECTS = ["storybook-light", "storybook-dark"] as const;
const projects = config.test?.projects ?? [];

describe("story project timeouts versus the real-hover limit (review WR-01)", () => {
	test("every story project's testTimeout exceeds the hover limit with margin", () => {
		expect(timeoutProblems(projects, STORY_PROJECTS, HOVER_TIMEOUT_MS)).toEqual(
			[],
		);
	});

	test("a project with no testTimeout, or one at the hover limit, is reported", () => {
		const unset = [{ test: { name: "p" } }];
		const atLimit = [{ test: { name: "p", testTimeout: HOVER_TIMEOUT_MS } }];
		const wellAbove = [
			{ test: { name: "p", testTimeout: HOVER_TIMEOUT_MS + MARGIN_MS } },
		];
		expect(timeoutProblems(unset, ["p"], HOVER_TIMEOUT_MS)).toHaveLength(1);
		expect(timeoutProblems(atLimit, ["p"], HOVER_TIMEOUT_MS)).toHaveLength(1);
		expect(timeoutProblems(wellAbove, ["p"], HOVER_TIMEOUT_MS)).toEqual([]);
	});

	test("the story projects are really in the config (the check is not vacuous)", () => {
		for (const name of STORY_PROJECTS) {
			expect(() => projectTimeout(projects, name)).not.toThrow();
		}
		expect(() => projectTimeout(projects, "no-such-project")).toThrow();
	});
});
