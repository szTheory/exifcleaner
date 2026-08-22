import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const resources = path.resolve(import.meta.dirname, "../../.resources");
const localesDir = path.join(resources, "locales");
const english = readJson(path.join(localesDir, "en.json")) as Record<
	string,
	string
>;
const provenance = readJson(
	path.join(resources, "translation-provenance.json"),
) as unknown as {
	contributorCredits: { ro: Array<{ keys: number; pullRequest: number }> };
	locales: Record<
		string,
		Record<
			string,
			{
				sourceHash: string;
				origin: string;
				review: string;
				sourceIdenticalReason?: string;
			}
		>
	>;
};
const romanianArchive = readJson(
	path.join(resources, "translation-contributions/pr-297-ro.json"),
) as unknown as { values: Record<string, string> };
const worklist = readJson(
	path.join(resources, "translation-worklist.json"),
) as { items: unknown[] };
const status = readJson(path.join(resources, "translation-status.json")) as {
	blockingIssues: number;
	locales: Record<string, { coverage: number; stale: number }>;
};

describe("translation resources", () => {
	it("keeps Romanian complete and archives all 70 contributed strings", () => {
		const romanian = readJson(path.join(localesDir, "ro.json")) as Record<
			string,
			string
		>;
		expect(Object.keys(romanian)).toEqual(Object.keys(english));
		expect(provenance.contributorCredits.ro).toContainEqual(
			expect.objectContaining({ pullRequest: 297, keys: 70 }),
		);
		expect(Object.keys(romanianArchive.values)).toHaveLength(70);
		const evolved = Object.entries(romanianArchive.values)
			.filter(([key, value]) => romanian[key] !== value)
			.map(([key]) => key);
		expect(evolved).toEqual(["empty.title", "empty.subtitle"]);
		expect(
			Object.values(provenance.locales.ro ?? {}).filter(
				(entry) => entry.origin === "existing-contribution",
			),
		).toHaveLength(68);
	});

	it("covers every canonical key in every locale", () => {
		for (const file of readdirSync(localesDir).filter((name) =>
			name.endsWith(".json"),
		)) {
			const strings = readJson(path.join(localesDir, file)) as Record<
				string,
				string
			>;
			expect(Object.keys(strings).sort(), file).toEqual(
				Object.keys(english).sort(),
			);
		}
	});

	it("requires a provenance justification for source-identical text", () => {
		for (const file of readdirSync(localesDir).filter(
			(name) => name.endsWith(".json") && name !== "en.json",
		)) {
			const locale = path.basename(file, ".json");
			const strings = readJson(path.join(localesDir, file)) as Record<
				string,
				string
			>;
			for (const [key, value] of Object.entries(strings)) {
				if (value === english[key]) {
					expect(
						provenance.locales[locale]?.[key]?.sourceIdenticalReason,
						`${locale}:${key}`,
					).toMatch(/\S/);
				}
			}
		}
	});

	it("records the current English source hash for every translation", () => {
		for (const [locale, entries] of Object.entries(provenance.locales)) {
			for (const [key, entry] of Object.entries(entries)) {
				const expected = createHash("sha256")
					.update(`${key}\0${english[key]}`, "utf8")
					.digest("hex");
				expect(entry.sourceHash, `${locale}:${key}`).toBe(expected);
			}
		}
	});

	it("ships with an empty worklist and complete generated status", () => {
		expect(worklist.items).toEqual([]);
		expect(status.blockingIssues).toBe(0);
		for (const [locale, localeStatus] of Object.entries(status.locales)) {
			expect(localeStatus.coverage, locale).toBe(1);
			expect(localeStatus.stale, locale).toBe(0);
		}
	});
});

function readJson(file: string): unknown {
	return JSON.parse(readFileSync(file, "utf8")) as unknown;
}
