// Merge-base read for the catalog ratchets (Phase 71, D-02).
//
// A copy of the read in scripts/findings_ratchet.mjs, which stays untouched
// and is not imported (it is a contract another gate depends on). The data
// path is a parameter; a missing base ref fails closed, never a skip.
import { execFileSync } from "node:child_process";

/**
 * Explicit ref wins, then `origin/<GITHUB_BASE_REF>`, then `origin/master`.
 *
 * @param {string | undefined} explicit
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function resolveBaseRef(explicit, env) {
	if (typeof explicit === "string" && explicit !== "") {
		return explicit;
	}
	const baseRef = env["GITHUB_BASE_REF"];
	return baseRef ? `origin/${baseRef}` : "origin/master";
}

function gitText(args, cwd) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		stdio: ["ignore", "pipe", "pipe"],
	});
}

/**
 * The file's parsed JSON at the merge-base of HEAD and `ref`. `base` is null
 * when the file is absent there (the one admitted bootstrap).
 *
 * @param {string} relPath
 * @param {{ ref: string, cwd: string }} options
 * @returns {{ mergeBase: string, base: unknown }}
 */
export function readMergeBase(relPath, { ref, cwd }) {
	try {
		gitText(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
	} catch {
		throw new Error(`base ref ${ref} not found; run git fetch origin`);
	}
	const mergeBase = gitText(["merge-base", "HEAD", ref], cwd).trim();
	const listed = gitText(["ls-tree", mergeBase, "--", relPath], cwd).trim();
	if (listed === "") {
		return { mergeBase, base: null };
	}
	try {
		return {
			mergeBase,
			base: JSON.parse(gitText(["show", `${mergeBase}:${relPath}`], cwd)),
		};
	} catch (error) {
		throw new Error(
			`${relPath} at merge-base ${mergeBase.slice(0, 7)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
