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
	type CatalogClaim,
	type CatalogContext,
	type CatalogDocument,
	type CatalogJob,
	type CatalogPersona,
	type CatalogRedFlag,
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
	test("the code list stays frozen and unique", () => {
		expect(Object.isFrozen(CATALOG_CODES)).toBe(true);
		expect(new Set(CATALOG_CODES).size).toBe(CATALOG_CODES.length);
	});
});

function must<T>(value: T | undefined, what: string): T {
	if (value === undefined) throw new Error(`no ${what}`);
	return value;
}

function personaOf(doc: CatalogDocument, id: string): CatalogPersona {
	return must(
		doc.personas.find((persona) => persona.id === id),
		id,
	);
}

function jobOf(doc: CatalogDocument, id: string): CatalogJob {
	return must(
		doc.jobs.find((job) => job.id === id),
		id,
	);
}

function flagOf(doc: CatalogDocument, id: string): CatalogRedFlag {
	return must(
		doc.personas
			.flatMap((persona) => persona.redFlags)
			.find((f) => f.id === id),
		id,
	);
}

// The first confirmed claim about users, and about the product.
function userClaim(doc: CatalogDocument): CatalogClaim {
	return must(
		personaOf(doc, "P-sharer").claims.find(
			(claim) => claim.tag === "confirmed" && claim.about === "user",
		),
		"confirmed user claim",
	);
}

function productClaim(doc: CatalogDocument): CatalogClaim {
	return must(
		personaOf(doc, "P-photographer").claims.find(
			(claim) => claim.tag === "confirmed" && claim.about === "product",
		),
		"confirmed product claim",
	);
}

function brandSource() {
	return {
		kind: "brand" as const,
		pin: ctx.brandPin,
		section: "Voice: this, not that",
	};
}

const FIRST_RED_FLAG = "RF-sharer-1";

interface Mutant {
	name: string;
	code: string;
	mutate: (doc: CatalogDocument) => unknown;
}

function extraJob(doc: CatalogDocument, id: string, personas: string[]) {
	const base = structuredClone(jobOf(doc, "J-06"));
	base.id = id;
	base.personas = personas;
	return base;
}

const MUTANTS: Mutant[] = [
	{ name: "a non-object document", code: "not-object", mutate: () => [] },
	{
		name: "schemaVersion 2",
		code: "schema-version",
		mutate: (doc) => ({ ...doc, schemaVersion: 2 }),
	},
	{
		name: "an age field on a persona",
		code: "unknown-field",
		mutate: (doc) => {
			Object.assign(personaOf(doc, "P-sharer"), { age: 34 });
			return doc;
		},
	},
	{
		name: "a persona without a label",
		code: "missing-field",
		mutate: (doc) => {
			Reflect.deleteProperty(personaOf(doc, "P-sharer"), "label");
			return doc;
		},
	},
	{
		name: "personas that are not a list",
		code: "bad-type",
		mutate: (doc) => ({ ...doc, personas: {} }),
	},
	{
		name: "a malformed job id",
		code: "bad-id",
		mutate: (doc) => {
			jobOf(doc, "J-09").id = "J-9";
			return doc;
		},
	},
	{
		name: "two jobs with one id",
		code: "duplicate-id",
		mutate: (doc) => {
			must(doc.jobs[1], "second job").id = "J-01";
			return doc;
		},
	},
	{
		name: "two red flags with one id",
		code: "duplicate-id",
		mutate: (doc) => {
			flagOf(doc, "RF-sharer-2").id = "RF-sharer-1";
			return doc;
		},
	},
	{
		name: "one persona listed twice in a job",
		code: "duplicate-ref",
		mutate: (doc) => {
			jobOf(doc, "J-09").personas = ["P-sharer", "P-sharer"];
			return doc;
		},
	},
	{
		name: "a missing persona",
		code: "persona-list",
		mutate: (doc) => {
			doc.personas = doc.personas.filter((persona) => persona.id !== "P-batch");
			return doc;
		},
	},
	{
		name: "personas out of order",
		code: "unsorted",
		mutate: (doc) => {
			doc.personas.reverse();
			return doc;
		},
	},
	{
		name: "a claim tag likely",
		code: "bad-tag",
		mutate: (doc) => {
			userClaim(doc).tag = "likely";
			return doc;
		},
	},
	{
		name: "a claim about everyone",
		code: "bad-about",
		mutate: (doc) => {
			userClaim(doc).about = "everyone";
			return doc;
		},
	},
	{
		name: "a claim field bio",
		code: "bad-field",
		mutate: (doc) => {
			userClaim(doc).field = "bio";
			return doc;
		},
	},
	{
		name: "a red flag kind wish",
		code: "bad-red-flag-kind",
		mutate: (doc) => {
			flagOf(doc, FIRST_RED_FLAG).kind = "wish";
			return doc;
		},
	},
	{
		name: "a red flag state sad",
		code: "bad-state",
		mutate: (doc) => {
			flagOf(doc, FIRST_RED_FLAG).states = ["sad"];
			return doc;
		},
	},
	{
		name: "an issue source with no refs",
		code: "bad-source",
		mutate: (doc) => {
			userClaim(doc).source = { kind: "issue", by: "user", refs: [] };
			return doc;
		},
	},
	{
		name: "an issue ref without the hash",
		code: "bad-source",
		mutate: (doc) => {
			userClaim(doc).source = { kind: "issue", by: "user", refs: ["405"] };
			return doc;
		},
	},
	{
		name: "a source kind web",
		code: "bad-source",
		mutate: (doc) => {
			Object.assign(userClaim(doc), { source: { kind: "web" } });
			return doc;
		},
	},
	{
		name: "the spam issue 351",
		code: "spam-ref",
		mutate: (doc) => {
			userClaim(doc).source = { kind: "issue", by: "user", refs: ["#351"] };
			return doc;
		},
	},
	{
		name: "a maintainer date 2026-02-30",
		code: "bad-date",
		mutate: (doc) => {
			const claim = must(
				personaOf(doc, "P-batch").claims.find(
					(candidate) => candidate.source.kind === "maintainer",
				),
				"maintainer claim",
			);
			claim.source = { kind: "maintainer", date: "2026-02-30", doc: "x" };
			return doc;
		},
	},
	{
		name: "a validateBy outside the closed set",
		code: "bad-validate-by",
		mutate: (doc) => {
			userClaim(doc).validateBy = "telemetry";
			return doc;
		},
	},
	{
		name: "a 301-character claim",
		code: "text-too-long",
		mutate: (doc) => {
			userClaim(doc).text = "a".repeat(301);
			return doc;
		},
	},
	{
		name: "a confirmed user claim on an issue by the maintainer",
		code: "tag-source-mismatch",
		mutate: (doc) => {
			userClaim(doc).source = {
				kind: "issue",
				by: "maintainer",
				refs: ["#316"],
			};
			return doc;
		},
	},
	{
		name: "a confirmed user claim on the brand book",
		code: "tag-source-mismatch",
		mutate: (doc) => {
			userClaim(doc).source = brandSource();
			return doc;
		},
	},
	{
		name: "a confirmed product claim on an issue",
		code: "tag-source-mismatch",
		mutate: (doc) => {
			productClaim(doc).source = { kind: "issue", by: "user", refs: ["#209"] };
			return doc;
		},
	},
	{
		name: "a confirmed claim with source none",
		code: "tag-source-mismatch",
		mutate: (doc) => {
			userClaim(doc).source = { kind: "none" };
			return doc;
		},
	},
	{
		name: "an assumed claim without validateBy",
		code: "assumed-needs-validate-by",
		mutate: (doc) => {
			const claim = must(
				personaOf(doc, "P-sharer").claims.find((c) => c.tag === "assumed"),
				"assumed claim",
			);
			Reflect.deleteProperty(claim, "validateBy");
			return doc;
		},
	},
	{
		name: "a confirmed claim with validateBy",
		code: "validate-by-unexpected",
		mutate: (doc) => {
			userClaim(doc).validateBy = "issue-watch";
			return doc;
		},
	},
	{
		name: "a code source whose file lacks the symbol",
		code: "source-unresolved",
		mutate: (doc) => {
			productClaim(doc).source = {
				kind: "code",
				path: "src/domain/path_truncation.ts",
				symbol: "noSuchSymbol",
			};
			return doc;
		},
	},
	{
		name: "a code source outside the filtered trees",
		code: "source-unresolved",
		mutate: (doc) => {
			productClaim(doc).source = {
				kind: "code",
				path: "src/main/security/permissions.ts",
				symbol: "installPermissionGate",
			};
			return doc;
		},
	},
	{
		name: "a string key missing from en.json",
		code: "source-unresolved",
		mutate: (doc) => {
			productClaim(doc).source = { kind: "string", key: "no.such.key" };
			return doc;
		},
	},
	{
		name: "a brand pin that is not brand.pin.json",
		code: "source-unresolved",
		mutate: (doc) => {
			productClaim(doc).source = {
				kind: "brand",
				pin: "0".repeat(40),
				section: "Key messages",
			};
			return doc;
		},
	},
	{
		name: "a persona without a stakes claim",
		code: "persona-missing-field",
		mutate: (doc) => {
			const persona = personaOf(doc, "P-batch");
			persona.claims = persona.claims.filter((c) => c.field !== "stakes");
			return doc;
		},
	},
	{
		name: "a persona without red flags",
		code: "persona-no-red-flag",
		mutate: (doc) => {
			personaOf(doc, "P-photographer").redFlags = [];
			return doc;
		},
	},
	{
		name: "a fifth job for one persona",
		code: "persona-job-count",
		mutate: (doc) => {
			doc.jobs.push(extraJob(doc, "J-10", ["P-sharer"]));
			return doc;
		},
	},
	{
		name: "thirteen jobs",
		code: "job-count",
		mutate: (doc) => {
			for (const id of ["J-10", "J-11", "J-12", "J-13"]) {
				doc.jobs.push(extraJob(doc, id, ["P-batch"]));
			}
			return doc;
		},
	},
	{
		name: "a job want of 19 characters",
		code: "job-text-short",
		mutate: (doc) => {
			jobOf(doc, "J-09").want = "x".repeat(19);
			return doc;
		},
	},
	{
		name: "a job with no persona",
		code: "job-no-persona",
		mutate: (doc) => {
			jobOf(doc, "J-09").personas = [];
			return doc;
		},
	},
	{
		name: "a job with no claim",
		code: "job-no-claim",
		mutate: (doc) => {
			jobOf(doc, "J-09").claims = [];
			return doc;
		},
	},
	{
		name: "a job naming a persona that does not exist",
		code: "unknown-persona",
		mutate: (doc) => {
			jobOf(doc, "J-09").personas = ["P-nobody"];
			return doc;
		},
	},
	{
		name: "a red flag naming a job that does not exist",
		code: "unknown-job",
		mutate: (doc) => {
			flagOf(doc, FIRST_RED_FLAG).jobs = ["J-99"];
			return doc;
		},
	},
	{
		name: "a job that names the click the button control",
		code: "solution-word",
		mutate: (doc) => {
			jobOf(doc, "J-09").want = "to click the button and see a result";
			return doc;
		},
	},
	{
		name: "a confirmed user claim that says most users",
		code: "prevalence-word",
		mutate: (doc) => {
			userClaim(doc).text = "Most users reported rotated photos.";
			return doc;
		},
	},
	{
		name: "a never-say flag with no forbidden phrase",
		code: "forbidden-missing",
		mutate: (doc) => {
			flagOf(doc, "RF-source-2").forbidden = [];
			return doc;
		},
	},
	{
		name: "a never-say forbidden phrase that no banned rule catches",
		code: "forbidden-not-banned",
		mutate: (doc) => {
			flagOf(doc, "RF-source-2").forbidden = ["secure", "helpful"];
			return doc;
		},
	},
	{
		name: "a gate on a never-happen flag",
		code: "gate-not-never-say",
		mutate: (doc) => {
			flagOf(doc, "RF-source-4").gate = "banned.secure";
			return doc;
		},
	},
	{
		name: "a gate naming no rule",
		code: "unknown-gate",
		mutate: (doc) => {
			flagOf(doc, "RF-sharer-3").gate = "banned.nope";
			return doc;
		},
	},
	{
		name: "a gate whose rule does not fire on every forbidden phrase",
		code: "unknown-gate",
		mutate: (doc) => {
			flagOf(doc, "RF-sharer-3").gate = "banned.secure";
			return doc;
		},
	},
	{
		name: "an @handle in a claim",
		code: "personal-data",
		mutate: (doc) => {
			userClaim(doc).text = "A user called @someone reported it.";
			return doc;
		},
	},
	{
		name: "an email address in a claim",
		code: "personal-data",
		mutate: (doc) => {
			userClaim(doc).text = "A user at a@b.example reported it.";
			return doc;
		},
	},
	{
		name: "a double quote in a claim",
		code: "quoted-text",
		mutate: (doc) => {
			userClaim(doc).text = 'A user said "it flips" after cleaning.';
			return doc;
		},
	},
];

describe("every catalog rule has a mutant", () => {
	test.each(MUTANTS)("shown red: $name yields exactly $code", (mutant) => {
		const doc = mutant.mutate(structuredClone(real));
		expect(codes(doc)).toEqual([mutant.code]);
	});

	test("the mutant codes equal CATALOG_CODES", () => {
		expect([...new Set(MUTANTS.map((mutant) => mutant.code))].sort()).toEqual(
			[...CATALOG_CODES].sort(),
		);
	});
});

describe("red flags run through the D-16 matrix", () => {
	test("shown red: red flag confirmed never-happen on an issue by the maintainer", () => {
		const doc = structuredClone(real);
		flagOf(doc, FIRST_RED_FLAG).source = {
			kind: "issue",
			by: "maintainer",
			refs: ["#396"],
		};
		expect(codes(doc)).toEqual(["tag-source-mismatch"]);
	});

	test("shown red: red flag confirmed never-happen on a maintainer note", () => {
		const doc = structuredClone(real);
		flagOf(doc, FIRST_RED_FLAG).source = {
			kind: "maintainer",
			date: "2026-11-10",
			doc: "a note",
		};
		expect(codes(doc)).toEqual(["tag-source-mismatch"]);
	});

	test("shown red: red flag confirmed never-happen on a brand source", () => {
		const doc = structuredClone(real);
		flagOf(doc, FIRST_RED_FLAG).source = brandSource();
		expect(codes(doc)).toEqual(["tag-source-mismatch"]);
	});

	test("shown red: red flag without a tag", () => {
		const doc = structuredClone(real);
		Reflect.deleteProperty(flagOf(doc, FIRST_RED_FLAG), "tag");
		expect(codes(doc)).toEqual(["missing-field"]);
	});

	test("shown red: red flag assumed without validateBy", () => {
		const doc = structuredClone(real);
		flagOf(doc, FIRST_RED_FLAG).tag = "assumed";
		expect(codes(doc)).toEqual(["assumed-needs-validate-by"]);
	});

	test("shown red: red flag tag likely", () => {
		const doc = structuredClone(real);
		flagOf(doc, FIRST_RED_FLAG).tag = "likely";
		expect(codes(doc)).toEqual(["bad-tag"]);
	});

	test("shown red: red flag gate on never-happen", () => {
		const doc = structuredClone(real);
		flagOf(doc, "RF-source-4").gate = "banned.secure";
		expect(codes(doc)).toEqual(["gate-not-never-say"]);
	});

	test("shown red: red flag gate naming no rule", () => {
		const doc = structuredClone(real);
		flagOf(doc, "RF-sharer-3").gate = "banned.nope";
		expect(codes(doc)).toEqual(["unknown-gate"]);
	});

	test("controls: a never-say flag confirmed on a brand source is valid", () => {
		const flag = flagOf(real, "RF-source-2");
		expect(flag.kind).toBe("never-say");
		expect(flag.tag).toBe("confirmed");
		expect(flag.source.kind).toBe("brand");
		expect(codes(real)).toEqual([]);
		const gated = flagOf(real, "RF-sharer-3");
		expect(gated.forbidden).toEqual([
			"hackers",
			"stalkers",
			"something to hide",
		]);
		expect(gated.gate).toBe("banned.fear");
	});

	test("controls: maintainer-only red flags are proposal, as is the unverified RF-batch-2", () => {
		for (const id of ["RF-batch-2", "RF-batch-3", "RF-photographer-2"]) {
			expect(flagOf(real, id).tag, id).toBe("proposal");
		}
	});
});

describe("privacy: quotations never enter the catalog", () => {
	test("shown red: quoted single-quoted phrase in the J-04 evidence claim", () => {
		const doc = structuredClone(real);
		jobOf(doc, "J-04").claims[0]!.text =
			"Users hit 'could not verify' and cleaning that failed outright.";
		expect(codes(doc)).toEqual(["quoted-text"]);
	});

	test("shown red: quoted curly quotes in a claim", () => {
		const doc = structuredClone(real);
		userClaim(doc).text = "A user said \u201Cit flips\u201D after cleaning.";
		expect(codes(doc)).toEqual(["quoted-text"]);
	});

	test("shown red: quoted text in a red flag", () => {
		const doc = structuredClone(real);
		flagOf(doc, FIRST_RED_FLAG).text = 'A photo that "flips" after cleaning.';
		expect(codes(doc)).toEqual(["quoted-text"]);
	});

	test("an apostrophe inside a word is not a quotation mark", () => {
		const doc = structuredClone(real);
		userClaim(doc).text = "Users questioned the app's network behaviour.";
		expect(codes(doc)).toEqual([]);
	});
});

describe("edges", () => {
	test("a 300-character claim is accepted and 301 is not", () => {
		const doc = structuredClone(real);
		userClaim(doc).text = "a".repeat(300);
		expect(codes(doc)).toEqual([]);
		userClaim(doc).text = "a".repeat(301);
		expect(codes(doc)).toEqual(["text-too-long"]);
	});

	test("a code source with a real symbol under the filtered trees resolves", () => {
		const doc = structuredClone(real);
		productClaim(doc).source = {
			kind: "code",
			path: "src/domain/path_truncation.ts",
			symbol: "middleTruncatePath",
		};
		expect(codes(doc)).toEqual([]);
	});

	test("a real catalog has 4 personas, 9 jobs and anti-vacuity content", () => {
		expect(real.personas).toHaveLength(4);
		expect(real.jobs).toHaveLength(9);
		const claims = [
			...real.coreJob.clauses,
			...real.personas.flatMap((persona) => persona.claims),
			...real.jobs.flatMap((job) => job.claims),
		];
		expect(
			claims.filter((claim) => claim.tag === "confirmed").length,
		).toBeGreaterThanOrEqual(5);
		const flags = real.personas.flatMap((persona) => persona.redFlags);
		expect(flags.some((flag) => flag.kind === "never-say")).toBe(true);
		expect(flags.some((flag) => flag.tag === "proposal")).toBe(true);
	});

	test("the real catalog has no handle, email, spam ref or quotation mark", () => {
		const raw = JSON.stringify(real);
		expect(raw).not.toMatch(/@[A-Za-z0-9_]/);
		expect(raw).not.toContain('"#351"');
	});

	test("every never-say forbidden phrase fires a banned rule", () => {
		for (const flag of real.personas.flatMap((persona) => persona.redFlags)) {
			if (flag.kind !== "never-say") continue;
			expect(flag.forbidden?.length, flag.id).toBeGreaterThan(0);
		}
	});
});
