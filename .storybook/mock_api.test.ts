import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import type { ElectronApi } from "../src/preload/api_types";
import { createMockApi } from "../tests/fakes/mock_window_api";
import type { MockApiEmitter } from "../tests/fakes/mock_window_api";

// The surface written out by hand: adding a member to ElectronApi must also
// add it here (and to the mock, which the compiler enforces).
const SURFACE: Record<string, string[]> = {
	exif: ["readMetadata", "removeMetadata"],
	i18n: ["getLocale", "getStrings", "onLanguageChanged"],
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
	theme: [
		"get",
		"getAccentColor",
		"onAccentColorChanged",
		"onChanged",
		"onThemeModeChanged",
		"set",
	],
	settings: ["get", "onChanged", "onToggle", "set"],
	platform: ["isMac"],
	reveal: ["showContextMenu", "showInFolder"],
	folder: ["classify", "expand"],
};

type EventCase = {
	name: string;
	subscribe: (api: ElectronApi, callback: Mock) => (() => void) | undefined;
	fire: (emit: MockApiEmitter) => void;
};

const EVENT_CASES: EventCase[] = [
	{
		name: "i18n.onLanguageChanged",
		subscribe: (api, cb) => api.i18n.onLanguageChanged(cb),
		fire: (emit) => emit.languageChanged("fa"),
	},
	{
		name: "files.onFileOpenAddFiles",
		subscribe: (api, cb) => api.files.onFileOpenAddFiles(cb),
		fire: (emit) => emit.fileOpenAddFiles(["/tmp/a.jpg"]),
	},
	{
		name: "theme.onChanged",
		subscribe: (api, cb) => api.theme.onChanged(cb),
		fire: (emit) => emit.systemTheme(true),
	},
	{
		name: "theme.onAccentColorChanged",
		subscribe: (api, cb) => api.theme.onAccentColorChanged(cb),
		fire: (emit) => emit.accentColor("#ff0000"),
	},
	{
		name: "theme.onThemeModeChanged",
		subscribe: (api, cb) => api.theme.onThemeModeChanged?.(cb),
		fire: (emit) => emit.themeMode("dark"),
	},
	{
		name: "settings.onChanged",
		subscribe: (api, cb) => api.settings.onChanged(cb),
		fire: (emit) =>
			emit.settingsChanged({
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				saveAsCopy: true,
				removeXattrs: false,
				preserveTimestamps: false,
				language: null,
				themeMode: "system",
			}),
	},
	{
		name: "settings.onToggle",
		subscribe: (api, cb) => api.settings.onToggle(cb),
		fire: (emit) => emit.settingsToggle(),
	},
];

function memberNames(api: ElectronApi): Array<[string, string[]]> {
	return Object.entries(api).map(([namespace, members]) => [
		namespace,
		Object.keys(members).sort(),
	]);
}

describe("createMockApi", () => {
	test("has exactly the 8 namespaces and members of ElectronApi", () => {
		const { api } = createMockApi();
		expect(memberNames(api)).toEqual(
			Object.entries(SURFACE).map(([namespace, members]) => [
				namespace,
				[...members].sort(),
			]),
		);
		expect(Object.keys(api).sort()).toEqual(Object.keys(SURFACE).sort());
	});

	test("every on* member returns a function and is covered by an event case", () => {
		const { api } = createMockApi();
		const onMembers = memberNames(api).flatMap(([namespace, members]) =>
			members
				.filter((member) => /^on[A-Z]/.test(member))
				.map((member) => `${namespace}.${member}`),
		);
		expect(onMembers.sort()).toEqual(EVENT_CASES.map((c) => c.name).sort());
		for (const { name, subscribe } of EVENT_CASES) {
			expect(typeof subscribe(api, vi.fn()), name).toBe("function");
		}
	});

	test.each(EVENT_CASES)(
		"$name: the returned unsubscribe stops only that callback",
		({ subscribe, fire }) => {
			const { api, emit } = createMockApi();
			const removed = vi.fn();
			const kept = vi.fn();
			const unsubscribe = subscribe(api, removed);
			subscribe(api, kept);
			fire(emit);
			expect(removed).toHaveBeenCalledTimes(1);
			expect(kept).toHaveBeenCalledTimes(1);
			unsubscribe?.();
			fire(emit);
			expect(removed).toHaveBeenCalledTimes(1);
			expect(kept).toHaveBeenCalledTimes(2);
		},
	);

	test("clear() drops every subscriber", () => {
		const { api, emit, clear } = createMockApi();
		const callbacks = EVENT_CASES.map(({ subscribe }) => {
			const callback = vi.fn();
			subscribe(api, callback);
			return callback;
		});
		clear();
		for (const { fire } of EVENT_CASES) fire(emit);
		for (const callback of callbacks) expect(callback).not.toHaveBeenCalled();
	});

	test("settings.set merges, emits settings and, for a language change, the locale", async () => {
		const { api } = createMockApi({}, { locale: "en" });
		const changed = vi.fn();
		const language = vi.fn();
		api.settings.onChanged(changed);
		api.i18n.onLanguageChanged(language);

		await expect(api.settings.set({ language: "fa" })).resolves.toEqual({
			success: true,
			error: null,
		});
		expect(changed).toHaveBeenCalledWith(
			expect.objectContaining({ language: "fa", saveAsCopy: true }),
		);
		expect(language).toHaveBeenCalledWith("fa");
		await expect(api.settings.get()).resolves.toEqual(
			expect.objectContaining({ language: "fa" }),
		);

		await api.settings.set({ language: null });
		expect(language).toHaveBeenLastCalledWith("en");

		language.mockClear();
		await api.settings.set({ saveAsCopy: false });
		expect(language).not.toHaveBeenCalled();
	});

	test("theme.set emits the resolved colour scheme", async () => {
		const { api } = createMockApi({}, { systemDark: true });
		const changed = vi.fn();
		api.theme.onChanged(changed);
		await api.theme.set("light");
		expect(changed).toHaveBeenLastCalledWith({ shouldUseDarkColors: false });
		await api.theme.set("system");
		expect(changed).toHaveBeenLastCalledWith({ shouldUseDarkColors: true });
		await expect(api.theme.get()).resolves.toEqual({
			shouldUseDarkColors: true,
		});
	});

	test("data-bearing calls reject so a story must configure them", async () => {
		const { api } = createMockApi();
		await expect(api.exif.readMetadata("/tmp/a.jpg")).rejects.toThrow(
			/not configured/,
		);
		await expect(api.exif.removeMetadata("/tmp/a.jpg")).rejects.toThrow(
			/not configured/,
		);
		await expect(api.folder.classify(["/tmp"])).rejects.toThrow(
			/not configured/,
		);
		await expect(api.folder.expand("/tmp")).rejects.toThrow(/not configured/);
	});

	test("overrides replace a member and keep the rest", async () => {
		const readMetadata = vi.fn(async () => ({ Make: "Test" }));
		const { api } = createMockApi({ exif: { readMetadata } });
		await expect(api.exif.readMetadata("/tmp/a.jpg")).resolves.toEqual({
			Make: "Test",
		});
		await expect(api.exif.removeMetadata("/tmp/a.jpg")).rejects.toThrow(
			/not configured/,
		);
	});

	test("the spy option wraps every function member", () => {
		const wrapped = new Set<unknown>();
		const { api } = createMockApi(
			{},
			{
				spy: (f) => {
					wrapped.add(f);
					return f;
				},
			},
		);
		const members = Object.values(api).flatMap((namespace) =>
			Object.values(namespace).filter((value) => typeof value === "function"),
		);
		expect(members).toHaveLength(27);
		expect(wrapped.size).toBe(members.length);
		for (const member of members) expect(wrapped.has(member)).toBe(true);
	});
});

// D-25: the mock and Storybook never reach the app. No file under src imports
// tests/ or .storybook/, and only story files under src import Storybook.
export function isolationViolations(
	files: ReadonlyArray<{ path: string; text: string }>,
): string[] {
	const violations: string[] = [];
	for (const { path: file, text } of files) {
		if (!file.startsWith("src/")) continue;
		const specifiers = [
			...text.matchAll(/\bfrom\s+["']([^"']+)["']/g),
			...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
			...text.matchAll(/^import\s+["']([^"']+)["']/gm),
			...text.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g),
		].map((match) => match[1] ?? "");
		for (const specifier of specifiers) {
			const resolved = specifier.startsWith(".")
				? path.posix.join(path.posix.dirname(file), specifier)
				: specifier;
			if (/^(tests|\.storybook)(\/|$)/.test(resolved)) {
				violations.push(`${file} imports ${specifier} (test support)`);
			}
			const isStorybook =
				specifier === "storybook" ||
				specifier.startsWith("storybook/") ||
				specifier.startsWith("@storybook/");
			if (isStorybook && !file.endsWith(".stories.tsx")) {
				violations.push(`${file} imports ${specifier} (outside a story file)`);
			}
		}
	}
	return violations;
}

function walkTsFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const absolute = path.join(dir, name);
		if (statSync(absolute).isDirectory()) {
			out.push(...walkTsFiles(absolute));
			continue;
		}
		if (absolute.endsWith(".ts") || absolute.endsWith(".tsx")) {
			out.push(absolute);
		}
	}
	return out;
}

describe("src isolation", () => {
	test("no src file imports tests/ or .storybook/, and only stories import Storybook", () => {
		const root = path.resolve(import.meta.dirname, "..");
		const files = walkTsFiles(path.join(root, "src")).map((absolute) => ({
			path: path.relative(root, absolute).split(path.sep).join("/"),
			text: readFileSync(absolute, "utf8"),
		}));
		// Anti-vacuity: the walk saw production code and the story file.
		expect(files.length).toBeGreaterThan(50);
		expect(files.map((f) => f.path)).toContain(
			"src/renderer/components/settings/LanguageDropdown.stories.tsx",
		);
		expect(isolationViolations(files)).toEqual([]);
	});

	test("reports a planted component importing the mock", () => {
		expect(
			isolationViolations([
				{
					path: "src/renderer/components/x.tsx",
					text: 'import { createMockApi } from "../../../tests/fakes/mock_window_api";',
				},
			]),
		).toEqual([
			"src/renderer/components/x.tsx imports ../../../tests/fakes/mock_window_api (test support)",
		]);
	});

	test("reports a planted hook importing storybook", () => {
		expect(
			isolationViolations([
				{
					path: "src/renderer/hooks/use_x.ts",
					text: 'import { fn } from "storybook/test";',
				},
			]),
		).toEqual([
			"src/renderer/hooks/use_x.ts imports storybook/test (outside a story file)",
		]);
	});

	test("allows Storybook in a story file and ignores files outside src", () => {
		expect(
			isolationViolations([
				{
					path: "src/renderer/components/x.stories.tsx",
					text: 'import { fn } from "storybook/test";\nimport type { Meta } from "@storybook/react-vite";',
				},
				{
					path: ".storybook/preview.tsx",
					text: 'import { createMockApi } from "../tests/fakes/mock_window_api";',
				},
			]),
		).toEqual([]);
	});
});
