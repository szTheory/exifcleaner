import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ALLOWED_DRAFT_SHA = "05f64cf6718ab2532ddac73429c7736ab31d95f3";
const PACKAGE_NAME = "exifcleaner-node";
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
	if (!lockResolvesExactVersion(lockText, spec)) {
		problems.push("seal requires a matching exact lock resolution");
	}
	for (const field of [
		"publicMetadata",
		"provenance",
		"signatures",
		"tarballContent",
	]) {
		if (evidence?.[field] !== true)
			problems.push(`seal evidence missing: ${field}`);
	}
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
			if (
				ts.isExportDeclaration(node) &&
				node.exportClause !== undefined &&
				ts.isNamedExports(node.exportClause)
			) {
				for (const element of node.exportClause.elements) {
					if (element.name.text === "inspectFile")
						problems.push("undeclared package surface: inspectFile");
				}
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
	const sourceProblems = seal
		? validateSealDependency({ manifest, lockText, evidence: {} })
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
			...validatePackageMetadata(packageJson),
			...runtimeAudit.problems,
		];
	}
	const problems = [...sourceProblems, ...runtimeProblems];
	if (!seal && problems.length === 0) {
		console.log(
			`DRAFT ONLY: immutable Git SHA ${ALLOWED_DRAFT_SHA} accepted; seal verdict is intentionally non-ready.`,
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
