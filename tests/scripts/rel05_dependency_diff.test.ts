import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	RELEASE_DEPENDENCY_POLICY,
	compareDependencySurfaces,
	main,
} from "../../scripts/rel05_dependency_diff.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const policy = RELEASE_DEPENDENCY_POLICY["4.7.0"];

function git(args: string[]): string {
	return execFileSync("git", args, {
		cwd: ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
}

const headPackage = JSON.parse(
	fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);
const basePackage = JSON.parse(git(["show", "v4.6.0:package.json"]));

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

describe("REL-05 package.json delta against the 4.7.0 policy", () => {
	test("the real v4.6.0 to HEAD delta satisfies the policy", () => {
		expect(
			compareDependencySurfaces({ basePackage, headPackage, policy }),
		).toEqual([]);
	});

	test("a runtime react bump is named by key", () => {
		const head = clone(headPackage);
		head.dependencies.react = "^19.3.1";
		const reasons = compareDependencySurfaces({
			basePackage,
			headPackage: head,
			policy,
		});
		expect(reasons.join("\n")).toContain("dependencies.react");
	});

	test("an extra changed dev dependency fails the change-set check", () => {
		const head = clone(headPackage);
		head.devDependencies.vitest = "9.9.9";
		const reasons = compareDependencySurfaces({
			basePackage,
			headPackage: head,
			policy,
		});
		expect(reasons.join("\n")).toContain("devDependencies change set");
	});

	test("main passes on the real repository state", () => {
		expect(main(["--release", "4.7.0"])).toBe(0);
	});
});
