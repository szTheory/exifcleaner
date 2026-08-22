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
	SEALED_VERSION,
	auditInstalledRuntime,
	classifyDependencySpec,
	validateCiWorkflowPolicy,
	validateDraftDependency,
	validatePackageMetadata,
	validateRegistryEvidence,
	validateSealDependency,
} from "../../scripts/exifcleaner_node_dependency_gate.mjs";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

const safeRuntime = `import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import "./local.js";
void fs; void readFile; void path;`;

function validEvidence() {
	return {
		schemaVersion: 1,
		package: {
			name: "exifcleaner-node",
			version: SEALED_VERSION,
			publishedAt: "2026-08-22T20:21:25.035Z",
			repository: "https://github.com/szTheory/exifcleaner-node",
			sourceCommit: "411fdbdad3faa2e5dd5033bea5def435b4d03323",
			releaseTag: `v${SEALED_VERSION}`,
		},
		dist: {
			tarball: `https://registry.npmjs.org/exifcleaner-node/-/exifcleaner-node-${SEALED_VERSION}.tgz`,
			integrity:
				"sha512-9SkTOLaJBphb/YBo3JkwJ9ShunLbKzUIsgCTxG5k9UnN1SWb3tFD0IjUr4Yo3P7tEyWH4rnrUUkdo8fPVvDT6g==",
			shasum: "a1280ed9afb1d5863c58b6559e01549df64a1cdd",
			sha256:
				"c2fc569b553cba360814bcce61d6882a02aba062e6d6da2193323915530a34bf",
			fileCount: 2,
		},
		provenance: {
			verified: true,
			predicateType: "https://slsa.dev/provenance/v1",
			workflow: "release.yml",
			environment: "npm",
			workflowRun:
				"https://github.com/szTheory/exifcleaner-node/actions/runs/32596327463/attempts/2",
		},
		signatures: { verified: true },
		tarball: {
			verified: true,
			files: ["dist/index.js", "package.json"],
		},
		packageManifest: {
			runtimeDependencies: {},
			lifecycleScripts: {},
			engines: { node: ">=22" },
			runtimeExports: [
				"err",
				"getCapabilities",
				"inspectFile",
				"ok",
				"sanitizeFile",
			],
		},
		checks: {
			publicMetadata: true,
			provenance: true,
			signatures: true,
			tarballContent: true,
		},
	};
}

function fixture(files: Record<string, string>): {
	container: string;
	root: string;
	cleanup(): void;
} {
	const container = mkdtempSync(path.join(tmpdir(), "native-dependency-gate-"));
	const before = snapshotDir(container);
	const root = path.join(container, "package");
	mkdirSync(root);
	const added = new Set(["package"]);
	for (const [relative, contents] of Object.entries(files)) {
		const target = path.join(root, relative);
		mkdirSync(path.dirname(target), { recursive: true });
		writeFileSync(target, contents, "utf8");
		const parts = relative.split("/");
		for (let index = 1; index < parts.length; index += 1) {
			added.add(`package/${parts.slice(0, index).join("/")}`);
		}
		added.add(`package/${relative}`);
	}
	assertDirEffect(before, snapshotDir(container), { added: [...added] });
	return {
		container,
		root,
		cleanup: () => rmSync(container, { recursive: true, force: true }),
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

	test("seal accepts only the exact registry version and matching evidence", () => {
		const evidence = validEvidence();
		const lockText = `exifcleaner-node@${SEALED_VERSION}:\n  version "${SEALED_VERSION}"\n  integrity ${evidence.dist.integrity}\n`;
		expect(
			validateSealDependency({
				manifest: {
					dependencies: { "exifcleaner-node": SEALED_VERSION },
				},
				lockText,
				evidence,
			}),
		).toEqual([]);

		evidence.package.sourceCommit = "main";
		expect(validateRegistryEvidence(evidence, SEALED_VERSION)).toContain(
			"seal evidence mismatch: sourceCommit",
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
			"dist/index.js": `${safeRuntime}\nexport { inspectFile } from "./local.js";`,
			"dist/local.js": "export const inspectFile = () => {};",
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
		try {
			expect(auditInstalledRuntime(subject.root).problems[0]).toMatch(/parse/i);
			const before = snapshotDir(subject.container);
			const outside = path.join(subject.container, "outside.js");
			writeFileSync(outside, "export {};", "utf8");
			symlinkSync(outside, path.join(subject.root, "dist/escape.js"));
			assertDirEffect(before, snapshotDir(subject.container), {
				added: ["outside.js", "package/dist/escape.js"],
			});
			expect(auditInstalledRuntime(subject.root).problems).toContain(
				"runtime path escapes package root: dist/escape.js",
			);
		} finally {
			subject.cleanup();
		}
	});
});

describe("repository sealed state", () => {
	test("pins the manifest, lock, and evidence to the audited registry version", () => {
		const root = path.resolve(import.meta.dirname, "../..");
		const manifest = JSON.parse(
			readFileSync(path.join(root, "package.json"), "utf8"),
		);
		const lockText = readFileSync(path.join(root, "yarn.lock"), "utf8");
		const evidence = JSON.parse(
			readFileSync(
				path.join(root, "docs/evidence/native-webp-registry-package.json"),
				"utf8",
			),
		);
		expect(validateSealDependency({ manifest, lockText, evidence })).toEqual(
			[],
		);
		expect(lockText).not.toContain(ALLOWED_DRAFT_SHA);
	});
});

describe("required CI linkage", () => {
	const root = path.resolve(import.meta.dirname, "../..");
	const source = readFileSync(
		path.join(root, ".github/workflows/ci.yml"),
		"utf8",
	);

	test("seals immediately after frozen install before every platform build", () => {
		expect(validateCiWorkflowPolicy(source)).toEqual([]);
	});

	test.each([
		[
			"missing seal",
			source.replace(
				"run: yarn verify:native-dependency:seal",
				"run: yarn verify:native-dependency",
			),
			/literal native dependency seal/i,
		],
		[
			"seal before install",
			source
				.replace("run: yarn install --frozen-lockfile", "run: __INSTALL__")
				.replace(
					"run: yarn verify:native-dependency:seal",
					"run: yarn install --frozen-lockfile",
				)
				.replace("run: __INSTALL__", "run: yarn verify:native-dependency:seal"),
			/after frozen install/i,
		],
		[
			"intervening step",
			source.replace(
				"\n      - name: Seal native dependency",
				"\n      - name: Unrelated step\n        run: yarn typecheck\n\n      - name: Seal native dependency",
			),
			/immediately follow install/i,
		],
		[
			"seal outside test job",
			`${source.replace(
				"run: yarn verify:native-dependency:seal",
				"run: yarn typecheck",
			)}\n  detached-seal:\n    runs-on: ubuntu-latest\n    steps:\n      - run: yarn verify:native-dependency:seal\n`,
			/test job must run/i,
		],
		[
			"missing pull request trigger",
			source.replace("  pull_request:\n", ""),
			/pull requests/i,
		],
		[
			"missing master trigger",
			source.replace("    branches: [master]", "    branches: [next]"),
			/master pushes/i,
		],
		[
			"build bypasses test",
			source.replace("    needs: test", "    needs: []"),
			/build-macos must depend/i,
		],
	])("rejects %s", (_name, hostile, diagnostic) => {
		expect(validateCiWorkflowPolicy(hostile)).toEqual(
			expect.arrayContaining([expect.stringMatching(diagnostic)]),
		);
	});
});
