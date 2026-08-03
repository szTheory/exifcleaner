import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { classifyReleaseState } from "../../scripts/release_state_gate.mjs";

const HEAD_SHA = "a".repeat(40);
const RELEASE_SHA = "b".repeat(40);
const ROOT = path.resolve(import.meta.dirname, "../..");

describe("release state gate", () => {
	test("makes an existing public package version a strict no-op", () => {
		expect(
			classifyReleaseState({
				packageVersion: "4.1.0",
				headSha: HEAD_SHA,
				tag: { exists: true, sha: RELEASE_SHA },
				release: { exists: true, isDraft: false, tagName: "v4.1.0" },
			}),
		).toEqual({ action: "noop", tag: "v4.1.0" });
	});

	test("promotes a new version when both the release and tag are missing", () => {
		expect(
			classifyReleaseState({
				packageVersion: "4.2.0",
				headSha: HEAD_SHA,
				tag: { exists: false },
				release: { exists: false },
			}),
		).toEqual({ action: "promote", tag: "v4.2.0", reconcileTag: false });
	});

	test("continues promotion through an existing draft at the tested SHA", () => {
		expect(
			classifyReleaseState({
				packageVersion: "4.2.0",
				headSha: HEAD_SHA,
				tag: { exists: true, sha: HEAD_SHA },
				release: { exists: true, isDraft: true, tagName: "v4.2.0" },
			}),
		).toEqual({ action: "promote", tag: "v4.2.0", reconcileTag: false });
	});

	test("allows the audited draft-tag reconciliation for a wrong SHA", () => {
		expect(
			classifyReleaseState({
				packageVersion: "4.2.0",
				headSha: HEAD_SHA,
				tag: { exists: true, sha: RELEASE_SHA },
				release: { exists: true, isDraft: true, tagName: "v4.2.0" },
			}),
		).toEqual({ action: "promote", tag: "v4.2.0", reconcileTag: true });
	});

	test("continues from an unpublished tag already at the tested SHA", () => {
		expect(
			classifyReleaseState({
				packageVersion: "4.2.0",
				headSha: HEAD_SHA,
				tag: { exists: true, sha: HEAD_SHA },
				release: { exists: false },
			}),
		).toEqual({ action: "promote", tag: "v4.2.0", reconcileTag: false });
	});

	test.each([
		{
			name: "an orphan tag at the wrong SHA",
			tag: { exists: true, sha: RELEASE_SHA },
			release: { exists: false },
		},
		{
			name: "a draft without its tag",
			tag: { exists: false },
			release: { exists: true, isDraft: true, tagName: "v4.2.0" },
		},
		{
			name: "a public release without its tag",
			tag: { exists: false },
			release: { exists: true, isDraft: false, tagName: "v4.2.0" },
		},
		{
			name: "a release associated with a different tag",
			tag: { exists: true, sha: HEAD_SHA },
			release: { exists: true, isDraft: true, tagName: "v4.1.0" },
		},
	])("fails closed for $name", ({ tag, release }) => {
		expect(() =>
			classifyReleaseState({
				packageVersion: "4.2.0",
				headSha: HEAD_SHA,
				tag,
				release,
			}),
		).toThrow("Unsupported release state");
	});

	test("rejects abbreviated source SHAs", () => {
		expect(() =>
			classifyReleaseState({
				packageVersion: "4.2.0",
				headSha: "abc123",
				tag: { exists: false },
				release: { exists: false },
			}),
		).toThrow("headSha");
	});
});

describe("release workflow policy", () => {
	test("classifies public state before downloads and gates every promotion step", () => {
		const workflow = fs.readFileSync(
			path.join(ROOT, ".github/workflows/release.yml"),
			"utf8",
		);
		const classification = workflow.indexOf("Classify release eligibility");
		const firstDownload = workflow.indexOf(
			"Download native release evidence from tested CI run",
		);
		const tagMutation = workflow.indexOf(
			"Create or reconcile exact pre-publication version tag",
		);

		expect(classification).toBeGreaterThan(0);
		expect(classification).toBeLessThan(firstDownload);
		expect(classification).toBeLessThan(tagMutation);
		expect(workflow).toContain("node scripts/release_state_gate.mjs");
		expect(workflow).toContain(
			"if: steps.release_state.outputs.action == 'noop'",
		);

		for (const name of [
			"Setup Node.js",
			"Install dependencies",
			"Download native release evidence from tested CI run",
			"Download binaries from tested CI run",
			"Create or reconcile exact pre-publication version tag",
			"Create or update transient draft",
			"Publish audited release",
			"Audit downloaded published bytes",
		]) {
			const start = workflow.indexOf(`- name: ${name}`);
			const end = workflow.indexOf("\n      - name:", start + 1);
			const step = workflow.slice(start, end === -1 ? undefined : end);
			expect(step, name).toContain(
				"if: steps.release_state.outputs.action == 'promote'",
			);
		}
	});
});
