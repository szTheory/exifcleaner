import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateReleaseEvidenceSet } from "./release_evidence.mjs";

const FULL_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const CHECKSUM_FILE = "SHASUMS256.txt";

export function expectedAssetNames(version) {
	if (!VERSION.test(version)) {
		throw new Error("version must be an exact three-part semantic version");
	}
	return [
		`ExifCleaner-${version}-arm64.dmg`,
		`ExifCleaner-${version}.dmg`,
		`ExifCleaner.${version}.exe`,
		`ExifCleaner.Setup.${version}.exe`,
		`ExifCleaner-${version}.AppImage`,
		`exifcleaner_${version}_amd64.deb`,
		`exifcleaner-${version}.x86_64.rpm`,
	];
}

function sha256File(filePath) {
	return crypto
		.createHash("sha256")
		.update(fs.readFileSync(filePath))
		.digest("hex");
}

function regularFiles(directory) {
	if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
		throw new Error(`directory does not exist: ${directory}`);
	}
	return fs
		.readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.sort();
}

function requireExactNames(actual, expected, label) {
	const actualSorted = [...actual].sort();
	const expectedSorted = [...expected].sort();
	if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
		throw new Error(
			`${label} mismatch: expected ${expectedSorted.join(", ")}; got ${actualSorted.join(", ")}`,
		);
	}
}

export function parseChecksumManifest(source) {
	const rows = String(source)
		.split(/\r?\n/)
		.filter((line) => line !== "");
	if (rows.length !== 7) {
		throw new Error("checksum manifest must contain exactly seven rows");
	}
	const checksums = new Map();
	for (const row of rows) {
		const match = /^([0-9a-f]{64})  ([^/\\]+)$/.exec(row);
		if (!match) {
			throw new Error(`invalid checksum row: ${row}`);
		}
		const [, digest, name] = match;
		if (checksums.has(name)) {
			throw new Error(`duplicate checksum name: ${name}`);
		}
		checksums.set(name, digest);
	}
	return checksums;
}

function readEvidence(evidenceDirectory) {
	const names = regularFiles(evidenceDirectory);
	requireExactNames(
		names,
		[
			"release-evidence-linux.json",
			"release-evidence-macos.json",
			"release-evidence-windows.json",
		],
		"native evidence files",
	);
	const records = names.map((name) =>
		JSON.parse(fs.readFileSync(path.join(evidenceDirectory, name), "utf8")),
	);
	const validation = validateReleaseEvidenceSet(records);
	if (!validation.ok) throw new Error(validation.reason);
	return records.sort((left, right) =>
		left.runnerOs.localeCompare(right.runnerOs),
	);
}

export function buildPromotionManifest({
	assetDirectory,
	evidenceDirectory,
	sourceCommit,
	version,
	requireChecksums = true,
}) {
	if (!FULL_SHA.test(sourceCommit)) {
		throw new Error("sourceCommit must be a lowercase full commit SHA");
	}
	const expected = expectedAssetNames(version);
	const expectedFiles = requireChecksums
		? [...expected, CHECKSUM_FILE]
		: expected;
	requireExactNames(
		regularFiles(assetDirectory),
		expectedFiles,
		"release assets",
	);

	const assets = expected.map((name) => {
		const filePath = path.join(assetDirectory, name);
		const size = fs.statSync(filePath).size;
		if (size <= 0) throw new Error(`release asset is empty: ${name}`);
		return { name, size, sha256: sha256File(filePath) };
	});

	if (requireChecksums) {
		const checksums = parseChecksumManifest(
			fs.readFileSync(path.join(assetDirectory, CHECKSUM_FILE), "utf8"),
		);
		requireExactNames([...checksums.keys()], expected, "checksum names");
		for (const asset of assets) {
			if (!SHA256.test(checksums.get(asset.name) ?? "")) {
				throw new Error(`invalid checksum for ${asset.name}`);
			}
			if (checksums.get(asset.name) !== asset.sha256) {
				throw new Error(`checksum mismatch for ${asset.name}`);
			}
		}
	}

	const nativeEvidence = readEvidence(evidenceDirectory);
	for (const record of nativeEvidence) {
		if (record.sourceCommit !== sourceCommit) {
			throw new Error(`${record.runnerOs} sourceCommit mismatch`);
		}
		if (record.packageVersion !== version) {
			throw new Error(`${record.runnerOs} packageVersion mismatch`);
		}
		const asset = assets.find(
			(candidate) => candidate.name === record.artifactName,
		);
		if (!asset) {
			throw new Error(
				`${record.runnerOs} evidence names an unexpected artifact`,
			);
		}
		if (asset.sha256 !== record.artifactSha256) {
			throw new Error(`${record.runnerOs} artifact checksum mismatch`);
		}
	}

	return {
		schemaVersion: 1,
		version,
		sourceCommit,
		assets,
		nativeEvidence,
	};
}

export function renderChecksums(manifest) {
	return `${manifest.assets.map((asset) => `${asset.sha256}  ${asset.name}`).join("\n")}\n`;
}

export function validateRemoteRelease({
	release,
	manifest,
	releaseNotes,
	expectedDraft,
}) {
	if (release === null || typeof release !== "object") {
		throw new Error("remote release must be an object");
	}
	if (release.isDraft !== expectedDraft) {
		throw new Error(`remote release draft state must be ${expectedDraft}`);
	}
	if (release.tagName !== `v${manifest.version}`) {
		throw new Error("remote release tag does not match the package version");
	}
	if (release.body !== releaseNotes) {
		throw new Error("remote release body does not match RELEASE_NOTES.md");
	}
	if (!Array.isArray(release.assets)) {
		throw new Error("remote release assets must be an array");
	}
	requireExactNames(
		release.assets.map((asset) => asset?.name),
		[...manifest.assets.map((asset) => asset.name), CHECKSUM_FILE],
		"remote release assets",
	);
	for (const remoteAsset of release.assets) {
		if (!Number.isInteger(remoteAsset.size) || remoteAsset.size <= 0) {
			throw new Error(`remote release asset is empty: ${remoteAsset.name}`);
		}
		if (remoteAsset.name === CHECKSUM_FILE) continue;
		const localAsset = manifest.assets.find(
			(asset) => asset.name === remoteAsset.name,
		);
		if (!localAsset || remoteAsset.size !== localAsset.size) {
			throw new Error(
				`remote release asset size mismatch: ${remoteAsset.name}`,
			);
		}
		if (
			remoteAsset.digest !== null &&
			remoteAsset.digest !== undefined &&
			remoteAsset.digest !== `sha256:${localAsset.sha256}`
		) {
			throw new Error(
				`remote release asset digest mismatch: ${remoteAsset.name}`,
			);
		}
	}
}

function parseArguments(argv) {
	const values = new Map();
	for (let index = 0; index < argv.length; index += 1) {
		const key = argv[index];
		if (!key?.startsWith("--")) throw new Error(`unknown argument: ${key}`);
		if (key === "--write-checksums") {
			values.set(key, true);
			continue;
		}
		const value = argv[index + 1];
		if (value === undefined || value.startsWith("--")) {
			throw new Error(`missing value for ${key}`);
		}
		values.set(key, value);
		index += 1;
	}
	return values;
}

export function main(argv = process.argv.slice(2)) {
	try {
		const args = parseArguments(argv);
		const assetDirectory = path.resolve(String(args.get("--assets") ?? ""));
		const evidenceDirectory = path.resolve(
			String(args.get("--evidence") ?? ""),
		);
		const sourceCommit = String(args.get("--source-sha") ?? "");
		const packageJson = JSON.parse(
			fs.readFileSync(
				path.resolve(
					path.dirname(fileURLToPath(import.meta.url)),
					"..",
					"package.json",
				),
				"utf8",
			),
		);
		const version = String(args.get("--version") ?? packageJson.version ?? "");
		let manifest = buildPromotionManifest({
			assetDirectory,
			evidenceDirectory,
			sourceCommit,
			version,
			requireChecksums: !args.has("--write-checksums"),
		});
		if (args.has("--write-checksums")) {
			fs.writeFileSync(
				path.join(assetDirectory, CHECKSUM_FILE),
				renderChecksums(manifest),
			);
			manifest = buildPromotionManifest({
				assetDirectory,
				evidenceDirectory,
				sourceCommit,
				version,
				requireChecksums: true,
			});
		}
		const output = args.get("--output");
		if (output) {
			fs.writeFileSync(
				path.resolve(String(output)),
				`${JSON.stringify(manifest, null, 2)}\n`,
			);
		}
		const releaseJson = args.get("--release-json");
		if (releaseJson) {
			const expectedDraftValue = String(args.get("--expected-draft") ?? "");
			if (!/^(true|false)$/.test(expectedDraftValue)) {
				throw new Error("--expected-draft must be true or false");
			}
			const releaseNotesPath = path.resolve(
				String(args.get("--release-notes") ?? ""),
			);
			validateRemoteRelease({
				release: JSON.parse(
					fs.readFileSync(path.resolve(String(releaseJson)), "utf8"),
				),
				manifest,
				releaseNotes: fs.readFileSync(releaseNotesPath, "utf8"),
				expectedDraft: expectedDraftValue === "true",
			});
		}
		console.log(
			`✓ RELEASE ASSET GATE PASSED — ${manifest.assets.length} binaries, ${manifest.nativeEvidence.length} native records, ${manifest.sourceCommit}`,
		);
		return 0;
	} catch (error) {
		console.error(
			`✗ RELEASE ASSET GATE FAILED: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
