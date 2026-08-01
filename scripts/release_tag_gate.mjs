import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCKED_TARGETS = {
	v4_0: "0d625e9a84b9697844fe2ef139e4105a192a1179",
	v4_1: "0a9af3179730ba735a405ba41cf57fecf7923743",
};
const TARGET_KEYS = Object.keys(LOCKED_TARGETS);
const EVIDENCE_PATH = "docs/evidence/2026-07-31-tag-hygiene.json";
const TWO_PART_PUBLIC_TAG = /^refs\/tags\/v\d+\.\d+$/;
const FULL_SHA = /^[0-9a-f]{40}$/;

function tagKey(tagName) {
	return tagName.replace(".", "_");
}

function requireFullSha(value, label) {
	if (typeof value !== "string" || !FULL_SHA.test(value)) {
		throw new Error(`${label} must be a full 40-character commit SHA`);
	}

	return value;
}

/**
 * Reject only public application-looking two-part version tags (D-26).
 *
 * @param {string} ref full Git tag ref
 * @returns {{ok: boolean; reason?: string}}
 */
export function classifyTagRef(ref) {
	const normalized = String(ref).replace(/\\/g, "/");
	if (TWO_PART_PUBLIC_TAG.test(normalized)) {
		return {
			ok: false,
			reason: `${normalized} is a prohibited two-part public release tag`,
		};
	}

	return { ok: true };
}

/**
 * Parse `git ls-remote --tags` output without confusing an annotated tag object with its
 * peeled commit target. Only exact locked refs are retained.
 *
 * @param {string} text `git ls-remote` output
 * @returns {Record<string, {object?: string; peeled?: string}>}
 */
export function parseRemoteTags(text) {
	const refs = {};

	for (const line of String(text).split(/\r?\n/)) {
		const [sha, ref] = line.split("\t");
		if (sha === undefined || ref === undefined || !FULL_SHA.test(sha)) {
			continue;
		}

		const peeled = ref.endsWith("^{}");
		const tagRef = peeled ? ref.slice(0, -3) : ref;
		if (!Object.hasOwn(LOCKED_TARGETS, tagKey(path.basename(tagRef)))) {
			continue;
		}

		const key = tagKey(path.basename(tagRef));
		refs[key] ??= {};
		if (peeled) {
			refs[key].peeled = sha;
		} else {
			refs[key].object = sha;
		}
	}

	return refs;
}

/**
 * Fail closed unless both local refs resolve to their full, locked peeled commits.
 *
 * @param {Record<string, string | {peeled?: string}>} refMap
 * @returns {Record<string, string>}
 */
export function verifyCleanupTargets(refMap) {
	const verified = {};

	for (const key of TARGET_KEYS) {
		const raw = refMap[key];
		const peeled = typeof raw === "string" ? raw : raw?.peeled;
		if (peeled === undefined) {
			throw new Error(`${key.replace("_", ".")} needs a peeled commit target`);
		}
		if (peeled !== LOCKED_TARGETS[key]) {
			throw new Error(
				`${key.replace("_", ".")} peeled target mismatch: expected ${LOCKED_TARGETS[key]}, got ${peeled}`,
			);
		}
		verified[key] = requireFullSha(
			peeled,
			`${key.replace("_", ".")} peeled target`,
		);
	}

	return verified;
}

function remoteStatus(key, remoteRef) {
	if (remoteRef === undefined) {
		return { status: "absent" };
	}
	if (remoteRef.peeled === LOCKED_TARGETS[key]) {
		return { status: "matching", peeled: remoteRef.peeled };
	}
	return {
		status: "mismatch",
		object: remoteRef.object,
		peeled: remoteRef.peeled,
	};
}

/**
 * Create the pre-mutation tag evidence record. This is pure so fixture tests cannot touch
 * refs, the network, or the evidence file.
 *
 * @param {{capturedAt: string; repository: string; origin: string; localRefs: Record<string, {object?: string; peeled?: string}>; remoteTags: Record<string, {object?: string; peeled?: string}>}} input
 * @returns {object}
 */
export function buildTagEvidence(input) {
	const targets = verifyCleanupTargets(input.localRefs);
	const refs = {};

	for (const key of TARGET_KEYS) {
		refs[key] = {
			ref: `refs/tags/${key.replace("_", ".")}`,
			object: input.localRefs[key]?.object,
			peeled: targets[key],
			expected: LOCKED_TARGETS[key],
			reason:
				"Stale two-part internal milestone marker; public v* names are reserved for application releases (D-23).",
			remote: remoteStatus(key, input.remoteTags[key]),
		};
	}

	return {
		schemaVersion: 1,
		capturedAt: input.capturedAt,
		repository: input.repository,
		origin: input.origin,
		refs,
	};
}

function runGit(rootDirectory, args) {
	return execFileSync("git", args, {
		cwd: rootDirectory,
		encoding: "utf8",
	}).trim();
}

function resolveLocalRefs(rootDirectory) {
	const refs = {};
	for (const key of TARGET_KEYS) {
		const name = key.replace("_", ".");
		refs[key] = {
			object: runGit(rootDirectory, ["rev-parse", `refs/tags/${name}`]),
			peeled: runGit(rootDirectory, [
				"rev-parse",
				`refs/tags/${name}^{commit}`,
			]),
		};
	}
	return refs;
}

function checkNamespace(rootDirectory) {
	const refs = runGit(rootDirectory, [
		"for-each-ref",
		"--format=%(refname)",
		"refs/tags",
	]).split(/\r?\n/);
	const blocked = refs.map(classifyTagRef).filter((result) => !result.ok);
	if (blocked.length > 0) {
		throw new Error(blocked.map((result) => result.reason).join("\n"));
	}
}

/**
 * Run the policy gate or write the read-only pre-deletion evidence. This function never
 * deletes, creates, moves, or pushes Git refs.
 *
 * @returns {number}
 */
export function main() {
	const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
	const rootDirectory = path.resolve(scriptDirectory, "..");
	const captureEvidence = process.argv.includes("--capture-evidence");

	try {
		if (!captureEvidence) {
			checkNamespace(rootDirectory);
			console.log("✓ RELEASE-TAG GATE PASSED");
			return 0;
		}

		const remoteTags = parseRemoteTags(
			runGit(rootDirectory, [
				"ls-remote",
				"--tags",
				"origin",
				"refs/tags/v4.0",
				"refs/tags/v4.1",
			]),
		);
		const evidence = buildTagEvidence({
			capturedAt: new Date().toISOString(),
			repository: runGit(rootDirectory, [
				"config",
				"--get",
				"remote.origin.url",
			]),
			origin: runGit(rootDirectory, ["remote", "get-url", "origin"]),
			localRefs: resolveLocalRefs(rootDirectory),
			remoteTags,
		});

		if (
			Object.values(evidence.refs).some(
				(ref) => ref.remote.status === "mismatch",
			)
		) {
			throw new Error(
				"Remote locked ref target mismatch; refusing to write approval evidence",
			);
		}

		fs.mkdirSync(path.dirname(path.join(rootDirectory, EVIDENCE_PATH)), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(rootDirectory, EVIDENCE_PATH),
			`${JSON.stringify(evidence, null, "\t")}\n`,
		);
		console.log(`✓ RELEASE-TAG EVIDENCE CAPTURED — ${EVIDENCE_PATH}`);
		return 0;
	} catch (error) {
		console.error(`\n✗ RELEASE-TAG GATE FAILED:\n${error.message}\n`);
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
