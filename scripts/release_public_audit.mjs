import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
	LEGACY_ARCH_ASSET_NAME,
	expectedAssetNames,
	parseChecksumManifest,
} from "./release_asset_gate.mjs";
import { validateReleaseEvidenceSet } from "./release_evidence.mjs";

const CHECKSUM_FILE = "SHASUMS256.txt";
const TAG = /^v(\d+\.\d+\.\d+)$/;
const SHA256 = /^[0-9a-f]{64}$/;
const X64_JOB_NAME = "Smoke macOS x64 (Intel)";
const GATE_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"release_asset_gate.mjs",
);

// Read-only post-publish verifier (D-12). Downloaded files are only hashed by
// streaming reads, never executed or opened otherwise.
export function evaluatePublishedRelease({
	version,
	release,
	checksumsText,
	assetSha256,
	evidenceRecords,
	x64DmgSha256,
}) {
	const problems = [];
	const expected = expectedAssetNames(version);
	const names = Array.isArray(release?.assets)
		? release.assets.map((asset) => String(asset?.name))
		: [];

	if (release?.tagName !== `v${version}`) {
		problems.push(`tag is ${release?.tagName}, expected v${version}`);
	}
	if (release?.isDraft !== false) problems.push("release is a draft");
	for (const name of names) {
		if (LEGACY_ARCH_ASSET_NAME.test(name)) {
			problems.push(`legacy architecture asset name: ${name}`);
		}
	}
	const wantNames = [...expected, CHECKSUM_FILE].sort();
	if (JSON.stringify([...names].sort()) !== JSON.stringify(wantNames)) {
		problems.push(
			`asset names differ: expected ${wantNames.join(", ")}; got ${[...names].sort().join(", ")}`,
		);
	}

	let checksums = null;
	try {
		checksums = parseChecksumManifest(checksumsText ?? "");
	} catch (error) {
		problems.push(
			`SHASUMS256.txt unreadable: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (checksums !== null) {
		const rowNames = [...checksums.keys()].sort();
		if (JSON.stringify(rowNames) !== JSON.stringify([...expected].sort())) {
			problems.push(
				`SHASUMS256.txt rows must cover exactly the 7 binaries; got ${rowNames.join(", ")}`,
			);
		}
		for (const [name, digest] of checksums) {
			if (assetSha256?.[name] !== digest) {
				problems.push(
					`SHASUMS256.txt row for ${name} does not equal the downloaded bytes`,
				);
			}
		}
	}

	const evidence = validateReleaseEvidenceSet(evidenceRecords);
	if (!evidence.ok) problems.push(`evidence set invalid: ${evidence.reason}`);
	const setupName = `ExifCleaner.Setup.${version}.exe`;
	const armName = `ExifCleaner-${version}-arm64.dmg`;
	const x64Name = `ExifCleaner-${version}.dmg`;
	const windows = Array.isArray(evidenceRecords)
		? evidenceRecords.find((record) => record?.runnerOs === "windows")
		: undefined;
	const macos = Array.isArray(evidenceRecords)
		? evidenceRecords.find((record) => record?.runnerOs === "macos")
		: undefined;
	if (windows) {
		if (windows.artifactName !== setupName) {
			problems.push(`windows evidence must name ${setupName}`);
		}
		if (windows.artifactSha256 !== assetSha256?.[setupName]) {
			problems.push("windows evidence sha256 differs from the published Setup");
		}
		if (windows.peMachine !== "amd64") {
			problems.push(`windows evidence peMachine is ${windows.peMachine}`);
		}
	}
	if (macos && macos.artifactSha256 !== assetSha256?.[armName]) {
		problems.push("macos evidence sha256 differs from the published arm64 DMG");
	}
	if (
		!SHA256.test(String(x64DmgSha256)) ||
		assetSha256?.[x64Name] !== x64DmgSha256
	) {
		problems.push("x64 DMG sha256 differs from the CI Intel smoke value");
	}
	return problems;
}

export function requireSuccessfulJob(jobs, name) {
	const job = jobs.find((candidate) => candidate.name === name);
	if (!job) throw new Error(`CI run has no job named ${name}`);
	if (job.conclusion !== "success") {
		throw new Error(`${name} concluded ${job.conclusion}, expected success`);
	}
	return job;
}

export function x64DmgHashFromLog(text) {
	const values = new Set();
	for (const match of String(text).matchAll(/X64 DMG SHA256 ([0-9a-f]{64})/g)) {
		values.add(match[1]);
	}
	if (values.size !== 1) {
		throw new Error(
			`expected exactly one distinct "X64 DMG SHA256" value, found ${values.size}`,
		);
	}
	return [...values][0];
}

export function buildGateArguments({ tag, workDir, sourceSha, notesPath }) {
	const match = TAG.exec(tag);
	if (!match) throw new Error(`tag must look like vX.Y.Z: ${tag}`);
	return [
		GATE_PATH,
		"--assets",
		path.join(workDir, "assets"),
		"--evidence",
		path.join(workDir, "evidence"),
		"--source-sha",
		sourceSha,
		"--version",
		match[1],
		"--release-json",
		path.join(workDir, "published.json"),
		"--release-notes",
		notesPath,
		"--expected-draft",
		"false",
	];
}

function parseArguments(argv) {
	const values = new Map();
	for (let index = 0; index < argv.length; index += 2) {
		const key = argv[index];
		const value = argv[index + 1];
		if (
			!key?.startsWith("--") ||
			value === undefined ||
			value.startsWith("--")
		) {
			throw new Error(`bad argument near ${key}`);
		}
		values.set(key, value);
	}
	return values;
}

function gh(args, { binary = false } = {}) {
	const result = spawnSync("gh", args, {
		encoding: binary ? "buffer" : "utf8",
		maxBuffer: 256 * 1024 * 1024,
	});
	if (result.error || result.status !== 0) {
		throw new Error(
			`gh ${args.slice(0, 3).join(" ")} failed: ${result.error?.message ?? String(result.stderr)}`,
		);
	}
	return result.stdout;
}

function sha256Stream(filePath) {
	const hash = crypto.createHash("sha256");
	const fd = fs.openSync(filePath, "r");
	try {
		const buffer = Buffer.alloc(1024 * 1024);
		let read;
		while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
			hash.update(buffer.subarray(0, read));
		}
	} finally {
		fs.closeSync(fd);
	}
	return hash.digest("hex");
}

function findFiles(directory, pattern) {
	const found = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const full = path.join(directory, entry.name);
		if (entry.isDirectory()) found.push(...findFiles(full, pattern));
		else if (pattern.test(entry.name)) found.push(full);
	}
	return found;
}

export function main(argv = process.argv.slice(2)) {
	try {
		const args = parseArguments(argv);
		const tag = args.get("--tag");
		if (!tag || !TAG.test(tag)) throw new Error("--tag vX.Y.Z is required");
		const version = TAG.exec(tag)[1];
		const workArg = args.get("--work-dir");
		if (!workArg) throw new Error("--work-dir is required");
		const workDir = path.resolve(workArg);
		if (fs.existsSync(workDir) && fs.readdirSync(workDir).length > 0) {
			throw new Error("work directory must be new or empty");
		}
		const ciRun = args.get("--ci-run");
		const evidenceDirArg = args.get("--evidence-dir");
		const explicitHash = args.get("--x64-dmg-sha256");
		if (!ciRun && !(evidenceDirArg && explicitHash)) {
			throw new Error(
				"give --ci-run RUN, or both --evidence-dir DIR and --x64-dmg-sha256 HEX",
			);
		}
		const repo = args.get("--repo") ?? "szTheory/exifcleaner";
		fs.mkdirSync(workDir, { recursive: true });
		const assetsDir = path.join(workDir, "assets");
		const evidenceDir = path.join(workDir, "evidence");
		fs.mkdirSync(evidenceDir, { recursive: true });

		const published = gh([
			"release",
			"view",
			tag,
			"--repo",
			repo,
			"--json",
			"isDraft,tagName,body,assets,url",
		]);
		fs.writeFileSync(path.join(workDir, "published.json"), published);
		gh(["release", "download", tag, "--repo", repo, "--dir", assetsDir]);

		let x64Hash = explicitHash;
		if (ciRun) {
			const raw = path.join(workDir, "evidence-raw");
			gh([
				"run",
				"download",
				ciRun,
				"--repo",
				repo,
				"--pattern",
				"release-evidence-*",
				"--dir",
				raw,
			]);
			for (const file of findFiles(raw, /^release-evidence-.*\.json$/)) {
				fs.copyFileSync(file, path.join(evidenceDir, path.basename(file)));
			}
			const jobs = JSON.parse(
				gh(["run", "view", ciRun, "--repo", repo, "--json", "jobs"]),
			).jobs;
			const job = requireSuccessfulJob(jobs, X64_JOB_NAME);
			x64Hash = x64DmgHashFromLog(
				gh([
					"run",
					"view",
					ciRun,
					"--repo",
					repo,
					"--log",
					"--job",
					String(job.databaseId),
				]),
			);
		} else {
			for (const file of findFiles(path.resolve(evidenceDirArg), /\.json$/)) {
				fs.copyFileSync(file, path.join(evidenceDir, path.basename(file)));
			}
		}

		const notesPath = path.join(workDir, "release-notes-at-tag.md");
		fs.writeFileSync(
			notesPath,
			gh([
				"api",
				"-H",
				"Accept: application/vnd.github.raw",
				`repos/${repo}/contents/RELEASE_NOTES.md?ref=${tag}`,
			]),
		);
		const sourceSha = String(
			gh(["api", `repos/${repo}/commits/${tag}`, "--jq", ".sha"]),
		).trim();

		const assetSha256 = {};
		for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
			if (entry.isFile()) {
				assetSha256[entry.name] = sha256Stream(
					path.join(assetsDir, entry.name),
				);
			}
		}
		const checksumPath = path.join(assetsDir, CHECKSUM_FILE);
		const evidenceRecords = fs
			.readdirSync(evidenceDir)
			.filter((name) => name.endsWith(".json"))
			.sort()
			.map((name) =>
				JSON.parse(fs.readFileSync(path.join(evidenceDir, name), "utf8")),
			);
		const problems = evaluatePublishedRelease({
			version,
			release: JSON.parse(published),
			checksumsText: fs.existsSync(checksumPath)
				? fs.readFileSync(checksumPath, "utf8")
				: "",
			assetSha256,
			evidenceRecords,
			x64DmgSha256: x64Hash,
		});
		if (problems.length === 0) {
			const gate = spawnSync(
				process.execPath,
				buildGateArguments({ tag, workDir, sourceSha, notesPath }),
				{ encoding: "utf8" },
			);
			if (gate.status !== 0) {
				problems.push(
					`release_asset_gate.mjs failed: ${String(gate.stderr).trim()}`,
				);
			}
		}
		if (problems.length > 0) {
			console.error("✗ PUBLIC RELEASE AUDIT FAILED:");
			for (const problem of problems) console.error(`  ${problem}`);
			return 1;
		}
		console.log(`✓ PUBLIC RELEASE AUDIT PASSED — ${tag}`);
		return 0;
	} catch (error) {
		console.error("✗ PUBLIC RELEASE AUDIT FAILED:");
		console.error(
			`  ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
