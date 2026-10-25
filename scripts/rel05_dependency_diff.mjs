import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The 4.7.0 devDependencies policy is the six #387 names plus electron (D-13, D-15). resolutions.vite
// is in the policy because #387 bumps the vite resolution with the dev dependency; this departs from
// D-03 ("vite resolution unchanged") and is reconciliation R2, acknowledged at the 65-09 checkpoint.
export const RELEASE_DEPENDENCY_POLICY = {
	"4.7.0": {
		base: "v4.6.0",
		devDependencies: [
			"@playwright/test",
			"@types/node",
			"electron",
			"playwright",
			"prettier",
			"tsx",
			"vite",
		],
		resolutions: ["vite"],
	},
};

/**
 * Sorted union of keys whose values differ as exact strings (added, removed or changed).
 *
 * @param {Record<string, string> | undefined} baseRecord
 * @param {Record<string, string> | undefined} headRecord
 * @returns {string[]}
 */
export function changedKeys(baseRecord, headRecord) {
	const base = baseRecord ?? {};
	const head = headRecord ?? {};
	return [...new Set([...Object.keys(base), ...Object.keys(head)])]
		.filter((key) => base[key] !== head[key])
		.sort();
}

/**
 * @param {{basePackage: any, headPackage: any, policy: {devDependencies: string[], resolutions: string[]}, baseLock?: string, headLock?: string}} input
 * @returns {string[]} reasons; empty when the delta satisfies the policy
 */
export function compareDependencySurfaces({
	basePackage,
	headPackage,
	policy,
	baseLock,
	headLock,
}) {
	const reasons = [];
	for (const key of changedKeys(
		basePackage.dependencies,
		headPackage.dependencies,
	)) {
		reasons.push(
			`dependencies.${key} changed: ${basePackage.dependencies?.[key]} -> ${headPackage.dependencies?.[key]}`,
		);
	}
	for (const [field, expected] of [
		["devDependencies", policy.devDependencies],
		["resolutions", policy.resolutions],
	]) {
		const actual = changedKeys(basePackage[field], headPackage[field]);
		const wanted = [...expected].sort();
		if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
			reasons.push(
				`${field} change set [${actual}] does not equal the 4.7.0 policy [${wanted}]`,
			);
		}
	}
	if (baseLock !== undefined && headLock !== undefined) {
		const baseClosure = productionClosure(basePackage, baseLock);
		const headClosure = productionClosure(headPackage, headLock);
		const onlyBase = baseClosure.filter((id) => !headClosure.includes(id));
		const onlyHead = headClosure.filter((id) => !baseClosure.includes(id));
		if (onlyBase.length > 0 || onlyHead.length > 0) {
			reasons.push(
				`production closure differs: only at base [${onlyBase}]; only at head [${onlyHead}]`,
			);
		}
	}
	return reasons;
}

function splitSpec(raw) {
	const spec = raw.trim().replace(/^"|"$/g, "");
	const at = spec.lastIndexOf("@");
	if (at <= 0) throw new Error(`unparsable yarn.lock spec: ${raw}`);
	return { name: spec.slice(0, at), spec };
}

function unquote(token) {
	return token.replace(/^"|"$/g, "");
}

/**
 * Hand-written yarn v1 lockfile parser. Returns a Map from `name@range` to the resolved entry.
 *
 * @param {string} text
 * @returns {Map<string, {name: string, version: string, dependencies: Array<[string, string]>}>}
 */
export function parseYarnLock(text) {
	if (typeof text !== "string" || text.trim() === "") {
		throw new Error("yarn.lock is empty");
	}
	const entries = new Map();
	let current = null;
	let section = null;
	for (const line of text.split(/\r?\n/)) {
		if (line.trim() === "" || line.startsWith("#")) {
			if (line.trim() === "") {
				current = null;
				section = null;
			}
			continue;
		}
		if (!line.startsWith(" ")) {
			if (!line.endsWith(":")) continue;
			const specs = line
				.slice(0, -1)
				.split(",")
				.map((raw) => splitSpec(raw));
			const entry = {
				name: specs[0].name,
				version: "",
				dependencies: /** @type {Array<[string, string]>} */ ([]),
			};
			for (const { spec } of specs) entries.set(spec, entry);
			current = entry;
			section = null;
			continue;
		}
		if (current === null) continue;
		const indent = line.length - line.trimStart().length;
		const body = line.trim();
		if (indent === 2) {
			const version = /^version "(.*)"$/.exec(body);
			if (version) current.version = version[1];
			section =
				body === "dependencies:" || body === "optionalDependencies:"
					? body
					: null;
		} else if (indent === 4 && section !== null) {
			const match = /^("[^"]+"|\S+) "(.*)"$/.exec(body);
			if (match) current.dependencies.push([unquote(match[1]), match[2]]);
		}
	}
	if (entries.size === 0) throw new Error("yarn.lock has no entries");
	return entries;
}

/**
 * Sorted unique `name@version` strings reachable from package dependencies through the lockfile.
 *
 * @param {{dependencies?: Record<string, string>}} packageJson
 * @param {string} lockText
 * @returns {string[]}
 */
export function productionClosure(packageJson, lockText) {
	const lock = parseYarnLock(lockText);
	const seen = new Set();
	const result = new Set();
	const queue = Object.entries(packageJson.dependencies ?? {}).map(
		([name, range]) => `${name}@${range}`,
	);
	while (queue.length > 0) {
		const spec = queue.shift();
		if (seen.has(spec)) continue;
		seen.add(spec);
		const entry = lock.get(spec);
		if (!entry) throw new Error(`yarn.lock has no entry for ${spec}`);
		result.add(`${entry.name}@${entry.version}`);
		for (const [name, range] of entry.dependencies) {
			queue.push(`${name}@${range}`);
		}
	}
	return [...result].sort();
}

function gitText(args) {
	return execFileSync("git", args, {
		cwd: ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
}

function tagExists(tag) {
	try {
		gitText(["rev-parse", "-q", "--verify", `refs/tags/${tag}`]);
		return true;
	} catch {
		return false;
	}
}

function parseArguments(argv) {
	const parsed = new Map();
	for (let index = 0; index < argv.length; index += 2) {
		parsed.set(argv[index], argv[index + 1]);
	}
	return parsed;
}

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv = process.argv.slice(2)) {
	try {
		const args = parseArguments(argv);
		const headPackage = JSON.parse(
			fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
		);
		let release = args.get("--release");
		if (!release) {
			release = headPackage.version;
			if (tagExists(`v${release}`)) {
				console.log(
					`✓ REL-05 DEPENDENCY DIFF NOT APPLICABLE: v${release} is already published`,
				);
				return 0;
			}
		}
		const policy = RELEASE_DEPENDENCY_POLICY[release];
		if (!policy) {
			throw new Error(`no dependency policy declared for ${release}`);
		}
		const base = args.get("--base") ?? policy.base;
		if (!tagExists(base)) {
			throw new Error(`base tag ${base} is not available; fetch tags`);
		}
		const basePackage = JSON.parse(gitText(["show", `${base}:package.json`]));
		const reasons = compareDependencySurfaces({
			basePackage,
			headPackage,
			policy,
			baseLock: gitText(["show", `${base}:yarn.lock`]),
			headLock: fs.readFileSync(path.join(ROOT, "yarn.lock"), "utf8"),
		});
		if (reasons.length > 0) {
			console.error(`✗ REL-05 DEPENDENCY DIFF FAILED: ${reasons.join("; ")}`);
			return 1;
		}
		console.log(
			`✓ REL-05 DEPENDENCY DIFF PASSED — ${base}..HEAD for ${release}`,
		);
		return 0;
	} catch (error) {
		console.error(
			`✗ REL-05 DEPENDENCY DIFF FAILED: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
