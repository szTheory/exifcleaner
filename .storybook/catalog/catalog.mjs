// One CLI for the generated catalog files (Phase 71, D-03).
//
//   node .storybook/catalog/catalog.mjs --check   fail on drift or invalid data
//   node .storybook/catalog/catalog.mjs --write   regenerate generated files
//
// JSON is the authored source and is never rewritten; only generated Markdown
// is. Every data path resolves from the current working directory, so a test
// can point the real script at a temporary copy of CHECK_INPUTS.
import "./cache_dir.mjs";
import fs from "node:fs";
import path from "node:path";
import { isMainModule } from "../../scripts/is_main_module.mjs";
import { readJson } from "./closed.mjs";
import {
	COPY_FINDINGS_PATH,
	check as checkRegister,
	loadObservation,
} from "./copy_findings_ratchet.mjs";
import {
	GLOSSARY_MD_PATH,
	GLOSSARY_PATH,
	loadGlossaryContext,
	renderGlossary,
	validateGlossary,
} from "./glossary.mjs";
import {
	GRID_JSON_PATH,
	GRID_MD_PATH,
	gapRatchet,
	loadGrid,
	renderGridJson,
	renderGridMarkdown,
} from "./grid.mjs";
import { readMergeBase, resolveBaseRef } from "./merge_base.mjs";
import {
	CATALOG_PATH,
	PERSONAS_MD_PATH,
	loadCatalogContext,
	renderPersonas,
	validateCatalog,
} from "./personas.mjs";

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
 * `--check` and `--write`, plus `--base <ref>` for the merge-base the copy
 * findings register is compared with (default origin/master).
 *
 * @param {string[]} argv
 * @returns {{ flags: Set<string>, base: string | undefined }}
 */
export function parseArguments(argv) {
	const flags = new Set();
	let base;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--base") {
			base = argv[index + 1];
			if (base === undefined || base.startsWith("--")) {
				throw new Error("--base needs a ref");
			}
			index += 1;
		} else if (FLAGS.has(arg)) {
			flags.add(arg);
		} else {
			throw new Error(`unknown argument ${arg}`);
		}
	}
	return { flags, base };
}

function glossaryProblems(root) {
	const doc = readJson(root, GLOSSARY_PATH);
	return { doc, problems: validateGlossary(doc, loadGlossaryContext(root)) };
}

function catalogProblems(root) {
	const doc = readJson(root, CATALOG_PATH);
	return { doc, problems: validateCatalog(doc, loadCatalogContext(root)) };
}

function firstProblem(problems) {
	const first = problems[0];
	return `${first?.code}: ${first?.message}`;
}

/**
 * Every generated file as `[relPath, expectedText]`.
 *
 * @param {string} root
 * @returns {Promise<Array<[string, string]>>}
 */
export async function generatedFiles(root) {
	const { doc, problems } = glossaryProblems(root);
	if (problems.length > 0) {
		const first = problems[0];
		throw new Error(`${first?.code}: ${first?.message}`);
	}
	const catalog = catalogProblems(root);
	if (catalog.problems.length > 0) {
		throw new Error(firstProblem(catalog.problems));
	}
	const grid = await loadGrid(root);
	if (grid.model === null) {
		throw new Error(firstProblem(grid.problems));
	}
	return [
		[GLOSSARY_MD_PATH, renderGlossary(/** @type {any} */ (doc))],
		[PERSONAS_MD_PATH, renderPersonas(/** @type {any} */ (catalog.doc))],
		[GRID_JSON_PATH, renderGridJson(grid.model)],
		[GRID_MD_PATH, renderGridMarkdown(grid.model)],
	];
}

/**
 * The drift layer (generated files), the copy findings register layer and
 * the coverage grid gap ratchet.
 *
 * @param {{ root: string, base?: string | undefined }} options
 * @returns {Promise<{ ok: boolean, problems: Array<{ code: string, message: string }>, files: number, notes: string[] }>}
 */
export async function checkCatalog({ root, base }) {
	const { doc, problems } = glossaryProblems(root);
	if (problems.length > 0) {
		return { ok: false, problems, files: 0, notes: [] };
	}
	const catalog = catalogProblems(root);
	if (catalog.problems.length > 0) {
		return { ok: false, problems: catalog.problems, files: 0, notes: [] };
	}
	const grid = await loadGrid(root);
	if (grid.model === null) {
		return { ok: false, problems: grid.problems, files: 0, notes: [] };
	}
	const stale = [];
	const files = [
		[GLOSSARY_MD_PATH, renderGlossary(/** @type {any} */ (doc))],
		[PERSONAS_MD_PATH, renderPersonas(/** @type {any} */ (catalog.doc))],
		[GRID_JSON_PATH, renderGridJson(grid.model)],
		[GRID_MD_PATH, renderGridMarkdown(grid.model)],
	];
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
	const { mergeBase, base: baseDoc } = readMergeBase(COPY_FINDINGS_PATH, {
		ref: resolveBaseRef(base, process.env),
		cwd: root,
	});
	const head = readJson(root, COPY_FINDINGS_PATH);
	const register = checkRegister({
		head,
		base: baseDoc,
		observation: loadObservation(root),
	});
	const entries = Array.isArray(/** @type {any} */ (head)?.entries)
		? /** @type {any} */ (head).entries.length
		: 0;
	const gridBase = readMergeBase(GRID_JSON_PATH, {
		ref: resolveBaseRef(base, process.env),
		cwd: root,
	});
	const ratchet = gapRatchet({
		base: gridBase.base,
		head: JSON.parse(renderGridJson(grid.model)),
	});
	const all = [...stale, ...register.problems, ...ratchet.problems];
	const { counts } = grid.model;
	return {
		ok: all.length === 0,
		problems: all,
		files: files.length,
		notes: [
			`copy findings: ${entries} entries (${baseDoc === null ? "bootstrap" : `merge-base ${mergeBase.slice(0, 7)}`})`,
			`grid: ${counts.subjects} subjects, ${counts.cells} cells, ${counts.covered} covered, ${counts.waived} waived, ${counts.gaps} gaps (${gridBase.base === null ? "bootstrap" : `merge-base ${gridBase.mergeBase.slice(0, 7)}`})`,
		],
	};
}

/**
 * @param {string} root
 * @returns {Promise<number>} files written
 */
export async function writeCatalog(root) {
	const files = await generatedFiles(root);
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
 * @returns {Promise<number>} exit code
 */
export async function main(argv = process.argv.slice(2)) {
	try {
		const { flags, base } = parseArguments(argv);
		const writing = flags.has("--write");
		if (writing === flags.has("--check")) {
			throw new Error("pass exactly one of --check or --write");
		}
		const root = process.cwd();
		if (writing) {
			const count = await writeCatalog(root);
			console.log(`✓ CATALOG WRITE — ${count} files`);
			return 0;
		}
		const result = await checkCatalog({ root, base });
		if (!result.ok) {
			console.error(`✗ CATALOG CHECK FAILED: ${describe(result.problems)}`);
			return 1;
		}
		console.log(
			`✓ CATALOG CHECK PASSED — ${result.files} generated files current`,
		);
		for (const note of result.notes) console.log(note);
		return 0;
	} catch (error) {
		console.error(
			`✗ CATALOG CHECK FAILED: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (isMainModule(import.meta.url)) {
	process.exitCode = await main();
}
