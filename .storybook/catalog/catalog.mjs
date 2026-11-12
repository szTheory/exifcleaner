// One CLI for the generated catalog files (Phase 71, D-03).
//
//   node .storybook/catalog/catalog.mjs --check   fail on drift or invalid data
//   node .storybook/catalog/catalog.mjs --write   regenerate generated files
//
// JSON is the authored source and is never rewritten; only generated Markdown
// is. Every data path resolves from the current working directory, so a test
// can point the real script at a temporary copy of CHECK_INPUTS.
import fs from "node:fs";
import path from "node:path";
import { isMainModule } from "../../scripts/is_main_module.mjs";
import { readJson } from "./closed.mjs";
import {
	GLOSSARY_MD_PATH,
	GLOSSARY_PATH,
	loadGlossaryContext,
	renderGlossary,
	validateGlossary,
} from "./glossary.mjs";

// Repo-relative inputs `--check` reads. Tests copy exactly these into a temp
// repository, so a passing run there also proves no other data is read.
export const CHECK_INPUTS = Object.freeze([
	".storybook/catalog",
	".storybook/main.ts",
	".resources/locales/en.json",
	".resources/translation-glossary.json",
	"brand.pin.json",
	"src",
	"tests/e2e",
]);

const FLAGS = new Set(["--check", "--write"]);

/**
 * @param {string[]} argv
 * @returns {{ flags: Set<string> }}
 */
export function parseArguments(argv) {
	const flags = new Set();
	for (const arg of argv) {
		if (!FLAGS.has(arg)) {
			throw new Error(`unknown argument ${arg}`);
		}
		flags.add(arg);
	}
	return { flags };
}

function glossaryProblems(root) {
	const doc = readJson(root, GLOSSARY_PATH);
	return { doc, problems: validateGlossary(doc, loadGlossaryContext(root)) };
}

/**
 * Every generated file as `[relPath, expectedText]`.
 *
 * @param {string} root
 * @returns {Array<[string, string]>}
 */
export function generatedFiles(root) {
	const { doc, problems } = glossaryProblems(root);
	if (problems.length > 0) {
		const first = problems[0];
		throw new Error(`${first?.code}: ${first?.message}`);
	}
	return [[GLOSSARY_MD_PATH, renderGlossary(/** @type {any} */ (doc))]];
}

/**
 * @param {{ root: string }} options
 * @returns {{ ok: boolean, problems: Array<{ code: string, message: string }>, files: number }}
 */
export function checkCatalog({ root }) {
	const { doc, problems } = glossaryProblems(root);
	if (problems.length > 0) {
		return { ok: false, problems, files: 0 };
	}
	const stale = [];
	const files = [[GLOSSARY_MD_PATH, renderGlossary(/** @type {any} */ (doc))]];
	for (const [relPath, expected] of files) {
		let actual = "";
		try {
			actual = fs.readFileSync(path.join(root, relPath), "utf8");
		} catch {
			actual = "";
		}
		if (actual !== expected) {
			stale.push({
				code: "stale",
				message: `${relPath} is stale; run yarn catalog:write`,
			});
		}
	}
	return { ok: stale.length === 0, problems: stale, files: files.length };
}

/**
 * @param {string} root
 * @returns {number} files written
 */
export function writeCatalog(root) {
	const files = generatedFiles(root);
	for (const [relPath, expected] of files) {
		const absolute = path.join(root, relPath);
		let actual = null;
		try {
			actual = fs.readFileSync(absolute, "utf8");
		} catch {
			actual = null;
		}
		if (actual !== expected) {
			fs.writeFileSync(absolute, expected);
		}
	}
	return files.length;
}

function describe(problems) {
	return problems.map((found) => `${found.code}: ${found.message}`).join("; ");
}

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv = process.argv.slice(2)) {
	try {
		const { flags } = parseArguments(argv);
		const writing = flags.has("--write");
		if (writing === flags.has("--check")) {
			throw new Error("pass exactly one of --check or --write");
		}
		const root = process.cwd();
		if (writing) {
			const count = writeCatalog(root);
			console.log(`✓ CATALOG WRITE — ${count} files`);
			return 0;
		}
		const result = checkCatalog({ root });
		if (!result.ok) {
			console.error(`✗ CATALOG CHECK FAILED: ${describe(result.problems)}`);
			return 1;
		}
		console.log(
			`✓ CATALOG CHECK PASSED — ${result.files} generated files current`,
		);
		return 0;
	} catch (error) {
		console.error(
			`✗ CATALOG CHECK FAILED: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (isMainModule(import.meta.url)) {
	process.exitCode = main();
}
