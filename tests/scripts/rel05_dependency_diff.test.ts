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
// A missing 4.8.0 entry must fail the tests below by assertion, not by a module-level throw that
// hides every name; the empty fallback has no allowance, so each allow case is red without it.
const policy480 = RELEASE_DEPENDENCY_POLICY["4.8.0"] ?? {
	base: "",
	devDependencies: [],
	resolutions: [],
};

function git(args: string[]): string {
	return execFileSync("git", args, {
		cwd: ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
}

// The 4.7.0 cases measure the released v4.7.0 tag against v4.6.0 (the history the 4.7.0 policy
// describes), not the working tree: since the 0.5.0 pin (69-06) the working tree is a 4.8.0 head.
const basePackage = JSON.parse(git(["show", "v4.6.0:package.json"]));
const headPackage = JSON.parse(git(["show", "v4.7.0:package.json"]));
const baseLock = git(["show", "v4.6.0:yarn.lock"]);
const headLock = git(["show", "v4.7.0:yarn.lock"]);

// The 4.8.0 cases start from the released v4.7.0 manifests and lock and apply the one intended
// change by textual edit, so the closure checks run on real lock data, not a mock. The 0.5.0 stanza
// is the sealed one (exifcleaner_node_dependency_gate.mjs).
const NODE_040_STANZA = /^exifcleaner-node@0\.4\.0:\n(?: {2}.*\n)+/m;
const NODE_050_STANZA = `exifcleaner-node@0.5.0:
  version "0.5.0"
  resolved "https://registry.yarnpkg.com/exifcleaner-node/-/exifcleaner-node-0.5.0.tgz#6231bb83f6f326e1820ec5717f89b5e6fdecede6"
  integrity sha512-SsKgovQJXMlPTgYifNJlLwDb+7hYEcAJgYYRlTK9ym5RAtQprjVKR578jG9EuVW6XMuYvsE/ZRYnzT+K2JSmfw==
`;
const lock480 = baseLock480(NODE_050_STANZA);
const package480 = nodeFiveHead(headPackage);

function baseLock480(stanza: string): string {
	const replaced = headLock.replace(NODE_040_STANZA, stanza);
	if (replaced === headLock) throw new Error("v4.7.0 lock has no 0.4.0 stanza");
	return replaced;
}

function nodeFiveHead(pkg: typeof headPackage): typeof headPackage {
	const head = JSON.parse(JSON.stringify(pkg));
	head.dependencies["exifcleaner-node"] = "0.5.0";
	return head;
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

describe("REL-05 package.json delta against the 4.7.0 policy", () => {
	test("the real v4.6.0 to HEAD delta satisfies the policy", () => {
		expect(
			compareDependencySurfaces({
				basePackage,
				headPackage,
				policy,
				release: "4.7.0",
			}),
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

	test("the 4.7.0 policy entry is unchanged", () => {
		expect(policy).toEqual({
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
		});
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

describe("REL-05 4.8.0 policy: exifcleaner-node 0.4.0 to 0.5.0 and nothing else", () => {
	const v470Package = headPackage;
	const v470Lock = headLock;
	const run = (over: { headPackage?: unknown; headLock?: string }): string[] =>
		compareDependencySurfaces({
			basePackage: v470Package,
			headPackage: over.headPackage ?? package480,
			policy: policy480,
			release: "4.8.0",
			baseLock: v470Lock,
			headLock: over.headLock ?? lock480,
		});

	test("the 4.8.0 policy entry declares base v4.7.0 and only exifcleaner-node", () => {
		expect(RELEASE_DEPENDENCY_POLICY["4.8.0"]).toEqual({
			base: "v4.7.0",
			devDependencies: [],
			resolutions: [],
			dependencies: ["exifcleaner-node"],
		});
	});

	test("4.8.0 allows exifcleaner-node 0.4.0 -> 0.5.0 and nothing else", () => {
		expect(package480.dependencies["exifcleaner-node"]).toBe("0.5.0");
		expect(v470Package.dependencies["exifcleaner-node"]).toBe("0.4.0");
		expect(run({})).toEqual([]);
	});

	test("a react or zod change under the 4.8.0 policy still fails, named by key", () => {
		const react = nodeFiveHead(headPackage);
		react.dependencies.react = "^19.3.1";
		expect(run({ headPackage: react }).join("\n")).toContain(
			"dependencies.react changed",
		);
		const zod = nodeFiveHead(headPackage);
		zod.dependencies.zod = "3.25.77";
		expect(run({ headPackage: zod }).join("\n")).toContain(
			"dependencies.zod changed",
		);
	});

	test("the declared dependency must actually change: the allowance is an exact set", () => {
		const reasons = compareDependencySurfaces({
			basePackage: v470Package,
			headPackage: v470Package,
			policy: policy480,
			release: "4.8.0",
		});
		expect(reasons).toContain(
			"dependencies change set [] does not equal the 4.8.0 policy [exifcleaner-node]",
		);
	});

	test("a dev-dependency change under the empty 4.8.0 policy still fails (Dependabot drift guard)", () => {
		const head = nodeFiveHead(headPackage);
		head.devDependencies.vitest = "9.9.9";
		const reasons = run({ headPackage: head });
		expect(reasons).toContain(
			"devDependencies change set [vitest] does not equal the 4.8.0 policy []",
		);
	});

	test("a resolutions change under the empty 4.8.0 policy still fails", () => {
		const head = nodeFiveHead(headPackage);
		head.resolutions = { ...head.resolutions, vite: "9.9.9" };
		expect(run({ headPackage: head })).toContain(
			"resolutions change set [vite] does not equal the 4.8.0 policy []",
		);
	});

	test("closure drift outside exifcleaner-node still fails", () => {
		const mutated = lock480.replace(
			/(scheduler@\^0\.28\.0:\n {2}version )"0\.28\.0"/,
			'$1"0.28.1"',
		);
		expect(mutated).not.toBe(lock480);
		const reasons = run({ headLock: mutated });
		expect(reasons.join("\n")).toContain("production closure differs");
		expect(reasons.join("\n")).toContain("scheduler@0.28.1");
		expect(reasons.join("\n")).not.toContain("exifcleaner-node@");
	});

	test("a new transitive dependency of exifcleaner-node still fails", () => {
		const withTransitive = lock480.replace(
			NODE_050_STANZA,
			`${NODE_050_STANZA}  dependencies:
    left-pad "^1.3.0"

left-pad@^1.3.0:
  version "1.3.0"
  resolved "https://registry.yarnpkg.com/left-pad/-/left-pad-1.3.0.tgz#0000000000000000000000000000000000000000"
  integrity sha512-AAAA
`,
		);
		expect(withTransitive).not.toBe(lock480);
		const reasons = run({ headLock: withTransitive });
		expect(reasons.join("\n")).toContain("production closure differs");
		expect(reasons.join("\n")).toContain("left-pad@1.3.0");
	});

	test("main passes on this branch for --release 4.8.0 against v4.7.0", () => {
		expect(main(["--release", "4.8.0"])).toBe(0);
	});

	test("an unknown release such as 4.9.0 still fails closed", () => {
		const errors: string[] = [];
		const spy = vi.spyOn(console, "error").mockImplementation((m) => {
			errors.push(String(m));
		});
		try {
			expect(main(["--release", "4.9.0"])).toBe(1);
		} finally {
			spy.mockRestore();
		}
		expect(errors.join("\n")).toContain(
			"no dependency policy declared for 4.9.0",
		);
	});
});
