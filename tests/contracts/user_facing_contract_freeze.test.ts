// D-28: freezes the ENTIRE user-facing contract surface as literal arrays, hand-transcribed
// from the tree at authoring time — never a snapshot. A snapshot regenerates silently under
// an update flag; a literal array here must be hand-edited in a reviewable diff by someone
// who has to think about it. If any pinned literal below stops matching the tree, that is a
// real user-facing contract change and this test must fail, not "helpfully" resync.
//
// Scanned band for the webp-vocabulary-leak negative control (D-28's second requirement):
// src/common, src/preload, src/main/ipc, src/domain/settings_schema.ts, .resources/strings.json.
// This file lives under tests/contracts/ and is DELIBERATELY EXCLUDED from that band, so the
// synthetic violating fixture below never causes the real-tree assertion to fail (comment-text
// discipline — the scanned identifier only ever appears inside a fixture string in this file,
// never inside a scanned production file).

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { IPC_CHANNELS } from "../../src/common/ipc_channels";
import {
	CURRENT_SCHEMA_VERSION,
	DEFAULT_SETTINGS,
} from "../../src/domain/settings_schema";

const REPO_ROOT = path.resolve(__dirname, "../..");

describe("IPC channel values (D-28)", () => {
	it("equals the exact literal set of channel string values, sorted", () => {
		const sorted = Object.values(IPC_CHANNELS).slice().sort();
		expect(sorted).toEqual([
			"all-files-processed",
			"exif:read",
			"exif:remove",
			"file-open-add-files",
			"file-processed",
			"file:reveal",
			"file:reveal-context-menu",
			"files-added",
			"files:choose",
			"folder:choose",
			"folder:classify",
			"folder:expand",
			"get-i18n-strings",
			"get-locale",
			"language:changed",
			"settings:changed",
			"settings:get",
			"settings:set",
			"settings:toggle",
			"theme:accent-color",
			"theme:accent-color-changed",
			"theme:changed",
			"theme:get",
			"theme:mode-changed-from-menu",
			"theme:set",
		]);
	});
});

describe("Settings schema (D-28)", () => {
	it("has exactly this sorted set of keys", () => {
		const sortedKeys = Object.keys(DEFAULT_SETTINGS).sort();
		expect(sortedKeys).toEqual([
			"language",
			"preserveColorProfile",
			"preserveOrientation",
			"preserveResolution",
			"preserveTimestamps",
			"removeXattrs",
			"saveAsCopy",
			"themeMode",
		]);
	});

	it("CURRENT_SCHEMA_VERSION equals the literal 5", () => {
		expect(CURRENT_SCHEMA_VERSION).toBe(5);
	});

	it("DEFAULT_SETTINGS equals this literal object", () => {
		expect(DEFAULT_SETTINGS).toEqual({
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveResolution: true,
			saveAsCopy: true,
			removeXattrs: false,
			preserveTimestamps: false,
			language: null,
			themeMode: "system",
		});
	});
});

describe("English i18n key set (D-28)", () => {
	it("equals this exact sorted set of 129 keys", () => {
		const stringsPath = path.join(REPO_ROOT, ".resources/strings.json");
		const strings: Record<string, Record<string, string>> = JSON.parse(
			fs.readFileSync(stringsPath, "utf8"),
		);
		const sortedKeys = Object.keys(strings).sort();
		expect(sortedKeys).toEqual([
			"aboutwindow:copyright",
			"appearance",
			"cleanupFailedSummary",
			"complete",
			"contextmenu.copy",
			"contextmenu.select-all",
			"copyAll",
			"empty.dropActive",
			"empty.subtitle",
			"empty.title",
			"folder.collapse",
			"folder.expand",
			"folder.files",
			"folder.found",
			"folder.scanning",
			"folder.supportedFiles",
			"intake.chooseFiles",
			"intake.chooseFolder",
			"intake.dropZone",
			"intake.foldersUnreadable",
			"intake.outputCopy",
			"intake.outputOverwrite",
			"intake.unsupportedSkipped",
			"language",
			"languageSystem",
			"menu.app.about",
			"menu.app.hide",
			"menu.app.hide-others",
			"menu.app.quit",
			"menu.app.services",
			"menu.app.settings",
			"menu.app.show-all",
			"menu.edit.copy",
			"menu.edit.name",
			"menu.edit.select-all",
			"menu.edit.speech",
			"menu.edit.speech.start-speaking",
			"menu.edit.speech.stop-speaking",
			"menu.file.close",
			"menu.file.name",
			"menu.file.open",
			"menu.file.quit",
			"menu.help.about",
			"menu.help.name",
			"menu.help.new-releases",
			"menu.help.report-issue",
			"menu.help.source-code",
			"menu.help.website",
			"menu.view.name",
			"menu.view.toggle-dev-tools",
			"menu.view.toggle-full-screen",
			"menu.view.zoom-in",
			"menu.view.zoom-out",
			"menu.view.zoom-reset",
			"menu.window.close",
			"menu.window.front",
			"menu.window.minimize",
			"menu.window.minimize-mac",
			"menu.window.name",
			"menu.window.window",
			"menu.window.zoom",
			"menu.window.zoom-mac",
			"metaGroupAuthor",
			"metaGroupCamera",
			"metaGroupCameraInternals",
			"metaGroupColorProfile",
			"metaGroupDocument",
			"metaGroupImage",
			"metaGroupLocation",
			"metaGroupOther",
			"metaGroupPublishing",
			"metaGroupTime",
			"metaGroupVideo",
			"metadata.field.preserved",
			"metadata.field.removed",
			"metadata.present.one",
			"metadata.present.other",
			"metadata.removed.one",
			"metadata.removed.other",
			"metadata.stillPresent",
			"metadata.summary",
			"metadataGroupHeader",
			"noMetadataFound",
			"outcome.alreadyClean",
			"outcome.cleaned",
			"outcome.refusedRaf",
			"outcome.unchanged",
			"reveal.cleanedCopy",
			"reveal.original",
			"settings.close",
			"settings.preserveColorProfile.description",
			"settings.preserveColorProfile.label",
			"settings.preserveOrientation.description",
			"settings.preserveOrientation.label",
			"settings.preserveResolution.description",
			"settings.preserveResolution.label",
			"settings.preserveTimestamps.description",
			"settings.preserveTimestamps.label",
			"settings.removeXattrs.description",
			"settings.removeXattrs.label",
			"settings.saveAsCopy.description",
			"settings.saveAsCopy.label",
			"status.error",
			"status.pending",
			"statusBar.clear",
			"statusBar.elapsed",
			"statusBar.tagsRemoved",
			"statusBar.xOfYCleaned",
			"table.header.after",
			"table.header.before",
			"table.header.exif-after",
			"table.header.exif-before",
			"table.header.filename",
			"table.header.name",
			"table.header.size",
			"table.header.type",
			"table.label",
			"table.sort.ascending",
			"table.sort.descending",
			"themeAuto",
			"themeDark",
			"themeLight",
			"toast.copied",
			"usertasks:open-file.description",
			"usertasks:open-file.label",
			"verificationFailedSummary",
			"writeFailedSummary",
			"writtenToCopy",
			"xattrFailedSummary",
		]);
		expect(sortedKeys).toHaveLength(129);
	});
});

// window.api surface (D-28): the preload module is IMPORTED (not text-scanned) so a member
// that is declared in api_types.ts but never actually attached to the object passed to
// contextBridge.exposeInMainWorld would be caught — a text scan of api_types.ts alone could
// not distinguish "declared" from "attached". electron is mocked (this repo's established
// pattern, see tests/main/exif_handlers.test.ts) purely to capture the real object the real
// preload module constructs at real module-evaluation time.
const capturedApi = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock("electron", () => ({
	contextBridge: {
		exposeInMainWorld: (_name: string, obj: unknown) => {
			capturedApi.value = obj;
		},
	},
	ipcRenderer: {
		invoke: vi.fn(),
		send: vi.fn(),
		on: vi.fn(),
		removeListener: vi.fn(),
	},
	webUtils: {
		getPathForFile: vi.fn(),
	},
}));

// Side-effecting import: executing this module is what calls
// contextBridge.exposeInMainWorld and populates capturedApi.value above.
import "../../src/preload/index";

describe("window.api surface (D-28)", () => {
	it("exposes exactly this sorted set of namespaces", () => {
		const api = capturedApi.value as Record<string, unknown>;
		expect(api).toBeDefined();
		const namespaces = Object.keys(api).sort();
		expect(namespaces).toEqual([
			"exif",
			"files",
			"folder",
			"i18n",
			"platform",
			"reveal",
			"settings",
			"theme",
		]);
	});

	it("each namespace exposes exactly this sorted set of members", () => {
		const api = capturedApi.value as Record<string, Record<string, unknown>>;
		const expectedMembers: Record<string, string[]> = {
			exif: ["readMetadata", "removeMetadata"],
			files: [
				"basename",
				"chooseFiles",
				"chooseFolder",
				"getPathForFile",
				"notifyAllFilesProcessed",
				"notifyFileProcessed",
				"notifyFilesAdded",
				"onFileOpenAddFiles",
			],
			folder: ["classify", "expand"],
			i18n: ["getLocale", "getStrings", "onLanguageChanged"],
			platform: ["isMac"],
			reveal: ["showContextMenu", "showInFolder"],
			settings: ["get", "onChanged", "onToggle", "set"],
			theme: [
				"get",
				"getAccentColor",
				"onAccentColorChanged",
				"onChanged",
				"onThemeModeChanged",
				"set",
			],
		};
		for (const [namespace, expected] of Object.entries(expectedMembers)) {
			const actual = Object.keys(api[namespace] as object).sort();
			expect(actual, `window.api.${namespace} members`).toEqual(expected);
		}
	});
});

// D-28 negative control: zero case-insensitive "webp" matches across the contract band, with
// a paired synthetic-violation control proving the scanning function can actually fire.

interface ScannedFile {
	readonly path: string;
	readonly content: string;
}

/**
 * Pure classifier: given a list of (path, content) pairs and a case-insensitive term, returns
 * the paths whose content contains that term. No filesystem access — the real-tree assertion
 * below supplies real files; the negative control below supplies a synthetic fixture. Keeping
 * this pure and exported from the test module (not a text-scan of the whole test file) is what
 * lets the same function back both the real assertion and its own fireability proof.
 */
function findCaseInsensitiveMatches({
	files,
	term,
}: {
	files: readonly ScannedFile[];
	term: string;
}): string[] {
	const needle = term.toLowerCase();
	return files
		.filter((file) => file.content.toLowerCase().includes(needle))
		.map((file) => file.path);
}

function walkTsFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of fs.readdirSync(dir)) {
		const absolute = path.join(dir, name);
		const stat = fs.statSync(absolute);
		if (stat.isDirectory()) {
			out.push(...walkTsFiles(absolute));
			continue;
		}
		if (absolute.endsWith(".ts") || absolute.endsWith(".tsx")) {
			out.push(absolute);
		}
	}
	return out;
}

function loadContractBand(): ScannedFile[] {
	const bandDirs = [
		path.join(REPO_ROOT, "src/common"),
		path.join(REPO_ROOT, "src/preload"),
		path.join(REPO_ROOT, "src/main/ipc"),
	];
	const files: ScannedFile[] = [];
	for (const dir of bandDirs) {
		for (const absolute of walkTsFiles(dir)) {
			files.push({
				path: path.relative(REPO_ROOT, absolute),
				content: fs.readFileSync(absolute, "utf8"),
			});
		}
	}
	const singleFiles = [
		path.join(REPO_ROOT, "src/domain/settings_schema.ts"),
		path.join(REPO_ROOT, ".resources/strings.json"),
	];
	for (const absolute of singleFiles) {
		files.push({
			path: path.relative(REPO_ROOT, absolute),
			content: fs.readFileSync(absolute, "utf8"),
		});
	}
	return files;
}

describe("Contract band is clean of format vocabulary (D-28)", () => {
	it("has zero case-insensitive webp matches across src/common, src/preload, src/main/ipc, src/domain/settings_schema.ts, and .resources/strings.json", () => {
		const band = loadContractBand();
		// Sanity: the band actually contains files, so an empty result below is a real
		// pass, not an artifact of an empty file list.
		expect(band.length).toBeGreaterThan(0);
		const matches = findCaseInsensitiveMatches({ files: band, term: "webp" });
		expect(matches).toEqual([]);
	});

	// Negative control (D-28, comment-text discipline): the term below is a synthetic
	// fixture string, not a reference into any scanned production file, and this test file
	// (tests/contracts/) is itself excluded from the scanned band above — so this line does
	// not and cannot make the real-tree assertion fail.
	it("the scanning function reports a match when a synthetic fixture contains the term (proves the gate can fire)", () => {
		const syntheticFixture: ScannedFile[] = [
			{
				path: "synthetic/fixture-does-not-exist.ts",
				content: 'export const backend = "native-webp";',
			},
		];
		const matches = findCaseInsensitiveMatches({
			files: syntheticFixture,
			term: "webp",
		});
		expect(matches).toEqual(["synthetic/fixture-does-not-exist.ts"]);
	});

	it("the scanning function is case-insensitive (WebP, WEBP, webp all match)", () => {
		const syntheticFixture: ScannedFile[] = [
			{ path: "a.ts", content: "WebP" },
			{ path: "b.ts", content: "WEBP" },
			{ path: "c.ts", content: "webp" },
			{ path: "d.ts", content: "no format vocabulary here" },
		];
		const matches = findCaseInsensitiveMatches({
			files: syntheticFixture,
			term: "webp",
		});
		expect(matches.sort()).toEqual(["a.ts", "b.ts", "c.ts"]);
	});
});
