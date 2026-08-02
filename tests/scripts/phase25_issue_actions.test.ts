import { describe, expect, test } from "vitest";
import {
	buildIssueActions,
	PHASE25_MARKERS,
} from "../../scripts/phase25_issue_actions.mjs";

describe("Phase 25 allowlisted issue actions", () => {
	test("pre-release actions correct #217 and close only documented limits", () => {
		const actions = buildIssueActions({ stage: "pre-release" });

		expect(actions.map((action) => action.issue)).toEqual([217, 216, 182]);
		expect(actions.find((action) => action.issue === 217)?.close).toBe(false);
		expect(actions.find((action) => action.issue === 216)?.close).toBe(true);
		expect(actions.find((action) => action.issue === 182)?.close).toBe(true);
		expect(actions[0]?.body).toContain(
			"does **not** fix or establish the cause",
		);
		expect(actions[0]?.body).toContain(PHASE25_MARKERS[217]);
	});

	test("post-release actions use the publication date for the exact close date", () => {
		const actions = buildIssueActions({
			stage: "post-release",
			releaseUrl: "https://github.com/szTheory/exifcleaner/releases/tag/v4.0.1",
			publishedAt: "2026-08-02T23:30:00Z",
		});

		expect(actions.map((action) => action.issue)).toEqual([262, 139, 211, 254]);
		for (const issue of [139, 211, 254]) {
			const action = actions.find((candidate) => candidate.issue === issue);
			expect(action?.close).toBe(false);
			expect(action?.body).toContain("2026-09-01");
		}
		expect(actions.find((action) => action.issue === 262)?.body).toContain(
			"no signed build is being promised",
		);
	});

	test("rejects post-release actions without publication identity", () => {
		expect(() => buildIssueActions({ stage: "post-release" })).toThrow(
			"require --release-url and --published-at",
		);
	});

	test("contains no action outside the allowlist or for still-open investigations", () => {
		const allActions = [
			...buildIssueActions({ stage: "pre-release" }),
			...buildIssueActions({
				stage: "post-release",
				releaseUrl: "https://example.test/release",
				publishedAt: "2026-08-02T00:00:00Z",
			}),
		];

		expect(allActions.map((action) => action.issue).sort()).toEqual([
			139, 182, 211, 216, 217, 254, 262,
		]);
	});
});
