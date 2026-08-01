import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_PLATFORMS = ["linux", "macos", "windows"];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function requireNonEmptyString(value, field) {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`${field} must be a non-empty string`);
	}
	return value;
}

function packageVersion() {
	const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
	const packageJson = JSON.parse(
		fs.readFileSync(
			path.resolve(scriptDirectory, "..", "package.json"),
			"utf8",
		),
	);
	return requireNonEmptyString(packageJson.version, "package.json version");
}

function artifactSha256(artifactPath) {
	return crypto
		.createHash("sha256")
		.update(fs.readFileSync(artifactPath))
		.digest("hex");
}

/**
 * Build evidence for one installed native artifact. The hash and package identity are read
 * locally instead of trusted from caller input, so a green record cannot describe other bytes.
 *
 * @param {{sourceCommit?: unknown; runnerOs?: unknown; runnerArch?: unknown; artifactPath?: unknown; executablePath?: unknown; smokeResult?: unknown}} input
 */
export function buildReleaseEvidence(input) {
	const sourceCommit = requireNonEmptyString(
		input.sourceCommit ?? process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT,
		"sourceCommit",
	);
	const runnerOs = requireNonEmptyString(
		input.runnerOs,
		"runnerOs",
	).toLowerCase();
	if (!REQUIRED_PLATFORMS.includes(runnerOs)) {
		throw new Error(
			`runnerOs must be one of: ${REQUIRED_PLATFORMS.join(", ")}`,
		);
	}
	const runnerArch = requireNonEmptyString(input.runnerArch, "runnerArch");
	const artifactPath = path.resolve(
		requireNonEmptyString(input.artifactPath, "artifactPath"),
	);
	if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
		throw new Error(`artifactPath must name an existing file: ${artifactPath}`);
	}
	const executablePath = path.resolve(
		requireNonEmptyString(input.executablePath, "executablePath"),
	);
	if (!fs.existsSync(executablePath) || !fs.statSync(executablePath).isFile()) {
		throw new Error(
			`executablePath must name an installed executable file: ${executablePath}`,
		);
	}
	if (input.smokeResult !== "passed") {
		throw new Error('smokeResult must be the literal value "passed"');
	}

	return {
		sourceCommit,
		packageVersion: packageVersion(),
		runnerOs,
		runnerArch,
		artifactPath,
		artifactName: path.basename(artifactPath),
		artifactSha256: artifactSha256(artifactPath),
		executablePath,
		smokeResult: "passed",
	};
}

function invalid(reason) {
	return { ok: false, reason };
}

/**
 * Validate the independently produced macOS, Windows, and Linux records that gate a release.
 *
 * @param {unknown[]} records
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function validateReleaseEvidenceSet(records) {
	if (!Array.isArray(records) || records.length !== REQUIRED_PLATFORMS.length) {
		return invalid(
			"platform set must contain exactly macos, windows, and linux evidence",
		);
	}

	const byPlatform = new Map();
	for (const record of records) {
		if (record === null || typeof record !== "object") {
			return invalid("evidence record must be an object");
		}
		const platform = record.runnerOs;
		if (
			typeof platform !== "string" ||
			!REQUIRED_PLATFORMS.includes(platform)
		) {
			return invalid(
				`runnerOs must be one of: ${REQUIRED_PLATFORMS.join(", ")}`,
			);
		}
		if (byPlatform.has(platform)) {
			return invalid(`platform ${platform} has duplicate evidence`);
		}
		byPlatform.set(platform, record);
	}
	for (const platform of REQUIRED_PLATFORMS) {
		if (!byPlatform.has(platform)) {
			return invalid(`platform ${platform} evidence is missing`);
		}
	}

	const [reference] = records;
	for (const [platform, record] of byPlatform) {
		for (const field of [
			"sourceCommit",
			"packageVersion",
			"runnerArch",
			"artifactPath",
			"artifactName",
			"executablePath",
		]) {
			if (typeof record[field] !== "string" || record[field].trim() === "") {
				return invalid(`${platform} ${field} is missing`);
			}
		}
		if (!SHA256_PATTERN.test(record.artifactSha256 ?? "")) {
			return invalid(`${platform} artifactSha256 is missing or invalid`);
		}
		if (record.smokeResult !== "passed") {
			return invalid(`${platform} smokeResult must be passed`);
		}
		for (const field of ["sourceCommit", "packageVersion"]) {
			if (record[field] !== reference[field]) {
				return invalid(
					`${platform} ${field} does not match the native evidence set`,
				);
			}
		}
	}

	const artifactIdentities = new Set(
		records.map((record) => `${record.artifactName}:${record.artifactSha256}`),
	);
	if (artifactIdentities.size !== records.length) {
		return invalid("artifact identity must be distinct for every platform");
	}

	return { ok: true };
}

function parseArguments(argv) {
	const values = new Map();
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--write" || argument === "--validate-set") {
			values.set(argument, argv[index + 1] ?? true);
			if (argument === "--validate-set") index += 1;
			continue;
		}
		if (!argument.startsWith("--"))
			throw new Error(`unknown argument: ${argument}`);
		const value = argv[index + 1];
		if (value === undefined || value.startsWith("--")) {
			throw new Error(`missing value for ${argument}`);
		}
		values.set(argument, value);
		index += 1;
	}
	return values;
}

export function main() {
	try {
		const argumentsByName = parseArguments(process.argv.slice(2));
		if (argumentsByName.has("--write")) {
			const output = requireNonEmptyString(
				argumentsByName.get("--output"),
				"output",
			);
			const record = buildReleaseEvidence({
				sourceCommit: argumentsByName.get("--source-commit"),
				runnerOs: argumentsByName.get("--runner-os"),
				runnerArch: argumentsByName.get("--runner-arch"),
				artifactPath: argumentsByName.get("--artifact"),
				executablePath: argumentsByName.get("--executable"),
				smokeResult: argumentsByName.get("--smoke-result"),
			});
			fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
			fs.writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`);
			console.log(`✓ wrote release evidence: ${output}`);
			return 0;
		}
		if (argumentsByName.has("--validate-set")) {
			const directory = path.resolve(argumentsByName.get("--validate-set"));
			const records = fs
				.readdirSync(directory)
				.filter((name) => name.endsWith(".json"))
				.sort()
				.map((name) =>
					JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")),
				);
			const result = validateReleaseEvidenceSet(records);
			if (!result.ok) throw new Error(result.reason);
			console.log("✓ RELEASE EVIDENCE SET PASSED");
			return 0;
		}
		throw new Error("use either --write or --validate-set <directory>");
	} catch (error) {
		console.error(
			`✗ RELEASE EVIDENCE FAILED: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
