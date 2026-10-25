import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { expectedAssetNames } from "../../scripts/release_asset_gate.mjs";
import {
	buildGateArguments,
	evaluatePublishedRelease,
	main,
	x64DmgHashFromLog,
} from "../../scripts/release_public_audit.mjs";

const VERSION = "4.7.0";
const SOURCE = "a".repeat(40);

function sha(text: string): string {
	return crypto.createHash("sha256").update(text).digest("hex");
}

function snapshot() {
	const names = expectedAssetNames(VERSION);
	const assetSha256: Record<string, string> = {};
	for (const name of names) assetSha256[name] = sha(`bytes:${name}`);
	const setup = `ExifCleaner.Setup.${VERSION}.exe`;
	const arm = `ExifCleaner-${VERSION}-arm64.dmg`;
	const linux = `ExifCleaner-${VERSION}.AppImage`;
	const record = (runnerOs: string, artifactName: string) => ({
		sourceCommit: SOURCE,
		packageVersion: VERSION,
		runnerOs,
		runnerArch: runnerOs === "macos" ? "ARM64" : "X64",
		artifactPath: `/runner/${artifactName}`,
		artifactName,
		artifactSha256: assetSha256[artifactName],
		executablePath: `/installed/${runnerOs}/ExifCleaner`,
		smokeResult: "passed",
		...(runnerOs === "windows"
			? { peMachine: "amd64", payloadArchs: ["x64"] }
			: {}),
	});
	return {
		version: VERSION,
		release: {
			isDraft: false,
			tagName: `v${VERSION}`,
			assets: [...names, "SHASUMS256.txt"].map((name) => ({ name })),
		},
		checksumsText: `${names.map((name) => `${assetSha256[name]}  ${name}`).join("\n")}\n`,
		assetSha256,
		evidenceRecords: [
			record("macos", arm),
			record("windows", setup),
			record("linux", linux),
		] as Record<string, unknown>[],
		x64DmgSha256: assetSha256[`ExifCleaner-${VERSION}.dmg`]!,
	};
}

const temporaryDirectories: string[] = [];
afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
	vi.restoreAllMocks();
});

describe("evaluatePublishedRelease", () => {
	test("passes a complete synthetic snapshot", () => {
		expect(evaluatePublishedRelease(snapshot())).toEqual([]);
	});

	test.each([
		[
			"an extra ia32 asset",
			(s: ReturnType<typeof snapshot>) => {
				s.release.assets.push({
					name: `ExifCleaner.Setup.${VERSION}-ia32.exe`,
				});
			},
			"legacy architecture asset name",
		],
		[
			"a draft release",
			(s: ReturnType<typeof snapshot>) => {
				s.release.isDraft = true;
			},
			"draft",
		],
		[
			"a missing SHASUMS256.txt",
			(s: ReturnType<typeof snapshot>) => {
				s.release.assets = s.release.assets.filter(
					(asset) => asset.name !== "SHASUMS256.txt",
				);
			},
			"asset names",
		],
		[
			"a Setup hash differing from SHASUMS256.txt",
			(s: ReturnType<typeof snapshot>) => {
				s.assetSha256[`ExifCleaner.Setup.${VERSION}.exe`] = "f".repeat(64);
			},
			"SHASUMS256.txt",
		],
		[
			"a Setup hash differing from the windows evidence",
			(s: ReturnType<typeof snapshot>) => {
				s.evidenceRecords[1]!.artifactSha256 = "e".repeat(64);
			},
			"windows evidence",
		],
		[
			"a windows record with peMachine i386",
			(s: ReturnType<typeof snapshot>) => {
				s.evidenceRecords[1]!.peMachine = "i386";
			},
			"peMachine",
		],
		[
			"an x64 DMG hash mismatch",
			(s: ReturnType<typeof snapshot>) => {
				s.x64DmgSha256 = "d".repeat(64);
			},
			"x64 DMG",
		],
		[
			"a wrong tag",
			(s: ReturnType<typeof snapshot>) => {
				s.release.tagName = "v4.6.0";
			},
			"tag",
		],
	])("rejects %s", (_label, mutate, expected) => {
		const s = snapshot();
		mutate(s);
		const problems = evaluatePublishedRelease(s);
		expect(problems.length).toBeGreaterThan(0);
		expect(problems.join("\n")).toContain(expected);
	});
});

describe("x64DmgHashFromLog", () => {
	test("extracts the single value, fails closed otherwise", () => {
		const hex = "ab".repeat(32);
		expect(
			x64DmgHashFromLog(`2026 noise\n2026 X64 DMG SHA256 ${hex}\nmore`),
		).toBe(hex);
		expect(() => x64DmgHashFromLog("nothing here")).toThrow();
		expect(() =>
			x64DmgHashFromLog(
				`X64 DMG SHA256 ${hex}\nX64 DMG SHA256 ${"cd".repeat(32)}`,
			),
		).toThrow();
	});
});

describe("buildGateArguments", () => {
	test("derives version from the tag and notes from the at-tag file", () => {
		const args = buildGateArguments({
			tag: "v4.7.0",
			workDir: "/w",
			sourceSha: SOURCE,
			notesPath: "/w/release-notes-at-tag.md",
		});
		const after = (flag: string) => args[args.indexOf(flag) + 1];
		expect(after("--version")).toBe("4.7.0");
		expect(after("--release-notes")).toBe("/w/release-notes-at-tag.md");
		expect(after("--expected-draft")).toBe("false");
		expect(() =>
			buildGateArguments({
				tag: "4.7.0",
				workDir: "/w",
				sourceSha: SOURCE,
				notesPath: "/n",
			}),
		).toThrow();
	});
});

describe("main", () => {
	test("refuses a non-empty work directory and a missing --tag", () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-work-"));
		temporaryDirectories.push(dir);
		fs.writeFileSync(path.join(dir, "file"), "x");
		expect(main(["--tag", "v4.7.0", "--work-dir", dir, "--ci-run", "1"])).toBe(
			1,
		);
		expect(err.mock.calls.flat().join("\n")).toContain(
			"work directory must be new or empty",
		);
		expect(main(["--work-dir", dir])).toBe(1);
	});
});
