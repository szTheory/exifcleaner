import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import {
	buildReleaseEvidence,
	validateReleaseEvidenceSet,
} from "../../scripts/release_evidence.mjs";

const temporaryDirectories: string[] = [];

function createArtifact(contents: string) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-"));
	temporaryDirectories.push(directory);
	const artifactPath = path.join(directory, "ExifCleaner-4.0.1.dmg");
	const executablePath = path.join(
		directory,
		"ExifCleaner.app",
		"Contents",
		"MacOS",
		"ExifCleaner",
	);
	fs.mkdirSync(path.dirname(executablePath), { recursive: true });
	fs.writeFileSync(artifactPath, contents);
	fs.writeFileSync(executablePath, "installed executable");
	return { artifactPath, executablePath };
}

function evidenceFor(runnerOs: "macos" | "windows" | "linux") {
	const { artifactPath, executablePath } = createArtifact(
		`${runnerOs} installer bytes`,
	);
	return buildReleaseEvidence({
		sourceCommit: "a".repeat(40),
		runnerOs,
		runnerArch: "x64",
		artifactPath,
		executablePath,
		smokeResult: "passed",
	});
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

describe("release evidence", () => {
	test("proves the evidence fixture workspace starts mutation-free", () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-proof-"));
		try {
			assertDirEffect(snapshotDir(directory), snapshotDir(directory), {});
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});

	test("accepts a complete three-platform native evidence set", () => {
		const result = validateReleaseEvidenceSet([
			evidenceFor("macos"),
			evidenceFor("windows"),
			evidenceFor("linux"),
		]);

		expect(result).toEqual({ ok: true });
	});

	test("records the package version and hashes the artifact bytes itself", () => {
		const { artifactPath, executablePath } = createArtifact(
			"original installer bytes",
		);
		const record = buildReleaseEvidence({
			sourceCommit: "a".repeat(40),
			runnerOs: "macos",
			runnerArch: "arm64",
			artifactPath,
			executablePath,
			smokeResult: "passed",
		});

		fs.writeFileSync(artifactPath, "altered installer bytes");
		const altered = buildReleaseEvidence({
			sourceCommit: "a".repeat(40),
			runnerOs: "macos",
			runnerArch: "arm64",
			artifactPath,
			executablePath,
			smokeResult: "passed",
		});

		expect(record.packageVersion).toBe("4.2.0");
		expect(record.artifactSha256).not.toBe(altered.artifactSha256);
	});

	test.each([
		[
			"missing platform",
			() => [evidenceFor("macos"), evidenceFor("windows")],
			"platform",
		],
		[
			"source mismatch",
			() => {
				const records = [
					evidenceFor("macos"),
					evidenceFor("windows"),
					evidenceFor("linux"),
				];
				records[2] = { ...records[2], sourceCommit: "b".repeat(40) };
				return records;
			},
			"sourceCommit",
		],
		[
			"version mismatch",
			() => {
				const records = [
					evidenceFor("macos"),
					evidenceFor("windows"),
					evidenceFor("linux"),
				];
				records[2] = { ...records[2], packageVersion: "4.0.0" };
				return records;
			},
			"packageVersion",
		],
		[
			"missing checksum",
			() => {
				const records = [
					evidenceFor("macos"),
					evidenceFor("windows"),
					evidenceFor("linux"),
				];
				records[2] = { ...records[2], artifactSha256: "" };
				return records;
			},
			"artifactSha256",
		],
		[
			"failed smoke",
			() => {
				const records = [
					evidenceFor("macos"),
					evidenceFor("windows"),
					evidenceFor("linux"),
				];
				records[1] = { ...records[1], smokeResult: "failed" };
				return records;
			},
			"windows smokeResult",
		],
	])("rejects %s", (_name, records, field) => {
		const result = validateReleaseEvidenceSet(records());

		expect(result.ok).toBe(false);
		expect(result.reason).toContain(field);
	});

	test("rejects an absent artifact and any smoke result other than literal passed", () => {
		const { executablePath } = createArtifact("installer bytes");

		expect(() =>
			buildReleaseEvidence({
				sourceCommit: "a".repeat(40),
				runnerOs: "linux",
				runnerArch: "x64",
				artifactPath: "/missing/ExifCleaner.AppImage",
				executablePath,
				smokeResult: "passed",
			}),
		).toThrow("artifactPath");
		expect(() =>
			buildReleaseEvidence({
				sourceCommit: "a".repeat(40),
				runnerOs: "linux",
				runnerArch: "x64",
				artifactPath: createArtifact("another installer").artifactPath,
				executablePath,
				smokeResult: "green",
			}),
		).toThrow("smokeResult");
	});
});
