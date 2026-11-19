import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

type VisualCase = {
	story: string;
	theme: string;
	locale: string;
	width: number;
	height: number;
	file: string;
};
type VisualContract = {
	schemaVersion: number;
	maxImages: number;
	cases: VisualCase[];
	baselines: Record<string, { path: string; sha256: string }>;
};

const ROOT = process.cwd();
const CONTRACT_PATH = path.join(ROOT, ".storybook/visual-baselines.json");
const VALIDATOR_PATH = path.join(ROOT, "scripts/validate_visual_artifact.mjs");
const EXPECTED_IMAGE =
	"mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f";
const EXPECTED_COMMIT = "a".repeat(40);
const EXPECTED_RUN_ID = "44399958220";
const EXPECTED_RUN_ATTEMPT = "1";
const contract = JSON.parse(
	readFileSync(CONTRACT_PATH, "utf8"),
) as VisualContract;

let artifactRoot: string;
let manifestPath: string;
let manifest: Record<string, unknown>;
let beforeArtifact: ReturnType<typeof snapshotDir>;

function runValidator(
	value: Record<string, unknown>,
	expectedCommit = EXPECTED_COMMIT,
	expectedRunId = EXPECTED_RUN_ID,
	expectedRunAttempt = EXPECTED_RUN_ATTEMPT,
) {
	writeFileSync(manifestPath, `${JSON.stringify(value)}\n`);
	return spawnSync(
		process.execPath,
		[
			VALIDATOR_PATH,
			"--manifest",
			manifestPath,
			"--cases",
			CONTRACT_PATH,
			"--root",
			artifactRoot,
			"--expected-ref",
			"refs/heads/master",
			"--expected-commit",
			expectedCommit,
			"--expected-run-id",
			expectedRunId,
			"--expected-run-attempt",
			expectedRunAttempt,
		],
		{ cwd: ROOT, encoding: "utf8" },
	);
}

describe("visual artifact trusted run identity", () => {
	beforeAll(() => {
		artifactRoot = mkdtempSync(path.join(os.tmpdir(), "visual-artifact-"));
		beforeArtifact = snapshotDir(artifactRoot);
		manifestPath = path.join(artifactRoot, "manifest.json");
		const cases = contract.cases.map((item) => {
			const sourcePath = path.join(
				ROOT,
				".storybook",
				contract.baselines[item.file]?.path ?? "",
			);
			const targetPath = path.join(artifactRoot, item.file);
			copyFileSync(sourcePath, targetPath);
			const bytes = readFileSync(targetPath);
			const pixelWidth = Math.round(item.width * 0.9);
			const pixelHeight = Math.round(item.height * 0.9);
			return {
				...item,
				stable: true,
				attempts: 2,
				pixelWidth,
				pixelHeight,
				bytes: bytes.length,
				sha256: createHash("sha256").update(bytes).digest("hex"),
			};
		});
		manifest = {
			schemaVersion: 1,
			commit: EXPECTED_COMMIT,
			ref: "refs/heads/master",
			runId: EXPECTED_RUN_ID,
			runAttempt: EXPECTED_RUN_ATTEMPT,
			image: EXPECTED_IMAGE,
			deviceScaleFactor: 1,
			viewport: { width: 1280, height: 800, captureScale: 0.9 },
			cases,
		};
	});

	afterAll(() => {
		assertDirEffect(beforeArtifact, snapshotDir(artifactRoot), {
			added: ["manifest.json", ...contract.cases.map((item) => item.file)],
		});
		rmSync(artifactRoot, { recursive: true, force: true });
	});

	test("accepts an artifact bound to the trusted workflow run", () => {
		const result = runValidator(manifest);
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout).runId).toBe(EXPECTED_RUN_ID);
	});

	test("rejects a manifest commit different from the workflow commit", () => {
		const result = runValidator(manifest, "b".repeat(40));
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain(
			"manifest commit does not match the trusted workflow commit",
		);
	});

	test("rejects a manifest run id different from the workflow run", () => {
		const result = runValidator(manifest, EXPECTED_COMMIT, "44399958221");
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain(
			"manifest run id or attempt does not match the trusted workflow run",
		);
	});

	test("rejects a manifest attempt different from the workflow attempt", () => {
		const result = runValidator(
			manifest,
			EXPECTED_COMMIT,
			EXPECTED_RUN_ID,
			"2",
		);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain(
			"manifest run id or attempt does not match the trusted workflow run",
		);
	});
});
