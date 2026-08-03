import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
	buildPromotionManifest,
	expectedAssetNames,
	renderChecksums,
	validateRemoteRelease,
} from "../../scripts/release_asset_gate.mjs";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

const temporaryDirectories: string[] = [];
const SOURCE_SHA = "a".repeat(40);
const VERSION = "4.1.0";

function sha256(contents: Buffer | string): string {
	return crypto.createHash("sha256").update(contents).digest("hex");
}

function createBundle(): { assets: string; evidence: string } {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-assets-"));
	temporaryDirectories.push(root);
	const before = snapshotDir(root);
	const assets = path.join(root, "assets");
	const evidence = path.join(root, "evidence");
	fs.mkdirSync(assets);
	fs.mkdirSync(evidence);

	for (const name of expectedAssetNames(VERSION)) {
		fs.writeFileSync(path.join(assets, name), `bytes:${name}`);
	}

	const native = [
		["macos", `ExifCleaner-${VERSION}-arm64.dmg`],
		["windows", `ExifCleaner.Setup.${VERSION}.exe`],
		["linux", `ExifCleaner-${VERSION}.AppImage`],
	] as const;
	for (const [runnerOs, artifactName] of native) {
		const bytes = fs.readFileSync(path.join(assets, artifactName));
		fs.writeFileSync(
			path.join(evidence, `release-evidence-${runnerOs}.json`),
			`${JSON.stringify({
				sourceCommit: SOURCE_SHA,
				packageVersion: VERSION,
				runnerOs,
				runnerArch: runnerOs === "macos" ? "ARM64" : "X64",
				artifactPath: `/runner/${artifactName}`,
				artifactName,
				artifactSha256: sha256(bytes),
				executablePath: `/installed/${runnerOs}/ExifCleaner`,
				smokeResult: "passed",
			})}\n`,
		);
	}
	const after = snapshotDir(root);
	assertDirEffect(before, after, {
		added: [
			"assets",
			...expectedAssetNames(VERSION).map((name) => `assets/${name}`),
			"evidence",
			...native.map(
				([runnerOs]) => `evidence/release-evidence-${runnerOs}.json`,
			),
		],
	});

	return { assets, evidence };
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

describe("release asset gate", () => {
	test("builds a byte-derived manifest for the exact native release set", () => {
		const bundle = createBundle();

		const manifest = buildPromotionManifest({
			assetDirectory: bundle.assets,
			evidenceDirectory: bundle.evidence,
			sourceCommit: SOURCE_SHA,
			version: VERSION,
			requireChecksums: false,
		});

		expect(manifest.sourceCommit).toBe(SOURCE_SHA);
		expect(manifest.version).toBe(VERSION);
		expect(manifest.assets.map((asset) => asset.name)).toEqual(
			expectedAssetNames(VERSION),
		);
		expect(manifest.nativeEvidence.map((record) => record.runnerOs)).toEqual([
			"linux",
			"macos",
			"windows",
		]);
	});

	test("accepts an exact audited draft before publication", () => {
		const bundle = createBundle();
		const manifest = buildPromotionManifest({
			assetDirectory: bundle.assets,
			evidenceDirectory: bundle.evidence,
			sourceCommit: SOURCE_SHA,
			version: VERSION,
			requireChecksums: false,
		});
		const releaseNotes = "# ExifCleaner 4.1.0\n\nRelease body.\n";

		expect(() =>
			validateRemoteRelease({
				release: {
					isDraft: true,
					tagName: `v${VERSION}`,
					body: releaseNotes,
					assets: [
						...manifest.assets.map((asset) => ({
							name: asset.name,
							size: asset.size,
							digest: `sha256:${asset.sha256}`,
						})),
						{ name: "SHASUMS256.txt", size: 512, digest: null },
					],
				},
				manifest,
				releaseNotes,
				expectedDraft: true,
			}),
		).not.toThrow();
	});

	test("rejects missing, extra, empty, and source-drifted release inputs", () => {
		const missing = createBundle();
		fs.rmSync(path.join(missing.assets, expectedAssetNames(VERSION)[0]!));
		expect(() =>
			buildPromotionManifest({
				assetDirectory: missing.assets,
				evidenceDirectory: missing.evidence,
				sourceCommit: SOURCE_SHA,
				version: VERSION,
				requireChecksums: false,
			}),
		).toThrow("release assets mismatch");

		const extra = createBundle();
		fs.writeFileSync(path.join(extra.assets, "unexpected.zip"), "extra");
		expect(() =>
			buildPromotionManifest({
				assetDirectory: extra.assets,
				evidenceDirectory: extra.evidence,
				sourceCommit: SOURCE_SHA,
				version: VERSION,
				requireChecksums: false,
			}),
		).toThrow("release assets mismatch");

		const empty = createBundle();
		fs.writeFileSync(
			path.join(empty.assets, expectedAssetNames(VERSION)[1]!),
			"",
		);
		expect(() =>
			buildPromotionManifest({
				assetDirectory: empty.assets,
				evidenceDirectory: empty.evidence,
				sourceCommit: SOURCE_SHA,
				version: VERSION,
				requireChecksums: false,
			}),
		).toThrow("release asset is empty");

		const drifted = createBundle();
		expect(() =>
			buildPromotionManifest({
				assetDirectory: drifted.assets,
				evidenceDirectory: drifted.evidence,
				sourceCommit: "b".repeat(40),
				version: VERSION,
				requireChecksums: false,
			}),
		).toThrow("sourceCommit mismatch");
	});

	test("rejects checksum and remote draft tampering", () => {
		const bundle = createBundle();
		const initial = buildPromotionManifest({
			assetDirectory: bundle.assets,
			evidenceDirectory: bundle.evidence,
			sourceCommit: SOURCE_SHA,
			version: VERSION,
			requireChecksums: false,
		});
		fs.writeFileSync(
			path.join(bundle.assets, "SHASUMS256.txt"),
			renderChecksums(initial).replace(
				initial.assets[0]!.sha256,
				"f".repeat(64),
			),
		);
		expect(() =>
			buildPromotionManifest({
				assetDirectory: bundle.assets,
				evidenceDirectory: bundle.evidence,
				sourceCommit: SOURCE_SHA,
				version: VERSION,
			}),
		).toThrow("checksum mismatch");

		expect(() =>
			validateRemoteRelease({
				release: {
					isDraft: false,
					tagName: `v${VERSION}`,
					body: "tampered",
					assets: [],
				},
				manifest: initial,
				releaseNotes: "expected",
				expectedDraft: false,
			}),
		).toThrow("release body");
	});
});
