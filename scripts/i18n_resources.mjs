import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const localesDir = path.join(root, ".resources", "locales");
const outputPath = path.join(root, ".resources", "strings.json");
const statusPath = path.join(root, ".resources", "translation-status.json");
const localeSourcePath = path.join(
	root,
	"src",
	"domain",
	"i18n",
	"i18n_lookup.ts",
);

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
	const parsed = JSON.parse(
		await readFile(path.join(localesDir, file), "utf8"),
	);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${locale} must contain one JSON object`);
	}
	locales.set(locale, parsed);
}

const english = locales.get("en");
if (english === undefined)
	throw new Error(".resources/locales/en.json is required");

const englishKeys = Object.keys(english);
const dictionary = {};
const status = {
	sourceLocale: "en",
	totalKeys: englishKeys.length,
	locales: {},
};

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
	const translated = englishKeys.filter(
		(key) => typeof strings[key] === "string" && strings[key].length > 0,
	).length;
	status.locales[locale] = {
		translated,
		total: englishKeys.length,
		coverage: Number((translated / englishKeys.length).toFixed(4)),
		provenance: locale === "en" ? "project-source" : "existing-contribution",
	};
}

const dictionaryText = JSON.stringify(dictionary, null, "\t") + "\n";
const statusText = JSON.stringify(status, null, "\t") + "\n";

if (process.argv.includes("--check")) {
	await assertCurrent(outputPath, dictionaryText);
	await assertCurrent(statusPath, statusText);
} else {
	await writeFile(outputPath, dictionaryText, "utf8");
	await writeFile(statusPath, statusText, "utf8");
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

async function assertCurrent(filePath, expected) {
	const actual = await readFile(filePath, "utf8").catch(() => "");
	if (actual !== expected) {
		throw new Error(
			`${path.relative(root, filePath)} is stale; run yarn i18n:write`,
		);
	}
}
