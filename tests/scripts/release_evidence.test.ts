import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import {
	buildReleaseEvidence,
	inspectWindowsBuild,
	payloadArchsFromSevenZipListing,
	readPeMachine,
	validateReleaseEvidenceSet,
	windowsX64OnlyProblems,
} from "../../scripts/release_evidence.mjs";

const temporaryDirectories: string[] = [];
const FIXTURES = new URL("./fixtures/", import.meta.url);
const LISTING_4_6_0 = fileURLToPath(
	new URL("nsis_payload_listing_4.6.0.txt", FIXTURES),
);
const LISTING_4_7_0 = fileURLToPath(
	new URL("nsis_payload_listing_4.7.0.txt", FIXTURES),
);

function writeSyntheticPe(file: string, machine: number) {
	const buffer = Buffer.alloc(0x48);
	buffer.write("MZ", 0, "latin1");
	buffer.writeUInt32LE(0x40, 0x3c);
	buffer.write("PE\0\0", 0x40, "latin1");
	buffer.writeUInt16LE(machine, 0x44);
	fs.writeFileSync(file, buffer);
}

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

function evidenceFor(
	runnerOs: "macos" | "windows" | "linux",
	machine = 0x8664,
) {
	const { artifactPath, executablePath } = createArtifact(
		`${runnerOs} installer bytes`,
	);
	if (runnerOs === "windows") writeSyntheticPe(executablePath, machine);
	return buildReleaseEvidence({
		payloadListingPath: runnerOs === "windows" ? LISTING_4_7_0 : undefined,
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

		const packageJson = JSON.parse(
			fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
		);
		expect(record.packageVersion).toBe(packageJson.version);
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
		[
			"windows peMachine i386",
			() => [
				evidenceFor("macos"),
				evidenceFor("windows", 0x14c),
				evidenceFor("linux"),
			],
			"windows peMachine",
		],
		[
			"windows peMachine missing",
			() => {
				const { peMachine: _drop, ...windows } = evidenceFor("windows");
				return [evidenceFor("macos"), windows, evidenceFor("linux")];
			},
			"windows peMachine",
		],
		[
			"windows payloadArchs with 32-bit payload",
			() => [
				evidenceFor("macos"),
				{ ...evidenceFor("windows"), payloadArchs: ["ia32", "x64"] },
				evidenceFor("linux"),
			],
			"windows payloadArchs",
		],
		[
			"windows payloadArchs missing",
			() => {
				const { payloadArchs: _drop, ...windows } = evidenceFor("windows");
				return [evidenceFor("macos"), windows, evidenceFor("linux")];
			},
			"windows payloadArchs",
		],
		[
			"windows payloadArchs duplicated",
			() => [
				evidenceFor("macos"),
				{ ...evidenceFor("windows"), payloadArchs: ["x64", "x64"] },
				evidenceFor("linux"),
			],
			"windows payloadArchs",
		],
		[
			"macos record carrying peMachine",
			() => [
				{ ...evidenceFor("macos"), peMachine: "amd64" },
				evidenceFor("windows"),
				evidenceFor("linux"),
			],
			"macos peMachine is windows-only",
		],
		[
			"linux record carrying payloadArchs",
			() => [
				evidenceFor("macos"),
				evidenceFor("windows"),
				{ ...evidenceFor("linux"), payloadArchs: ["x64"] },
			],
			"linux payloadArchs is windows-only",
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

	test("readPeMachine maps the Machine field and rejects malformed files", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pe-"));
		temporaryDirectories.push(dir);
		const file = path.join(dir, "a.exe");
		for (const [machine, expected] of [
			[0x8664, "amd64"],
			[0x14c, "i386"],
			[0xaa64, "arm64"],
			[0x1234, "unknown-0x1234"],
		] as const) {
			writeSyntheticPe(file, machine);
			expect(readPeMachine(file)).toBe(expected);
		}
		fs.writeFileSync(file, Buffer.alloc(0x48, 0x41));
		expect(() => readPeMachine(file)).toThrow("not a PE file");
		const noSig = Buffer.alloc(0x48);
		noSig.write("MZ", 0, "latin1");
		noSig.writeUInt32LE(0x40, 0x3c);
		fs.writeFileSync(file, noSig);
		expect(() => readPeMachine(file)).toThrow("missing PE signature");
	});

	test("payloadArchsFromSevenZipListing follows the recorded payload rule", () => {
		const read = (file: string) => fs.readFileSync(file, "utf8");
		expect(payloadArchsFromSevenZipListing(read(LISTING_4_6_0))).toEqual([
			"ia32",
			"x64",
		]);
		expect(payloadArchsFromSevenZipListing(read(LISTING_4_7_0))).toEqual([
			"x64",
		]);
		expect(() => payloadArchsFromSevenZipListing("")).toThrow("empty");
		expect(() =>
			payloadArchsFromSevenZipListing("  .....  1  $PLUGINSDIR\\System.dll\n"),
		).toThrow("no recognizable payload");
	});

	test("inspectWindowsBuild passes x64-only output and fails an extra unpacked directory", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inspect-"));
		temporaryDirectories.push(dir);
		const exe = path.join(dir, "ExifCleaner.exe");
		writeSyntheticPe(exe, 0x8664);
		const dist = path.join(dir, "dist");
		fs.mkdirSync(path.join(dist, "win-unpacked"), { recursive: true });
		const good = inspectWindowsBuild({
			executablePath: exe,
			payloadListingPath: LISTING_4_7_0,
			distDirectory: dist,
		});
		expect(windowsX64OnlyProblems(good)).toEqual([]);
		fs.mkdirSync(path.join(dist, "win-ia32-unpacked"));
		const bad = inspectWindowsBuild({
			executablePath: exe,
			payloadListingPath: LISTING_4_7_0,
			distDirectory: dist,
		});
		expect(windowsX64OnlyProblems(bad).join(";")).toContain(
			"unpackedDirectories",
		);
		const old = inspectWindowsBuild({
			executablePath: exe,
			payloadListingPath: LISTING_4_6_0,
			distDirectory: path.join(dir, "dist"),
		});
		expect(windowsX64OnlyProblems(old).join(";")).toContain("payloadArchs");
	});

	test("windows evidence requires a payload listing and records an i386 exe faithfully", () => {
		const { artifactPath, executablePath } = createArtifact("w");
		writeSyntheticPe(executablePath, 0x14c);
		expect(() =>
			buildReleaseEvidence({
				sourceCommit: "a".repeat(40),
				runnerOs: "windows",
				runnerArch: "x64",
				artifactPath,
				executablePath,
				smokeResult: "passed",
			}),
		).toThrow("payloadListingPath is required");
		const record = evidenceFor("windows", 0x14c);
		expect(record.peMachine).toBe("i386");
		expect(
			validateReleaseEvidenceSet([
				evidenceFor("macos"),
				record,
				evidenceFor("linux"),
			]),
		).toMatchObject({ ok: false });
	});

	test("macos and linux records carry neither windows-only field", () => {
		for (const os of ["macos", "linux"] as const) {
			const record = evidenceFor(os);
			expect("peMachine" in record).toBe(false);
			expect("payloadArchs" in record).toBe(false);
		}
	});
});
