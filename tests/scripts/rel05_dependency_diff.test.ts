import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import {
	RELEASE_DEPENDENCY_POLICY,
	compareDependencySurfaces,
	main,
	parseYarnLock,
	productionClosure,
} from "../../scripts/rel05_dependency_diff.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const policy = RELEASE_DEPENDENCY_POLICY["4.7.0"] ?? {
	base: "",
	devDependencies: [],
	resolutions: [],
};
if (policy.base !== "v4.6.0") throw new Error("4.7.0 policy entry is missing");

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

const headLock = fs.readFileSync(
	new URL("../../yarn.lock", import.meta.url),
	"utf8",
);
const baseLock = git(["show", "v4.6.0:yarn.lock"]);

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

	test("exact string comparison: ^19.3.0 vs 19.3.0 differs", () => {
		const head = clone(headPackage);
		head.dependencies.react = "19.3.0";
		const reasons = compareDependencySurfaces({
			basePackage,
			headPackage: head,
			policy,
		});
		expect(reasons.join("\n")).toContain("dependencies.react");
	});

	test("identical manifests fail because Electron 44 is a required change", () => {
		const reasons = compareDependencySurfaces({
			basePackage,
			headPackage: basePackage,
			policy,
		});
		expect(reasons).toContain(
			"devDependencies change set [] does not equal the 4.7.0 policy [@playwright/test,@types/node,electron,playwright,prettier,tsx,vite]",
		);
	});
});

describe("REL-05 yarn.lock production closure", () => {
	test("base and head closures are identical", () => {
		const base = productionClosure(basePackage, baseLock);
		expect(base).toContain("scheduler@0.28.0");
		expect(productionClosure(headPackage, headLock)).toEqual(base);
		expect(
			compareDependencySurfaces({
				basePackage,
				headPackage,
				policy,
				baseLock,
				headLock,
			}),
		).toEqual([]);
	});

	test("changing only the scheduler version in the head lock fails", () => {
		const mutated = headLock.replace(
			/(scheduler@\^0\.28\.0:\n {2}version )"0\.28\.0"/,
			'$1"0.28.1"',
		);
		expect(mutated).not.toBe(headLock);
		const reasons = compareDependencySurfaces({
			basePackage,
			headPackage,
			policy,
			baseLock,
			headLock: mutated,
		});
		expect(reasons.join("\n")).toContain("production closure");
		expect(reasons.join("\n")).toContain("scheduler@0.28.1");
	});

	test("an empty lock throws", () => {
		expect(() => parseYarnLock("")).toThrow("yarn.lock is empty");
		expect(() => productionClosure(headPackage, "  \n")).toThrow(
			"yarn.lock is empty",
		);
	});

	test("a lock missing a production spec throws naming it", () => {
		const lock = headLock.replace(/^react@[^\n]*:\n/m, "reactx@^1.0.0:\n");
		expect(() => productionClosure(headPackage, lock)).toThrow(
			/yarn\.lock has no entry for react@/,
		);
	});
});

describe("REL-05 main fail-closed paths", () => {
	test("a missing base tag returns 1 and names the tag", () => {
		const errors: string[] = [];
		const spy = vi.spyOn(console, "error").mockImplementation((m) => {
			errors.push(String(m));
		});
		try {
			expect(main(["--release", "4.7.0", "--base", "v0.0.0-missing"])).toBe(1);
		} finally {
			spy.mockRestore();
		}
		expect(errors.join("\n")).toContain("v0.0.0-missing");
	});

	test("an unknown release without a policy entry returns 1", () => {
		const errors: string[] = [];
		const spy = vi.spyOn(console, "error").mockImplementation((m) => {
			errors.push(String(m));
		});
		try {
			expect(main(["--release", "9.9.9"])).toBe(1);
		} finally {
			spy.mockRestore();
		}
		expect(errors.join("\n")).toContain("no dependency policy declared");
	});
});
