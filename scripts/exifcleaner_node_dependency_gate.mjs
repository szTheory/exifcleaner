import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ALLOWED_DRAFT_SHA = "9b0d7f34f3dbfa633b46cc5427481ae7212b0a88";
export const SEALED_VERSION = "0.1.1";
const PACKAGE_NAME = "exifcleaner-node";
const EVIDENCE_PATH = "docs/evidence/native-webp-registry-package.json";
const REPOSITORY_URL = "https://github.com/szTheory/exifcleaner-node";
const REGISTRY_TARBALL_BASE =
	"https://registry.npmjs.org/exifcleaner-node/-/exifcleaner-node";
const EXPECTED_RUNTIME_EXPORTS = [
	"err",
	"getCapabilities",
	"inspectFile",
	"ok",
	"sanitizeFile",
];
const ALLOWED_IMPORTS = new Set(["node:fs", "node:fs/promises", "node:path"]);
const FORBIDDEN_MODULES = new Set([
	"net",
	"node:net",
	"http",
	"node:http",
	"https",
	"node:https",
	"http2",
	"node:http2",
	"tls",
	"node:tls",
	"dgram",
	"node:dgram",
	"dns",
	"node:dns",
	"undici",
]);
const RUNTIME_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const NETWORK_APIS = new Set([
	"fetch",
	"WebSocket",
	"XMLHttpRequest",
	"EventSource",
]);

export function classifyDependencySpec(spec) {
	if (typeof spec !== "string") return { kind: "missing", exact: false };
	if (spec.startsWith("file:")) return { kind: "file", exact: false };
	if (spec.startsWith("link:")) return { kind: "link", exact: false };
	if (spec.startsWith("workspace:")) return { kind: "workspace", exact: false };
	if (spec.includes("://") || spec.startsWith("git+")) {
		const fragment = spec.split("#")[1];
		return {
			kind: "git",
			exact: /^[a-f0-9]{40}$/i.test(fragment ?? ""),
			fragment,
		};
	}
	const exact = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(spec);
	return { kind: exact ? "registry" : "range", exact, version: spec };
}

function dependencyFrom(manifest) {
	return manifest?.dependencies?.[PACKAGE_NAME];
}

export function validateDraftDependency(manifest) {
	const spec = dependencyFrom(manifest);
	const classified = classifyDependencySpec(spec);
	if (classified.kind === "git" && classified.fragment === ALLOWED_DRAFT_SHA)
		return [];
	return [
		`draft dependency must be the full audited Git SHA ${ALLOWED_DRAFT_SHA}`,
	];
}

export function validateSealDependency({ manifest, lockText, evidence }) {
	const problems = [];
	const spec = dependencyFrom(manifest);
	const classified = classifyDependencySpec(spec);
	if (classified.kind !== "registry" || !classified.exact) {
		problems.push("seal requires an exact registry semver dependency");
	}
	if (spec !== SEALED_VERSION) {
		problems.push(`seal requires audited registry version ${SEALED_VERSION}`);
	}
	if (!lockResolvesExactVersion(lockText, spec)) {
		problems.push("seal requires a matching exact lock resolution");
	}
	problems.push(...validateRegistryEvidence(evidence, spec));
	if (
		typeof evidence?.dist?.integrity === "string" &&
		!lockText.includes(`integrity ${evidence.dist.integrity}`)
	)
		problems.push("lock integrity does not match registry evidence");
	return problems;
}

export function validateRegistryEvidence(evidence, version) {
	const problems = [];
	const expectValue = (actual, expected, field) => {
		if (actual !== expected) problems.push(`seal evidence mismatch: ${field}`);
	};
	expectValue(evidence?.schemaVersion, 1, "schemaVersion");
	expectValue(evidence?.package?.name, PACKAGE_NAME, "package.name");
	expectValue(evidence?.package?.version, version, "package.version");
	expectValue(evidence?.package?.repository, REPOSITORY_URL, "repository");
	expectValue(evidence?.package?.releaseTag, `v${version}`, "releaseTag");
	if (!/^[a-f0-9]{40}$/u.test(evidence?.package?.sourceCommit ?? ""))
		problems.push("seal evidence mismatch: sourceCommit");
	if (Number.isNaN(Date.parse(evidence?.package?.publishedAt ?? "")))
		problems.push("seal evidence mismatch: publishedAt");
	if (evidence?.dist?.tarball !== `${REGISTRY_TARBALL_BASE}-${version}.tgz`)
		problems.push("seal evidence mismatch: dist.tarball");
	if (!/^sha512-[A-Za-z0-9+/]+=*$/u.test(evidence?.dist?.integrity ?? ""))
		problems.push("seal evidence mismatch: dist.integrity");
	if (!/^[a-f0-9]{40}$/u.test(evidence?.dist?.shasum ?? ""))
		problems.push("seal evidence mismatch: dist.shasum");
	if (!/^[a-f0-9]{64}$/u.test(evidence?.dist?.sha256 ?? ""))
		problems.push("seal evidence mismatch: dist.sha256");
	expectValue(evidence?.provenance?.verified, true, "provenance.verified");
	expectValue(
		evidence?.provenance?.predicateType,
		"https://slsa.dev/provenance/v1",
		"provenance.predicateType",
	);
	expectValue(
		evidence?.provenance?.workflow,
		"release.yml",
		"provenance.workflow",
	);
	expectValue(
		evidence?.provenance?.environment,
		"npm",
		"provenance.environment",
	);
	if (
		!/^https:\/\/github\.com\/szTheory\/exifcleaner-node\/actions\/runs\/\d+\/attempts\/\d+$/u.test(
			evidence?.provenance?.workflowRun ?? "",
		)
	)
		problems.push("seal evidence mismatch: provenance.workflowRun");
	expectValue(evidence?.signatures?.verified, true, "signatures.verified");
	expectValue(evidence?.tarball?.verified, true, "tarball.verified");
	const files = evidence?.tarball?.files;
	if (
		!Array.isArray(files) ||
		files.length === 0 ||
		files.some((entry) => typeof entry !== "string") ||
		JSON.stringify(files) !== JSON.stringify([...(files ?? [])].sort())
	)
		problems.push("seal evidence mismatch: tarball.files");
	expectValue(evidence?.dist?.fileCount, files?.length, "dist.fileCount");
	if (
		Object.keys(evidence?.packageManifest?.runtimeDependencies ?? {}).length > 0
	)
		problems.push("seal evidence mismatch: runtimeDependencies");
	if (Object.keys(evidence?.packageManifest?.lifecycleScripts ?? {}).length > 0)
		problems.push("seal evidence mismatch: lifecycleScripts");
	expectValue(evidence?.packageManifest?.engines?.node, ">=22", "engines.node");
	if (
		JSON.stringify(evidence?.packageManifest?.runtimeExports) !==
		JSON.stringify(EXPECTED_RUNTIME_EXPORTS)
	)
		problems.push("seal evidence mismatch: runtimeExports");
	for (const field of [
		"publicMetadata",
		"provenance",
		"signatures",
		"tarballContent",
	])
		if (evidence?.checks?.[field] !== true)
			problems.push(`seal evidence missing: ${field}`);
	return problems;
}

function lockResolvesExactVersion(lockText, version) {
	if (typeof lockText !== "string" || typeof version !== "string") return false;
	const blocks = lockText.split(/\n(?=\S)/);
	return blocks.some((block) => {
		const lines = block.split("\n");
		const header = lines[0] ?? "";
		const fields = new Map(
			lines.slice(1).flatMap((line) => {
				const match = /^  ([A-Za-z][A-Za-z-]*) "?([^"\n]+)"?$/.exec(line);
				return match === null ? [] : [[match[1], match[2]]];
			}),
		);
		return (
			header.includes(`${PACKAGE_NAME}@`) && fields.get("version") === version
		);
	});
}

function relativeRuntimePath(root, candidate) {
	const relative = path.relative(root, candidate).split(path.sep).join("/");
	return relative === "" ||
		relative.startsWith("../") ||
		path.isAbsolute(relative)
		? undefined
		: relative;
}

function walkRuntime(root, current, output, problems) {
	let entries;
	try {
		entries = fs.readdirSync(current, { withFileTypes: true });
	} catch {
		problems.push(
			`unreadable runtime directory: ${relativeRuntimePath(root, current) ?? current}`,
		);
		return;
	}
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		const absolute = path.join(current, entry.name);
		if (entry.isDirectory()) {
			walkRuntime(root, absolute, output, problems);
			continue;
		}
		if (!RUNTIME_EXTENSIONS.has(path.extname(entry.name))) continue;
		let resolved;
		try {
			resolved = fs.realpathSync(absolute);
		} catch {
			problems.push(
				`unreadable runtime file: ${relativeRuntimePath(root, absolute) ?? absolute}`,
			);
			continue;
		}
		const relative = relativeRuntimePath(root, resolved);
		const displayed = relativeRuntimePath(root, absolute) ?? absolute;
		if (relative === undefined) {
			problems.push(`runtime path escapes package root: ${displayed}`);
			continue;
		}
		output.push({ absolute: resolved, relative });
	}
}

function moduleSpecifier(node) {
	if (node === undefined) return undefined;
	return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
		? node.text
		: undefined;
}

function diagnosticForModule(specifier, operation) {
	if (specifier.startsWith(".")) return undefined;
	if (ALLOWED_IMPORTS.has(specifier)) return undefined;
	if (FORBIDDEN_MODULES.has(specifier))
		return `forbidden ${operation}: ${specifier}`;
	return `unexpected bare ${operation}: ${specifier}`;
}

function scanRuntimeSource(relative, source) {
	const problems = [];
	const sourceFile = ts.createSourceFile(
		relative,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);
	if (sourceFile.parseDiagnostics.length > 0) {
		return [`parse uncertainty: ${relative}`];
	}
	const requireAliases = new Set();
	const visit = (node) => {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			const specifier =
				node.moduleSpecifier === undefined
					? undefined
					: moduleSpecifier(node.moduleSpecifier);
			if (specifier !== undefined) {
				const problem = diagnosticForModule(specifier, "import");
				if (problem !== undefined) problems.push(problem);
			}
		}
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer !== undefined &&
			ts.isIdentifier(node.initializer) &&
			node.initializer.text === "require"
		) {
			requireAliases.add(node.name.text);
		}
		if (ts.isCallExpression(node)) {
			const argument = moduleSpecifier(node.arguments[0]);
			if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
				if (argument === undefined)
					problems.push("unresolvable dynamic import");
				else {
					const problem = diagnosticForModule(argument, "dynamic import");
					if (problem !== undefined) problems.push(problem);
				}
			}
			if (
				ts.isIdentifier(node.expression) &&
				(node.expression.text === "require" ||
					requireAliases.has(node.expression.text))
			) {
				if (argument === undefined) problems.push("unresolvable require");
				else {
					const problem = diagnosticForModule(argument, "require");
					if (problem !== undefined) problems.push(problem);
				}
			}
			if (
				ts.isIdentifier(node.expression) &&
				NETWORK_APIS.has(node.expression.text)
			)
				problems.push(`forbidden network API: ${node.expression.text}`);
			if (ts.isPropertyAccessExpression(node.expression)) {
				const name = node.expression.name.text;
				if (NETWORK_APIS.has(name))
					problems.push(`forbidden network API: ${name}`);
				if (
					name === "sendBeacon" &&
					ts.isIdentifier(node.expression.expression) &&
					node.expression.expression.text === "navigator"
				)
					problems.push("forbidden network API: navigator.sendBeacon");
			}
		}
		if (ts.isNewExpression(node)) {
			const name = ts.isIdentifier(node.expression)
				? node.expression.text
				: undefined;
			if (name !== undefined && NETWORK_APIS.has(name))
				problems.push(`forbidden network API: ${name}`);
		}
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
			const match = /^(https?|wss?):/i.exec(node.text);
			if (match !== null)
				problems.push(
					`forbidden network URL literal: ${match[1].toLowerCase()}:`,
				);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return [...new Set(problems)].sort();
}

export function auditInstalledRuntime(packageRoot) {
	const problems = [];
	let root;
	try {
		root = fs.realpathSync(packageRoot);
	} catch {
		return { problems: ["unreadable package root"], evidence: emptyEvidence() };
	}
	const files = [];
	let runtimeRoots = [root];
	try {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(root, "package.json"), "utf8"),
		);
		if (Array.isArray(manifest.files)) {
			runtimeRoots = manifest.files
				.filter((entry) => typeof entry === "string")
				.map((entry) => path.join(root, entry));
		}
	} catch {
		// Fixtures without a manifest intentionally scan their supplied root.
	}
	for (const runtimeRoot of runtimeRoots) {
		try {
			const stat = fs.statSync(runtimeRoot);
			if (stat.isDirectory()) walkRuntime(root, runtimeRoot, files, problems);
			else if (RUNTIME_EXTENSIONS.has(path.extname(runtimeRoot))) {
				const resolved = fs.realpathSync(runtimeRoot);
				const relative = relativeRuntimePath(root, resolved);
				if (relative === undefined)
					problems.push(`runtime path escapes package root: ${runtimeRoot}`);
				else files.push({ absolute: resolved, relative });
			}
		} catch {
			problems.push(
				`unreadable runtime path: ${relativeRuntimePath(root, runtimeRoot) ?? runtimeRoot}`,
			);
		}
	}
	const digests = [];
	const allowlistedImports = new Set();
	for (const file of files.sort((a, b) =>
		a.relative.localeCompare(b.relative),
	)) {
		let source;
		try {
			source = fs.readFileSync(file.absolute, "utf8");
		} catch {
			problems.push(`unreadable runtime file: ${file.relative}`);
			continue;
		}
		digests.push({
			path: file.relative,
			sha256: crypto.createHash("sha256").update(source).digest("hex"),
		});
		for (const allowed of ALLOWED_IMPORTS)
			if (source.includes(`"${allowed}"`) || source.includes(`'${allowed}'`))
				allowlistedImports.add(allowed);
		problems.push(...scanRuntimeSource(file.relative, source));
	}
	const sortedProblems = [...new Set(problems)].sort();
	return {
		problems: sortedProblems,
		evidence: {
			runtimePaths: files.map((file) => file.relative).sort(),
			digests,
			allowlistedImports: [...allowlistedImports].sort(),
			zeroForbiddenNetwork: sortedProblems.length === 0,
		},
	};
}

function emptyEvidence() {
	return {
		runtimePaths: [],
		digests: [],
		allowlistedImports: [],
		zeroForbiddenNetwork: false,
	};
}

export function validatePackageMetadata(packageJson, packedPaths = []) {
	const problems = [];
	if (Object.keys(packageJson.dependencies ?? {}).length > 0)
		problems.push("runtime dependencies are forbidden");
	for (const key of ["preinstall", "install", "postinstall"])
		if (packageJson.scripts?.[key] !== undefined)
			problems.push(`lifecycle install script is forbidden: ${key}`);
	for (const packedPath of packedPaths) {
		if (/\.(node|exe|dll|dylib|so)$/i.test(packedPath)) {
			problems.push(`native or executable payload is forbidden: ${packedPath}`);
		}
	}
	return problems;
}

function workflowJob(source, name) {
	const header = new RegExp(`^  ${name}:\\s*$`, "mu").exec(source);
	if (header === null) return undefined;
	const rest = source.slice(header.index + header[0].length);
	const next = /^  [A-Za-z0-9_-]+:\s*$/mu.exec(rest);
	return source.slice(
		header.index,
		next === null
			? source.length
			: header.index + header[0].length + next.index,
	);
}

export function validateCiWorkflowPolicy(source) {
	const problems = [];
	if (!/^\s*push:\s*\n\s+branches:\s*\[master\]\s*$/mu.test(source))
		problems.push("CI must run for master pushes");
	if (!/^\s*pull_request:\s*$/mu.test(source))
		problems.push("CI must run for pull requests");
	const testJob = workflowJob(source, "test");
	if (testJob === undefined) {
		problems.push("CI test job is missing");
		return problems;
	}
	const installCommand = "run: yarn install --frozen-lockfile";
	const sealCommand = "run: yarn verify:native-dependency:seal";
	const installIndex = testJob.indexOf(installCommand);
	const sealIndex = testJob.indexOf(sealCommand);
	if (installIndex < 0)
		problems.push("CI test job must use a frozen Yarn install");
	if (sealIndex < 0)
		problems.push("CI test job must run the literal native dependency seal");
	if (installIndex >= 0 && sealIndex >= 0) {
		if (sealIndex < installIndex)
			problems.push("native dependency seal must run after frozen install");
		else {
			const between = testJob.slice(
				installIndex + installCommand.length,
				sealIndex,
			);
			if (/\n\s+-\s+(?:uses:|name:)[\s\S]*?\n\s+run:/u.test(between))
				problems.push("native dependency seal must immediately follow install");
		}
	}
	const sealCount = source.split(sealCommand).length - 1;
	if (sealCount !== 1)
		problems.push("CI must contain exactly one native dependency seal command");
	for (const job of ["build-macos", "build-windows", "build-linux"]) {
		const body = workflowJob(source, job);
		if (body === undefined) problems.push(`CI job is missing: ${job}`);
		else if (!/^\s*needs:\s*test\s*$/mu.test(body))
			problems.push(`${job} must depend on the sealed test job`);
	}
	return problems;
}

function installedRuntimeExports(packageRoot) {
	const entry = fs.readFileSync(
		path.join(packageRoot, "dist/index.js"),
		"utf8",
	);
	const sourceFile = ts.createSourceFile(
		"dist/index.js",
		entry,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);
	const names = [];
	for (const statement of sourceFile.statements) {
		if (
			ts.isExportDeclaration(statement) &&
			statement.exportClause !== undefined &&
			ts.isNamedExports(statement.exportClause)
		)
			for (const element of statement.exportClause.elements)
				names.push(element.name.text);
	}
	return [...new Set(names)].sort();
}

function installedPackageRoot() {
	const entry = fileURLToPath(import.meta.resolve(PACKAGE_NAME));
	let current = path.dirname(entry);
	while (current !== path.dirname(current)) {
		if (fs.existsSync(path.join(current, "package.json"))) return current;
		current = path.dirname(current);
	}
	throw new Error("installed package root not found");
}

function runCli() {
	const seal = process.argv.includes("--seal");
	const root = process.cwd();
	const manifest = JSON.parse(
		fs.readFileSync(path.join(root, "package.json"), "utf8"),
	);
	const lockText = fs.readFileSync(path.join(root, "yarn.lock"), "utf8");
	let evidence = {};
	const evidenceProblems = [];
	if (seal) {
		try {
			evidence = JSON.parse(
				fs.readFileSync(path.join(root, EVIDENCE_PATH), "utf8"),
			);
		} catch {
			evidenceProblems.push(`unreadable seal evidence: ${EVIDENCE_PATH}`);
		}
	}
	const sourceProblems = seal
		? validateSealDependency({ manifest, lockText, evidence })
		: validateDraftDependency(manifest);
	let runtimeProblems = [];
	if (seal) {
		const packageRoot = installedPackageRoot();
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
		);
		const runtimeAudit = auditInstalledRuntime(packageRoot);
		console.error(
			`seal runtime evidence: ${JSON.stringify(runtimeAudit.evidence)}`,
		);
		runtimeProblems = [
			...validatePackageMetadata(packageJson, evidence?.tarball?.files),
			...runtimeAudit.problems,
		];
		if (
			packageJson.name !== PACKAGE_NAME ||
			packageJson.version !== SEALED_VERSION
		)
			runtimeProblems.push("installed package identity does not match seal");
		if (
			packageJson.repository?.url !==
			"git+https://github.com/szTheory/exifcleaner-node.git"
		)
			runtimeProblems.push("installed package repository does not match seal");
		if (
			JSON.stringify(installedRuntimeExports(packageRoot)) !==
			JSON.stringify(EXPECTED_RUNTIME_EXPORTS)
		)
			runtimeProblems.push("installed runtime exports do not match seal");
		if (
			JSON.stringify(runtimeAudit.evidence) !==
			JSON.stringify(evidence?.runtimeAudit)
		)
			runtimeProblems.push(
				"installed runtime audit does not match seal evidence",
			);
	}
	const problems = [...evidenceProblems, ...sourceProblems, ...runtimeProblems];
	if (!seal && problems.length === 0) {
		console.log(
			`DRAFT ONLY: immutable Git SHA ${ALLOWED_DRAFT_SHA} accepted; seal verdict is intentionally non-ready.`,
		);
		return;
	}
	if (seal && problems.length === 0) {
		console.log(
			`NATIVE DEPENDENCY SEAL PASSED: ${PACKAGE_NAME}@${SEALED_VERSION}`,
		);
		return;
	}
	console.error(`NATIVE DEPENDENCY ${seal ? "SEAL" : "DRAFT"} GATE FAILED:`);
	for (const problem of problems) console.error(`- ${problem}`);
	process.exitCode = 1;
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) ===
		path.resolve(new URL(import.meta.url).pathname)
)
	runCli();
