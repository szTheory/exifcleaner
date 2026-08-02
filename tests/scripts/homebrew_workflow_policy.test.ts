import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const COMPLIANT_WORKFLOW = `
name: Homebrew Cask Status

on:
  release:
    types: [published]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  report-cask-status:
    name: Report upstream cask status
    if: github.event_name == 'workflow_dispatch' || !github.event.release.prerelease
    runs-on: macos-15
    timeout-minutes: 10
    steps:
      - name: Query Homebrew's supported cask metadata
        run: |
          brew info --cask --json=v2 exifcleaner
          echo "https://docs.brew.sh/How-To-Open-a-Homebrew-Pull-Request"
`;

type PolicyResult = { ok: true } | { ok: false; reason: string };

function workflowPolicy(workflow: string): PolicyResult {
	if (!/release:\n\s+types:\s*\[published\]/.test(workflow)) {
		return { ok: false, reason: "release trigger must be published" };
	}
	if (!workflow.includes("report-cask-status:")) {
		return { ok: false, reason: "status-reporting job is missing" };
	}
	if (
		!workflow.includes(
			"if: github.event_name == 'workflow_dispatch' || !github.event.release.prerelease",
		)
	) {
		return { ok: false, reason: "stable-release guard is missing" };
	}
	if (!/^permissions:\n\s+contents:\s+read$/m.test(workflow)) {
		return { ok: false, reason: "workflow permissions must be read-only" };
	}
	if (!workflow.includes("runs-on: macos-15")) {
		return { ok: false, reason: "runner must be explicit" };
	}
	if (!workflow.includes("timeout-minutes:")) {
		return { ok: false, reason: "job timeout is missing" };
	}
	if (!workflow.includes("brew info --cask --json=v2 exifcleaner")) {
		return { ok: false, reason: "supported cask health query is missing" };
	}
	if (
		workflow.includes("HOMEBREW_TOKEN") ||
		workflow.includes("action-homebrew-bump-cask") ||
		workflow.includes("brew bump-cask-pr") ||
		workflow.includes("gh issue")
	) {
		return { ok: false, reason: "workflow must not mutate upstream state" };
	}
	return { ok: true };
}

describe("Homebrew workflow health-report policy", () => {
	test("accepts a read-only stable-release health report", () => {
		expect(workflowPolicy(COMPLIANT_WORKFLOW)).toEqual({ ok: true });
	});

	test.each([
		["non-published trigger", "[published]", "[prereleased]", "published"],
		[
			"missing stable guard",
			"    if: github.event_name == 'workflow_dispatch' || !github.event.release.prerelease\n",
			"",
			"guard",
		],
		["writable token", "contents: read", "contents: write", "read-only"],
		["floating runner", "macos-15", "macos-latest", "explicit"],
		["missing timeout", "    timeout-minutes: 10\n", "", "timeout"],
	])("rejects %s", (_name, from, to, reason) => {
		expect(workflowPolicy(COMPLIANT_WORKFLOW.replace(from, to))).toEqual({
			ok: false,
			reason: expect.stringContaining(reason),
		});
	});

	test.each([
		"HOMEBREW_TOKEN",
		"macauley/action-homebrew-bump-cask@deadbeef",
		"brew bump-cask-pr exifcleaner",
		"gh issue create --title stale",
	])("rejects mutation capability: %s", (mutation) => {
		expect(workflowPolicy(`${COMPLIANT_WORKFLOW}\n# ${mutation}`)).toEqual({
			ok: false,
			reason: expect.stringContaining("must not mutate"),
		});
	});

	test("requires the checked-in workflow to uphold the policy", () => {
		const workflow = readFileSync(
			path.resolve(
				import.meta.dirname,
				"../../.github/workflows/homebrew-cask.yml",
			),
			"utf8",
		);
		expect(workflowPolicy(workflow)).toEqual({ ok: true });
	});
});
