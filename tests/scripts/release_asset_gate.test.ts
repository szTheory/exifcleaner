import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	buildPromotionManifest,
	expectedAssetNames,
	LEGACY_ARCH_ASSET_NAME,
	renderChecksums,
	main,
	validateRemoteRelease,
} from "../../scripts/release_asset_gate.mjs";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

const temporaryDirectories: string[] = [];
const SOURCE_SHA = "a".repeat(40);
const VERSION = "4.1.0";

function bundleArgs(
	bundle: { assets: string; evidence: string },
	extra: string[],
): string[] {
	return [
		"--assets",
		bundle.assets,
		"--evidence",
		bundle.evidence,
		"--source-sha",
		SOURCE_SHA,
		...extra,
	];
}

function sha256(contents: Buffer | string): string {
	return crypto.createHash("sha256").update(contents).digest("hex");
}

function createBundle(version: string = VERSION): {
	assets: string;
	evidence: string;
} {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-assets-"));
	temporaryDirectories.push(root);
	const before = snapshotDir(root);
	const assets = path.join(root, "assets");
	const evidence = path.join(root, "evidence");
	fs.mkdirSync(assets);
	fs.mkdirSync(evidence);

	for (const name of expectedAssetNames(version)) {
		fs.writeFileSync(path.join(assets, name), `bytes:${name}`);
	}

	const native = [
		["macos", `ExifCleaner-${version}-arm64.dmg`],
		["windows", `ExifCleaner.Setup.${version}.exe`],
		["linux", `ExifCleaner-${version}.AppImage`],
	] as const;
	for (const [runnerOs, artifactName] of native) {
		const bytes = fs.readFileSync(path.join(assets, artifactName));
		fs.writeFileSync(
			path.join(evidence, `release-evidence-${runnerOs}.json`),
			`${JSON.stringify({
				sourceCommit: SOURCE_SHA,
				packageVersion: version,
				runnerOs,
				runnerArch: runnerOs === "macos" ? "ARM64" : "X64",
				artifactPath: `/runner/${artifactName}`,
				artifactName,
				artifactSha256: sha256(bytes),
				executablePath: `/installed/${runnerOs}/ExifCleaner`,
				smokeResult: "passed",
				...(runnerOs === "windows"
					? { peMachine: "amd64", payloadArchs: ["x64"] }
					: {}),
			})}\n`,
		);
	}
	const after = snapshotDir(root);
	assertDirEffect(before, after, {
		added: [
			"assets",
			...expectedAssetNames(version).map((name) => `assets/${name}`),
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
	test("pins Windows builder output to the public asset contract", () => {
		const packageJson = JSON.parse(
			fs.readFileSync(path.resolve("package.json"), "utf8"),
		) as {
			build?: {
				nsis?: { artifactName?: string };
				portable?: { artifactName?: string };
			};
		};

		expect(packageJson.build?.nsis?.artifactName).toBe(
			"${productName}.Setup.${version}.${ext}",
		);
		expect(packageJson.build?.portable?.artifactName).toBe(
			"${productName}.${version}.portable.${ext}",
		);
	});

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
	test("rejects a windows evidence record that names the portable exe", () => {
		const bundle = createBundle();
		const portable = `ExifCleaner.${VERSION}.portable.exe`;
		const evidencePath = path.join(
			bundle.evidence,
			"release-evidence-windows.json",
		);
		const record = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
		record.artifactName = portable;
		record.artifactSha256 = sha256(
			fs.readFileSync(path.join(bundle.assets, portable)),
		);
		fs.writeFileSync(evidencePath, JSON.stringify(record));
		expect(() =>
			buildPromotionManifest({
				assetDirectory: bundle.assets,
				evidenceDirectory: bundle.evidence,
				sourceCommit: SOURCE_SHA,
				version: VERSION,
				requireChecksums: false,
			}),
		).toThrow("windows evidence must name the Setup installer");
	});

	test("rejects Setup bytes changed after the evidence was written", () => {
		const bundle = createBundle();
		fs.writeFileSync(
			path.join(bundle.assets, `ExifCleaner.Setup.${VERSION}.exe`),
			"swapped bytes",
		);
		expect(() =>
			buildPromotionManifest({
				assetDirectory: bundle.assets,
				evidenceDirectory: bundle.evidence,
				sourceCommit: SOURCE_SHA,
				version: VERSION,
				requireChecksums: false,
			}),
		).toThrow("windows artifact checksum mismatch");
	});

	test("rejects a legacy architecture asset name in a local bundle", () => {
		const bundle = createBundle();
		fs.writeFileSync(
			path.join(bundle.assets, `ExifCleaner.Setup.${VERSION}-ia32.exe`),
			"x",
		);
		expect(() =>
			buildPromotionManifest({
				assetDirectory: bundle.assets,
				evidenceDirectory: bundle.evidence,
				sourceCommit: SOURCE_SHA,
				version: VERSION,
				requireChecksums: false,
			}),
		).toThrow("legacy architecture asset name");
	});

	test("rejects a legacy architecture name on a remote release", () => {
		const bundle = createBundle();
		const manifest = buildPromotionManifest({
			assetDirectory: bundle.assets,
			evidenceDirectory: bundle.evidence,
			sourceCommit: SOURCE_SHA,
			version: VERSION,
			requireChecksums: false,
		});
		expect(() =>
			validateRemoteRelease({
				release: {
					isDraft: true,
					tagName: `v${VERSION}`,
					body: "n",
					assets: [
						...manifest.assets.map((asset) => ({
							name: asset.name,
							size: asset.size,
						})),
						{ name: `ExifCleaner-${VERSION}-x86.exe`, size: 5 },
					],
				},
				manifest,
				releaseNotes: "n",
				expectedDraft: true,
			}),
		).toThrow("legacy architecture asset name");
	});

	test("rejects windows evidence whose peMachine is i386", () => {
		const bundle = createBundle();
		const evidencePath = path.join(
			bundle.evidence,
			"release-evidence-windows.json",
		);
		const record = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
		record.peMachine = "i386";
		fs.writeFileSync(evidencePath, JSON.stringify(record));
		expect(() =>
			buildPromotionManifest({
				assetDirectory: bundle.assets,
				evidenceDirectory: bundle.evidence,
				sourceCommit: SOURCE_SHA,
				version: VERSION,
				requireChecksums: false,
			}),
		).toThrow("windows peMachine must be amd64");
	});

	test("the real asset set has no legacy-architecture name (x86_64.rpm passes)", () => {
		expect(
			expectedAssetNames(VERSION).filter((name) =>
				LEGACY_ARCH_ASSET_NAME.test(name),
			),
		).toEqual([]);
		expect(LEGACY_ARCH_ASSET_NAME.test("a-ia32.exe")).toBe(true);
		expect(LEGACY_ARCH_ASSET_NAME.test("a-x86.exe")).toBe(true);
	});

	test("a bundle for a version other than package.json passes with --version and at-tag notes, fails without", () => {
		const later = "9.9.9";
		const bundle = createBundle(later);
		const manifest = buildPromotionManifest({
			assetDirectory: bundle.assets,
			evidenceDirectory: bundle.evidence,
			sourceCommit: SOURCE_SHA,
			version: later,
			requireChecksums: false,
		});
		fs.writeFileSync(
			path.join(bundle.assets, "SHASUMS256.txt"),
			renderChecksums(manifest),
		);
		const notes = "# ExifCleaner 9.9.9\n\nAt-tag notes.\n";
		const notesPath = path.join(path.dirname(bundle.assets), "notes.md");
		fs.writeFileSync(notesPath, notes);
		const releasePath = path.join(path.dirname(bundle.assets), "release.json");
		fs.writeFileSync(
			releasePath,
			JSON.stringify({
				isDraft: false,
				tagName: `v${later}`,
				body: notes,
				assets: [
					...manifest.assets.map((asset) => ({
						name: asset.name,
						size: asset.size,
						digest: `sha256:${asset.sha256}`,
					})),
					{ name: "SHASUMS256.txt", size: 10, digest: null },
				],
			}),
		);
		const common = [
			"--release-json",
			releasePath,
			"--expected-draft",
			"false",
			"--release-notes",
			notesPath,
		];
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(main(bundleArgs(bundle, ["--version", later, ...common]))).toBe(0);
			expect(main(bundleArgs(bundle, common))).toBe(1);
			expect(err.mock.calls.flat().join("\n")).toContain(
				"release assets mismatch",
			);
		} finally {
			log.mockRestore();
			err.mockRestore();
		}
	});
});
