import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const GUARDED_JOB = `
  bump-cask:
    name: Update Homebrew Cask
    if: \${{ !github.event.release.prerelease }}
    runs-on: macos-latest
    steps:
      - name: Update Homebrew cask
        uses: macauley/action-homebrew-bump-cask@445c42390d790569d938f9068d01af39ca030feb
        with:
          token: \${{ secrets.HOMEBREW_TOKEN }}
          cask: exifcleaner
`;

const COMPLIANT_WORKFLOW = `
name: Update Homebrew Cask

on:
  release:
    types: [published]

permissions:
  contents: read

jobs:
${GUARDED_JOB}`;

type PolicyResult = { ok: true } | { ok: false; reason: string };

function bumpCaskJob(workflow: string): string {
	const jobStart = workflow.indexOf("  bump-cask:");
	if (jobStart === -1) {
		return "";
	}

	const nextJob = workflow.indexOf("\n  [a-zA-Z0-9_-]+:", jobStart + 1);
	return workflow.slice(jobStart, nextJob === -1 ? undefined : nextJob);
}

function workflowPolicy(workflow: string): PolicyResult {
	if (!/release:\n\s+types:\s*\[published\]/.test(workflow)) {
		return { ok: false, reason: "release trigger must be published" };
	}

	const job = bumpCaskJob(workflow);
	if (job === "") {
		return { ok: false, reason: "bump-cask job is missing" };
	}

	const guard = "if: ${{ !github.event.release.prerelease }}";
	const runsOn = "runs-on:";
	const steps = "steps:";
	if (
		!job.includes(guard) ||
		job.indexOf(guard) > job.indexOf(runsOn) ||
		job.indexOf(guard) > job.indexOf(steps)
	) {
		return { ok: false, reason: "bump-cask must have the job-level prerelease guard" };
	}

	if (!job.includes("secrets.HOMEBREW_TOKEN")) {
		return { ok: false, reason: "bump-cask must own the Homebrew PAT input" };
	}

	const outsideJob = workflow.replace(job, "");
	if (outsideJob.includes("HOMEBREW_TOKEN")) {
		return { ok: false, reason: "HOMEBREW_TOKEN must stay in bump-cask" };
	}

	return { ok: true };
}

describe("Homebrew workflow prerelease policy", () => {
	test("accepts the guarded published-release workflow", () => {
		expect(workflowPolicy(COMPLIANT_WORKFLOW)).toEqual({ ok: true });
	});

	test("rejects a missing job guard", () => {
		expect(workflowPolicy(COMPLIANT_WORKFLOW.replace("    if: ${{ !github.event.release.prerelease }}\n", ""))).toEqual({
			ok: false,
			reason: expect.stringContaining("job-level prerelease guard"),
		});
	});

	test("rejects a guard moved into the action step", () => {
		expect(workflowPolicy(COMPLIANT_WORKFLOW.replace("    if: ${{ !github.event.release.prerelease }}\n", "").replace("      - name: Update", "      - if: ${{ !github.event.release.prerelease }}\n        name: Update"))).toEqual({
			ok: false,
			reason: expect.stringContaining("job-level prerelease guard"),
		});
	});

	test("rejects an inverted job guard", () => {
		expect(workflowPolicy(COMPLIANT_WORKFLOW.replace("!github.event.release.prerelease", "github.event.release.prerelease"))).toEqual({
			ok: false,
			reason: expect.stringContaining("job-level prerelease guard"),
		});
	});

	test("rejects a non-published release trigger", () => {
		expect(workflowPolicy(COMPLIANT_WORKFLOW.replace("[published]", "[prereleased]"))).toEqual({
			ok: false,
			reason: expect.stringContaining("published"),
		});
	});

	test("rejects a PAT use outside the guarded job", () => {
		expect(workflowPolicy(COMPLIANT_WORKFLOW.replace("jobs:", "env:\n  TOKEN: ${{ secrets.HOMEBREW_TOKEN }}\n\njobs:"))).toEqual({
			ok: false,
			reason: expect.stringContaining("HOMEBREW_TOKEN"),
		});
	});

	test("requires the checked-in workflow to uphold the policy", () => {
		const workflow = readFileSync(
			path.resolve(import.meta.dirname, "../../.github/workflows/homebrew-cask.yml"),
			"utf8",
		);
		expect(workflowPolicy(workflow)).toEqual({ ok: true });
	});
});
