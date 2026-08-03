import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const resourcesDir = path.join(root, ".resources");
const localesDir = path.join(resourcesDir, "locales");
const outputPath = path.join(resourcesDir, "strings.json");
const statusPath = path.join(resourcesDir, "translation-status.json");
const provenancePath = path.join(resourcesDir, "translation-provenance.json");
const worklistPath = path.join(resourcesDir, "translation-worklist.json");
const glossaryPath = path.join(resourcesDir, "translation-glossary.json");
const contributionArchivesDir = path.join(
	resourcesDir,
	"translation-contributions",
);
const localeSourcePath = path.join(
	root,
	"src",
	"domain",
	"i18n",
	"i18n_lookup.ts",
);

const PROTECTED_KEY_PREFIXES = ["empty.", "intake."];
const PROTECTED_KEYS = new Set(["menu.help.new-releases"]);
const PROVENANCE_ORIGINS = new Set(["existing-contribution", "agent-assisted"]);
const REVIEW_STATES = new Set(["agent-reviewed", "human-reviewed"]);

const localeFiles = (await readdir(localesDir))
	.filter((file) => file.endsWith(".json"))
	.sort();
const localeSource = await readFile(localeSourcePath, "utf8");
const supportedLocales = [
	...localeSource.matchAll(/^\s*[A-Za-z]+\s*=\s*"([^"]+)",?$/gm),
]
	.map((match) => match[1])
	.sort();
const fileLocales = localeFiles
	.map((file) => path.basename(file, ".json"))
	.sort();
if (JSON.stringify(fileLocales) !== JSON.stringify(supportedLocales)) {
	throw new Error(
		`locale files ${JSON.stringify(fileLocales)} do not match Locale enum ${JSON.stringify(supportedLocales)}`,
	);
}

const locales = new Map();
for (const file of localeFiles) {
	const locale = path.basename(file, ".json");
	const parsed = await readJson(path.join(localesDir, file), locale);
	locales.set(locale, parsed);
}

const english = locales.get("en");
if (english === undefined) {
	throw new Error(".resources/locales/en.json is required");
}

const englishKeys = Object.keys(english);
for (const [key, value] of Object.entries(english)) {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`en:${key} must be a non-blank string`);
	}
	assertSafeValue(key, value, "en");
}

const provenance = await readJson(provenancePath, "translation provenance");
validateProvenanceHeader(provenance);
await validateContributionArchives(provenance);
const glossary = await readJson(glossaryPath, "translation glossary");
validateGlossary(glossary);

const dictionary = {};
const protectedKeys = englishKeys.filter(isProtectedKey);
const worklist = {
	schemaVersion: 1,
	sourceLocale: "en",
	protectedKeys,
	items: [],
};
const status = {
	schemaVersion: 2,
	sourceLocale: "en",
	totalKeys: englishKeys.length,
	protectedKeys: protectedKeys.length,
	locales: {},
};
const blockingIssues = [];

for (const key of englishKeys) {
	dictionary[key] = {};
	for (const [locale, strings] of locales) {
		const value = strings[key];
		if (!(key in strings)) continue;
		if (typeof value !== "string" || value.trim().length === 0) {
			throw new Error(`${locale}:${key} must be a non-blank string`);
		}
		assertSafeValue(key, value, locale);
		assertPlaceholderParity(key, english[key], value, locale);
		dictionary[key][locale] = value;
	}
}

for (const [locale, strings] of locales) {
	const extraKeys = Object.keys(strings).filter((key) => !(key in english));
	if (extraKeys.length > 0) {
		throw new Error(`${locale} contains unknown keys: ${extraKeys.join(", ")}`);
	}

	if (locale === "en") {
		status.locales.en = {
			translated: englishKeys.length,
			total: englishKeys.length,
			coverage: 1,
			protectedTranslated: protectedKeys.length,
			protectedTotal: protectedKeys.length,
			provenance: { "project-source": englishKeys.length },
			legacyMissing: 0,
			stale: 0,
		};
		continue;
	}

	const localeProvenance = provenance.locales[locale];
	if (!localeProvenance || typeof localeProvenance !== "object") {
		throw new Error(`translation provenance is missing locale ${locale}`);
	}
	const provenanceExtraKeys = Object.keys(localeProvenance).filter(
		(key) => !(key in english) || !(key in strings),
	);
	if (provenanceExtraKeys.length > 0) {
		throw new Error(
			`translation provenance for ${locale} contains unused keys: ${provenanceExtraKeys.join(", ")}`,
		);
	}

	let translated = 0;
	let protectedTranslated = 0;
	let stale = 0;
	let legacyMissing = 0;
	const provenanceCounts = {
		"existing-contribution": 0,
		"agent-assisted/reviewed": 0,
		"human-reviewed": 0,
		stale: 0,
		missing: 0,
	};

	for (const key of englishKeys) {
		const hasTranslation = typeof strings[key] === "string";
		const protectedKey = isProtectedKey(key);
		const blocking = locale === "ro" || protectedKey;
		if (!hasTranslation) {
			provenanceCounts.missing += 1;
			if (!protectedKey) legacyMissing += 1;
			worklist.items.push({
				locale,
				key,
				state: "missing",
				blocking,
				source: english[key],
				sourceHash: sourceHash(key, english[key]),
			});
			if (blocking) blockingIssues.push(`${locale}:${key} is missing`);
			continue;
		}

		translated += 1;
		if (protectedKey) protectedTranslated += 1;
		const entry = localeProvenance[key];
		validateProvenanceEntry(locale, key, entry);
		const currentSourceHash = sourceHash(key, english[key]);
		if (entry.sourceHash !== currentSourceHash) {
			stale += 1;
			provenanceCounts.stale += 1;
			worklist.items.push({
				locale,
				key,
				state: "stale",
				blocking,
				source: english[key],
				sourceHash: currentSourceHash,
				recordedSourceHash: entry.sourceHash,
			});
			if (blocking) blockingIssues.push(`${locale}:${key} is stale`);
			continue;
		}

		if (entry.origin === "existing-contribution") {
			provenanceCounts["existing-contribution"] += 1;
		} else {
			provenanceCounts["agent-assisted/reviewed"] += 1;
		}
		if (entry.review === "human-reviewed") {
			provenanceCounts["human-reviewed"] += 1;
		}
	}

	status.locales[locale] = {
		translated,
		total: englishKeys.length,
		coverage: Number((translated / englishKeys.length).toFixed(4)),
		protectedTranslated,
		protectedTotal: protectedKeys.length,
		provenance: provenanceCounts,
		legacyMissing,
		stale,
	};
}

worklist.items.sort(
	(a, b) =>
		Number(b.blocking) - Number(a.blocking) ||
		a.locale.localeCompare(b.locale) ||
		a.key.localeCompare(b.key),
);
status.blockingIssues = blockingIssues.length;
status.nonblockingLegacyItems = worklist.items.filter(
	(item) => !item.blocking,
).length;

const generatedFiles = [
	[outputPath, jsonText(dictionary)],
	[statusPath, jsonText(status)],
	[worklistPath, worklistText(worklist)],
];

if (process.argv.includes("--check")) {
	for (const [filePath, expected] of generatedFiles) {
		await assertCurrent(filePath, expected);
	}
} else {
	for (const [filePath, contents] of generatedFiles) {
		await writeFile(filePath, contents, "utf8");
	}
}

if (status.nonblockingLegacyItems > 0) {
	console.log(
		`${status.nonblockingLegacyItems} legacy translation gaps/stale entries remain (nonblocking; see .resources/translation-worklist.json).`,
	);
}
if (blockingIssues.length > 0) {
	throw new Error(
		`blocking translation issues:\n- ${blockingIssues.join("\n- ")}`,
	);
}

function isProtectedKey(key) {
	return (
		PROTECTED_KEYS.has(key) ||
		PROTECTED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
	);
}

function sourceHash(key, source) {
	return createHash("sha256").update(`${key}\0${source}`, "utf8").digest("hex");
}

function placeholders(value) {
	return [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)]
		.map((match) => match[1])
		.sort();
}

function assertPlaceholderParity(key, source, translation, locale) {
	const expected = JSON.stringify(placeholders(source));
	const actual = JSON.stringify(placeholders(translation));
	if (expected !== actual) {
		throw new Error(
			`${locale}:${key} placeholders ${actual} do not match English ${expected}`,
		);
	}
}

function assertSafeValue(key, value, locale) {
	if (/\u0000|[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
		throw new Error(`${locale}:${key} contains an unsafe control character`);
	}
}

function validateProvenanceHeader(value) {
	if (
		value.schemaVersion !== 1 ||
		value.sourceLocale !== "en" ||
		typeof value.locales !== "object" ||
		value.locales === null
	) {
		throw new Error("translation provenance has an unsupported schema");
	}
}

async function validateContributionArchives(value) {
	for (const [locale, credits] of Object.entries(
		value.contributorCredits ?? {},
	)) {
		if (!Array.isArray(credits)) {
			throw new Error(`contributor credits for ${locale} must be an array`);
		}
		for (const credit of credits) {
			if (typeof credit.archive !== "string") continue;
			const archivePath = path.resolve(root, credit.archive);
			const relative = path.relative(contributionArchivesDir, archivePath);
			if (relative.startsWith("..") || path.isAbsolute(relative)) {
				throw new Error(
					`contribution archive escapes its directory: ${credit.archive}`,
				);
			}
			const archive = await readJson(
				archivePath,
				`contribution archive ${credit.archive}`,
			);
			if (
				archive.schemaVersion !== 1 ||
				archive.locale !== locale ||
				archive.source?.pullRequest !== credit.pullRequest ||
				typeof archive.values !== "object" ||
				archive.values === null ||
				Object.keys(archive.values).length !== credit.keys ||
				Object.values(archive.values).some(
					(translation) =>
						typeof translation !== "string" || translation.length === 0,
				)
			) {
				throw new Error(`contribution archive ${credit.archive} is invalid`);
			}
		}
	}
}

function validateProvenanceEntry(locale, key, entry) {
	if (!entry || typeof entry !== "object") {
		throw new Error(`translation provenance is missing ${locale}:${key}`);
	}
	if (!PROVENANCE_ORIGINS.has(entry.origin)) {
		throw new Error(`${locale}:${key} has invalid provenance origin`);
	}
	if (!REVIEW_STATES.has(entry.review)) {
		throw new Error(`${locale}:${key} has invalid provenance review state`);
	}
	if (entry.origin === "agent-assisted" && entry.review !== "agent-reviewed") {
		throw new Error(
			`${locale}:${key} agent-assisted text must be agent-reviewed`,
		);
	}
	if (!/^[a-f0-9]{64}$/.test(entry.sourceHash)) {
		throw new Error(`${locale}:${key} has an invalid source hash`);
	}
}

function validateGlossary(value) {
	const requiredTerms = [
		"ExifCleaner",
		"EXIF",
		"metadata",
		"original",
		"cleaned copy",
		"Save as Copy",
		"ICC profile",
		"orientation",
		"timestamps",
		"macOS attributes",
	];
	if (value.schemaVersion !== 1 || typeof value.terms !== "object") {
		throw new Error("translation glossary has an unsupported schema");
	}
	const missing = requiredTerms.filter(
		(term) => typeof value.terms[term]?.context !== "string",
	);
	if (missing.length > 0) {
		throw new Error(`translation glossary is missing: ${missing.join(", ")}`);
	}
}

async function readJson(filePath, label) {
	let parsed;
	try {
		parsed = JSON.parse(await readFile(filePath, "utf8"));
	} catch (error) {
		throw new Error(`${label} is missing or malformed`, { cause: error });
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${label} must contain one JSON object`);
	}
	return parsed;
}

function jsonText(value) {
	return JSON.stringify(value, null, "\t") + "\n";
}

function worklistText(value) {
	const items = value.items
		.map(
			(item, index) =>
				`\t\t${JSON.stringify(item)}${index === value.items.length - 1 ? "" : ","}`,
		)
		.join("\n");
	return `{
\t"schemaVersion": ${value.schemaVersion},
\t"sourceLocale": ${JSON.stringify(value.sourceLocale)},
\t"protectedKeys": ${JSON.stringify(value.protectedKeys)},
\t"items": [
${items}
\t]
}\n`;
}

async function assertCurrent(filePath, expected) {
	const actual = await readFile(filePath, "utf8").catch(() => "");
	if (actual !== expected) {
		throw new Error(
			`${path.relative(root, filePath)} is stale; run yarn i18n:write`,
		);
	}
}
