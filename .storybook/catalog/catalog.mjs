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
import { compareCodeUnits, readJson } from "./closed.mjs";
import {
	COPY_FINDINGS_PATH,
	check as checkRegister,
	loadObservation,
} from "./copy_findings_ratchet.mjs";
import { renderFindings } from "./findings_view.mjs";
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
	zeroGapProblems,
} from "./grid.mjs";
import {
	checkJourneys,
	loadJourneyInputs,
	renderJourneys,
} from "./journeys.mjs";
import { readMergeBase, resolveBaseRef } from "./merge_base.mjs";
import {
	CATALOG_PATH,
	PERSONAS_MD_PATH,
	loadCatalogContext,
	renderPersonas,
	validateCatalog,
} from "./personas.mjs";
import { TIERS } from "./vocab.mjs";

// Repo-relative inputs `--check` reads. Tests copy exactly these into a temp
// repository, so a passing run there also proves no other data is read.
export const CHECK_INPUTS = Object.freeze([
	".storybook/catalog",
	".storybook/main.ts",
	".resources/locales/en.json",
	".resources/translation-glossary.json",
	"brand.pin.json",
	"docs/evidence/known-findings.json",
	"src",
	"tests/e2e",
]);

// The generated journey view (Phase 73, FLW-01, D-22); its data is journeys/*.json.
export const JOURNEYS_MD_PATH = ".storybook/catalog/JOURNEYS.md";

// The generated findings register view (Phase 73, FLW-02, D-30, R-3). Its data is the one
// shrink-only baseline plus the copy findings register, which it lists as a cross-reference.
export const FINDINGS_MD_PATH = ".storybook/catalog/FINDINGS.md";
const KNOWN_FINDINGS_PATH = "docs/evidence/known-findings.json";

const FLAGS = new Set(["--check", "--write", "--zero-gaps"]);

/**
 * `--check`, `--write` and `--zero-gaps`, plus the valued flags `--base <ref>`
 * (the merge-base the copy findings register and the coverage grid are
 * compared with, default origin/master), `--index <path>` (a built Storybook
 * index.json whose story ids must equal the enumerated ones) and
 * `--tier <comma list>` (the tiers `--zero-gaps` looks at).
 *
 * @param {string[]} argv
 * @returns {{ flags: Set<string>, base: string | undefined, index: string | undefined, tiers: string[] | undefined }}
 */
export function parseArguments(argv) {
	const flags = new Set();
	/** @type {Record<string, string | undefined>} */
	const values = {};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--base" || arg === "--index" || arg === "--tier") {
			const value = argv[index + 1];
			if (value === undefined || value.startsWith("--")) {
				throw new Error(`${arg} needs a value`);
			}
			values[arg] = value;
			index += 1;
		} else if (FLAGS.has(arg)) {
			flags.add(arg);
		} else {
			throw new Error(`unknown argument ${arg}`);
		}
	}
	let tiers;
	if (values["--tier"] !== undefined) {
		if (!flags.has("--zero-gaps")) {
			throw new Error("--tier only applies with --zero-gaps");
		}
		tiers = values["--tier"].split(",");
		const unknown = tiers.filter((tier) => !TIERS.includes(tier));
		if (unknown.length > 0) {
			throw new Error(
				`unknown tier ${unknown.join(", ")}; the tiers are ${TIERS.join(", ")}`,
			);
		}
	}
	return {
		flags,
		base: values["--base"],
		index: values["--index"],
		tiers,
	};
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
 * FINDINGS.md: the register (docs/evidence/known-findings.json) in full, the rejected
 * findings with their verdict rows, the accessibility baseline summarised and the copy
 * findings register as a cross-reference. The register's own rules are the ratchet's
 * (scripts/findings_ratchet.mjs); this only renders what the files hold.
 *
 * @param {string} root
 */
function findingsView(root) {
	return renderFindings({
		baseline: /** @type {any} */ (readJson(root, KNOWN_FINDINGS_PATH)),
		copyFindings: /** @type {any} */ (readJson(root, COPY_FINDINGS_PATH)),
	});
}

/**
 * The journey files and what checkJourneys finds wrong with them (schema, job
 * set, scenario ids and the static e2e proof). A problem keeps its own code and
 * its message says it is a journeys problem, so a planted defect reads as one.
 *
 * @param {string} root
 */
function journeyProblems(root) {
	const inputs = loadJourneyInputs(root);
	return {
		journeys: inputs.journeys,
		problems: checkJourneys(inputs).map((found) => ({
			code: found.code,
			message: `journeys: ${found.message}`,
		})),
	};
}

/**
 * Story-index parity: the ids this tree's stories enumerate to must equal the
 * `story` entries of a built Storybook index. A missing index fails closed.
 *
 * @param {string} root
 * @param {string} indexPath
 * @param {ReadonlyArray<{ id: string }>} stories
 * @returns {Array<{ code: string, message: string }>}
 */
function indexProblems(root, indexPath, stories) {
	const absolute = path.resolve(root, indexPath);
	if (!fs.existsSync(absolute)) {
		return [
			{
				code: "index-missing",
				message: `index ${indexPath} not found; build the catalog first (yarn test:storybook builds storybook-static)`,
			},
		];
	}
	let entries;
	try {
		entries = JSON.parse(fs.readFileSync(absolute, "utf8")).entries;
	} catch {
		entries = undefined;
	}
	if (typeof entries !== "object" || entries === null) {
		return [
			{
				code: "index-unreadable",
				message: `index ${indexPath} has no entries object; build the catalog first`,
			},
		];
	}
	const built = new Set(
		Object.values(entries)
			.filter((entry) => /** @type {any} */ (entry)?.type === "story")
			.map((entry) => /** @type {any} */ (entry).id),
	);
	const enumerated = new Set(stories.map((story) => story.id));
	const found = [];
	for (const id of [...enumerated].sort(compareCodeUnits)) {
		if (!built.has(id)) {
			found.push({
				code: "index-story-missing",
				message: `story ${id} is enumerated from source but is not in ${indexPath}`,
			});
		}
	}
	for (const id of [...built].sort(compareCodeUnits)) {
		if (!enumerated.has(id)) {
			found.push({
				code: "index-story-extra",
				message: `story ${id} is in ${indexPath} but is not enumerated from source`,
			});
		}
	}
	return found;
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
	const journeys = journeyProblems(root);
	if (journeys.problems.length > 0) {
		throw new Error(firstProblem(journeys.problems));
	}
	const grid = await loadGrid(root);
	if (grid.model === null) {
		throw new Error(firstProblem(grid.problems));
	}
	return [
		[GLOSSARY_MD_PATH, renderGlossary(/** @type {any} */ (doc))],
		[PERSONAS_MD_PATH, renderPersonas(/** @type {any} */ (catalog.doc))],
		[JOURNEYS_MD_PATH, renderJourneys(/** @type {any} */ (journeys.journeys))],
		[FINDINGS_MD_PATH, findingsView(root)],
		[GRID_JSON_PATH, renderGridJson(grid.model)],
		[GRID_MD_PATH, renderGridMarkdown(grid.model)],
	];
}

/**
 * The drift layer (generated files), the copy findings register layer and
 * the coverage grid gap ratchet.
 *
 * @param {{ root: string, base?: string | undefined, index?: string | undefined, zeroGaps?: boolean | undefined, tiers?: readonly string[] | undefined }} options
 * @returns {Promise<{ ok: boolean, problems: Array<{ code: string, message: string }>, files: number, notes: string[] }>}
 */
export async function checkCatalog({ root, base, index, zeroGaps, tiers }) {
	const { doc, problems } = glossaryProblems(root);
	if (problems.length > 0) {
		return { ok: false, problems, files: 0, notes: [] };
	}
	const catalog = catalogProblems(root);
	if (catalog.problems.length > 0) {
		return { ok: false, problems: catalog.problems, files: 0, notes: [] };
	}
	const journeys = journeyProblems(root);
	if (journeys.problems.length > 0) {
		return { ok: false, problems: journeys.problems, files: 0, notes: [] };
	}
	const grid = await loadGrid(root);
	if (grid.model === null) {
		return { ok: false, problems: grid.problems, files: 0, notes: [] };
	}
	const stale = [];
	const files = [
		[GLOSSARY_MD_PATH, renderGlossary(/** @type {any} */ (doc))],
		[PERSONAS_MD_PATH, renderPersonas(/** @type {any} */ (catalog.doc))],
		[JOURNEYS_MD_PATH, renderJourneys(/** @type {any} */ (journeys.journeys))],
		[FINDINGS_MD_PATH, findingsView(root)],
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
	const all = [
		...stale,
		...register.problems,
		...ratchet.problems,
		...(index === undefined ? [] : indexProblems(root, index, grid.stories)),
		...(zeroGaps === true ? zeroGapProblems(grid.model, tiers ?? []) : []),
	];
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
		const { flags, base, index, tiers } = parseArguments(argv);
		const writing = flags.has("--write");
		const checking = flags.has("--check") || flags.has("--zero-gaps");
		if (writing === checking) {
			throw new Error("pass exactly one of --check or --write");
		}
		if (writing && index !== undefined) {
			throw new Error("--index only applies with --check");
		}
		const root = process.cwd();
		if (writing) {
			const count = await writeCatalog(root);
			console.log(`✓ CATALOG WRITE — ${count} files`);
			return 0;
		}
		const result = await checkCatalog({
			root,
			base,
			index,
			zeroGaps: flags.has("--zero-gaps"),
			tiers,
		});
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
