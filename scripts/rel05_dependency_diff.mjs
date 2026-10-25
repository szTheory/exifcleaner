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
	return reasons;
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
