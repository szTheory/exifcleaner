import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	ALLOWED_DRAFT_SHA,
	auditInstalledRuntime,
	classifyDependencySpec,
	validateDraftDependency,
	validatePackageMetadata,
	validateSealDependency,
} from "../../scripts/exifcleaner_node_dependency_gate.mjs";

const safeRuntime = `import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import "./local.js";
void fs; void readFile; void path;`;

function fixture(files: Record<string, string>): {
	root: string;
	cleanup(): void;
} {
	const root = mkdtempSync(path.join(tmpdir(), "native-dependency-gate-"));
	for (const [relative, contents] of Object.entries(files)) {
		const target = path.join(root, relative);
		mkdirSync(path.dirname(target), { recursive: true });
		writeFileSync(target, contents, "utf8");
	}
	return {
		root,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

describe("dependency source policy", () => {
	test("allows only the full audited SHA for draft development", () => {
		const exact = `https://github.com/szTheory/exifcleaner-node.git#${ALLOWED_DRAFT_SHA}`;
		expect(
			validateDraftDependency({ dependencies: { "exifcleaner-node": exact } }),
		).toEqual([]);

		for (const spec of [
			"https://github.com/szTheory/exifcleaner-node.git#main",
			"https://github.com/szTheory/exifcleaner-node.git#05f64cf",
			"https://github.com/szTheory/exifcleaner-node.git#0000000000000000000000000000000000000000",
			"^0.1.0",
		]) {
			expect(
				validateDraftDependency({
					dependencies: { "exifcleaner-node": spec },
				})[0],
			).toMatch(/draft dependency/i);
		}
	});

	test("classifies non-registry dependency sources structurally", () => {
		expect(classifyDependencySpec("file:../node").kind).toBe("file");
		expect(classifyDependencySpec("link:../node").kind).toBe("link");
		expect(classifyDependencySpec("workspace:*").kind).toBe("workspace");
		expect(classifyDependencySpec("^0.1.0").kind).toBe("range");
		expect(classifyDependencySpec("0.1.0")).toMatchObject({
			kind: "registry",
			exact: true,
		});
	});

	test("seal rejects every draft or inexact source and absent evidence", () => {
		const manifest = {
			dependencies: {
				"exifcleaner-node": `git+https://example.test/node.git#${ALLOWED_DRAFT_SHA}`,
			},
		};
		expect(
			validateSealDependency({ manifest, lockText: "", evidence: {} }),
		).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/registry/i),
				expect.stringMatching(/evidence/i),
			]),
		);
	});

	test("rejects runtime dependencies, lifecycle scripts, and native payloads", () => {
		expect(
			validatePackageMetadata(
				{
					dependencies: { undici: "1.0.0" },
					scripts: { postinstall: "curl https://example.test" },
				},
				["dist/engine.js", "prebuilds/native.node", "bin/helper.exe"],
			),
		).toEqual([
			"runtime dependencies are forbidden",
			"lifecycle install script is forbidden: postinstall",
			"native or executable payload is forbidden: prebuilds/native.node",
			"native or executable payload is forbidden: bin/helper.exe",
		]);
	});
});

describe("installed runtime audit", () => {
	test("accepts only the audited builtin allowlist and records deterministic evidence", () => {
		const subject = fixture({
			"dist/index.js": safeRuntime,
			"dist/local.js": "export {};",
		});
		try {
			const result = auditInstalledRuntime(subject.root);
			expect(result.problems).toEqual([]);
			expect(result.evidence.runtimePaths).toEqual([
				"dist/index.js",
				"dist/local.js",
			]);
			expect(result.evidence.allowlistedImports).toEqual([
				"node:fs",
				"node:fs/promises",
				"node:path",
			]);
			expect(result.evidence.digests).toHaveLength(2);
			expect(result.evidence.zeroForbiddenNetwork).toBe(true);
		} finally {
			subject.cleanup();
		}
	});

	test.each([
		["forbidden import", `import "node:net";`, "forbidden import: node:net"],
		["bare module", `import "left-pad";`, "unexpected bare import: left-pad"],
		["dynamic import", `import("https");`, "forbidden dynamic import: https"],
		[
			"aliased require",
			`const load = require; load("net");`,
			"forbidden require: net",
		],
		["fetch", `fetch("https://example.test");`, "forbidden network API: fetch"],
		[
			"member fetch",
			`globalThis.fetch("https://example.test");`,
			"forbidden network API: fetch",
		],
		[
			"websocket",
			`new WebSocket("wss://example.test");`,
			"forbidden network API: WebSocket",
		],
		[
			"xml request",
			`new XMLHttpRequest();`,
			"forbidden network API: XMLHttpRequest",
		],
		[
			"event source",
			`new EventSource("https://example.test");`,
			"forbidden network API: EventSource",
		],
		[
			"beacon",
			`navigator.sendBeacon("https://example.test");`,
			"forbidden network API: navigator.sendBeacon",
		],
		[
			"transport literal",
			`const endpoint = "ws://example.test";`,
			"forbidden network URL literal: ws:",
		],
		[
			"inspection surface",
			`export { inspectFile } from "./local.js";`,
			"undeclared package surface: inspectFile",
		],
	])("rejects %s", (_name, source, diagnostic) => {
		const subject = fixture({
			"dist/index.js": source,
			"dist/local.js": "export const inspectFile = () => {};",
		});
		try {
			expect(auditInstalledRuntime(subject.root).problems).toContain(
				diagnostic,
			);
		} finally {
			subject.cleanup();
		}
	});

	test("fails closed for invalid JavaScript and symlink escapes", () => {
		const subject = fixture({ "dist/index.js": "export const = ;" });
		const outside = `${subject.root}-outside.js`;
		try {
			expect(auditInstalledRuntime(subject.root).problems[0]).toMatch(/parse/i);
			writeFileSync(outside, "export {};", "utf8");
			symlinkSync(outside, path.join(subject.root, "dist/escape.js"));
			expect(auditInstalledRuntime(subject.root).problems).toContain(
				"runtime path escapes package root: dist/escape.js",
			);
		} finally {
			subject.cleanup();
			rmSync(outside, { force: true });
		}
	});
});

describe("repository draft state", () => {
	test("pins the manifest and lock to the one permitted immutable SHA", () => {
		const root = path.resolve(import.meta.dirname, "../..");
		const manifest = JSON.parse(
			readFileSync(path.join(root, "package.json"), "utf8"),
		);
		const lockText = readFileSync(path.join(root, "yarn.lock"), "utf8");
		expect(validateDraftDependency(manifest)).toEqual([]);
		expect(lockText).toContain(ALLOWED_DRAFT_SHA);
	});
});
