import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { canonicalJson } from "./closed.mjs";
import {
	CATALOG_PATH,
	CATALOG_CODES,
	PERSONAS_MD_PATH,
	loadCatalog,
	loadCatalogContext,
	renderPersonas,
	validateCatalog,
	type CatalogContext,
	type CatalogDocument,
} from "./personas.mjs";
import { repoRoot } from "./temp_repo";

const ctx: CatalogContext = loadCatalogContext(repoRoot);
const text = fs.readFileSync(path.join(repoRoot, CATALOG_PATH), "utf8");
const real = JSON.parse(text) as CatalogDocument;

function codes(doc: unknown): string[] {
	return validateCatalog(doc, ctx).map((found) => found.code);
}

describe("the real catalog", () => {
	test("real catalog validates to no problems", () => {
		expect(validateCatalog(real, ctx)).toEqual([]);
	});

	test("PERSONAS.md equals a fresh render of catalog.json", () => {
		const generated = fs.readFileSync(
			path.join(repoRoot, PERSONAS_MD_PATH),
			"utf8",
		);
		expect(generated).toBe(renderPersonas(real));
	});

	test("loadCatalog hands the ids and maps to the manifest validator", () => {
		const loaded = loadCatalog(repoRoot);
		expect(loaded.personaIds).toEqual([
			"P-batch",
			"P-photographer",
			"P-sharer",
			"P-source",
		]);
		expect(loaded.jobIds).toHaveLength(9);
		expect(loaded.jobPersonas["J-09"]).toEqual(["P-sharer"]);
		expect(loaded.redFlags.length).toBeGreaterThanOrEqual(10);
		expect(Object.keys(loaded.jobPersonas)).toEqual(loaded.jobIds);
	});

	test("canonical form: the file is canonicalJson of its parse with lists sorted by id", () => {
		expect(text).toBe(canonicalJson(real));
		const sorted = (ids: string[]) => [...ids].sort();
		const ids = real.personas.map((persona) => persona.id);
		expect(ids).toEqual(sorted(ids));
		const jobIds = real.jobs.map((job) => job.id);
		expect(jobIds).toEqual(sorted(jobIds));
		for (const persona of real.personas) {
			const flagIds = persona.redFlags.map((flag) => flag.id);
			expect(flagIds).toEqual(sorted(flagIds));
		}
	});
});

describe("catalog shape", () => {
	test("shown red: an unsorted clone fails the order rule", () => {
		const clone = structuredClone(real);
		clone.personas.reverse();
		expect(codes(clone)).toEqual(["unsorted"]);
	});

	test("the code list stays frozen and unique", () => {
		expect(Object.isFrozen(CATALOG_CODES)).toBe(true);
		expect(new Set(CATALOG_CODES).size).toBe(CATALOG_CODES.length);
	});
});
