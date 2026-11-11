// Typed in-memory stand-in for the preload's `window.api` (D-23). Pure
// TypeScript: no Vite, Storybook, vitest or `window` access, so Storybook, the
// renderer tests and the node tests can all import it. It cannot import
// `src/preload/index.ts` (that file imports electron).
//
// Exhaustiveness is checked by the compiler: `base` must satisfy
// `Complete<ElectronApi>`, so adding a surface to `ElectronApi` fails
// `yarn typecheck` here (and `tests/types/mock_api_exhaustive.ts` fails when
// `Complete` itself is loosened).

import type { ElectronApi } from "../../src/preload/api_types";
import type { I18nStringsDictionary } from "../../src/preload/api_types";
import type { Settings, ThemeMode } from "../../src/domain/settings_schema";
import { DEFAULT_SETTINGS } from "../../src/domain/settings_schema";

// Every namespace and every member required, including the optional ones.
export type Complete<A> = {
	[N in keyof A]-?: { [M in keyof A[N]]-?: A[N][M] };
};

export type MockApiOverrides = {
	[N in keyof ElectronApi]?: Partial<ElectronApi[N]>;
};

// Wraps one mock function so a caller can record its calls (Storybook passes
// `fn`, renderer tests pass `vi.fn`). Identity by default.
export type MockApiSpy = <A extends unknown[], R>(
	f: (...args: A) => R,
) => (...args: A) => R;

export type MockApiOptions = {
	strings?: I18nStringsDictionary;
	locale?: string;
	systemDark?: boolean;
	settings?: Partial<Settings>;
	isMac?: boolean;
	accentColor?: string;
	spy?: MockApiSpy;
};

export type MockApiEmitter = {
	systemTheme: (dark: boolean) => void;
	accentColor: (color: string) => void;
	themeMode: (mode: ThemeMode) => void;
	settingsChanged: (settings: Settings) => void;
	settingsToggle: () => void;
	languageChanged: (locale: string) => void;
	fileOpenAddFiles: (paths: string[]) => void;
};

export type MockApi = {
	api: ElectronApi;
	emit: MockApiEmitter;
	clear: () => void;
};

// Mirrors `src/preload/index.ts` `basename`.
function basename(filePath: string): string {
	const normalized = filePath.replace(/\\/g, "/");
	const parts = normalized.split("/");
	return parts[parts.length - 1] || filePath;
}

// Data-bearing calls fail loudly so a story that needs data must configure it.
function notConfigured(method: string): Promise<never> {
	return Promise.reject(new Error(`mockApi.${method} not configured`));
}

// Same contract as the preload: subscribing returns a function that removes
// exactly that listener.
function subscribe<C>(listeners: Set<C>, callback: C): () => void {
	listeners.add(callback);
	return () => {
		listeners.delete(callback);
	};
}

export function createMockApi(
	overrides: MockApiOverrides = {},
	opts: MockApiOptions = {},
): MockApi {
	const spy: MockApiSpy = opts.spy ?? ((f) => f);
	const systemDark = opts.systemDark ?? false;
	const locale = opts.locale ?? "en";

	const listeners = {
		systemTheme: new Set<(payload: { shouldUseDarkColors: boolean }) => void>(),
		accentColor: new Set<(payload: { color: string }) => void>(),
		themeMode: new Set<(mode: ThemeMode) => void>(),
		settingsChanged: new Set<(settings: Settings) => void>(),
		settingsToggle: new Set<() => void>(),
		languageChanged: new Set<(locale: string) => void>(),
		fileOpenAddFiles: new Set<(paths: string[]) => void>(),
	};

	let settings: Settings = { ...DEFAULT_SETTINGS, ...opts.settings };

	const emit: MockApiEmitter = {
		systemTheme: (dark) => {
			for (const callback of [...listeners.systemTheme]) {
				callback({ shouldUseDarkColors: dark });
			}
		},
		accentColor: (color) => {
			for (const callback of [...listeners.accentColor]) {
				callback({ color });
			}
		},
		themeMode: (mode) => {
			for (const callback of [...listeners.themeMode]) callback(mode);
		},
		settingsChanged: (next) => {
			for (const callback of [...listeners.settingsChanged]) callback(next);
		},
		settingsToggle: () => {
			for (const callback of [...listeners.settingsToggle]) callback();
		},
		languageChanged: (next) => {
			for (const callback of [...listeners.languageChanged]) callback(next);
		},
		fileOpenAddFiles: (paths) => {
			for (const callback of [...listeners.fileOpenAddFiles]) callback(paths);
		},
	};

	const base = {
		exif: {
			readMetadata: spy((_filePath: string) =>
				notConfigured("exif.readMetadata"),
			),
			removeMetadata: spy((_filePath: string) =>
				notConfigured("exif.removeMetadata"),
			),
		},
		i18n: {
			getLocale: spy(async () => locale),
			getStrings: spy(async () => opts.strings ?? {}),
			onLanguageChanged: spy((callback: (locale: string) => void) =>
				subscribe(listeners.languageChanged, callback),
			),
		},
		files: {
			basename: spy((filePath: string) => basename(filePath)),
			getPathForFile: spy((file: File) => file.name),
			chooseFiles: spy(async (): Promise<string[]> => []),
			chooseFolder: spy(async (): Promise<string | null> => null),
			notifyFilesAdded: spy((_count: number): void => {}),
			notifyFileProcessed: spy((): void => {}),
			notifyAllFilesProcessed: spy((): void => {}),
			onFileOpenAddFiles: spy((callback: (filePaths: string[]) => void) =>
				subscribe(listeners.fileOpenAddFiles, callback),
			),
		},
		theme: {
			get: spy(async () => ({ shouldUseDarkColors: systemDark })),
			set: spy(async (mode: ThemeMode) => {
				const dark = mode === "system" ? systemDark : mode === "dark";
				emit.systemTheme(dark);
				return { success: true };
			}),
			getAccentColor: spy(async () => ({
				color: opts.accentColor ?? "#007AFF",
			})),
			onChanged: spy(
				(callback: (payload: { shouldUseDarkColors: boolean }) => void) =>
					subscribe(listeners.systemTheme, callback),
			),
			onAccentColorChanged: spy(
				(callback: (payload: { color: string }) => void) =>
					subscribe(listeners.accentColor, callback),
			),
			onThemeModeChanged: spy((callback: (mode: ThemeMode) => void) =>
				subscribe(listeners.themeMode, callback),
			),
		},
		settings: {
			get: spy(async () => ({ ...settings })),
			set: spy(async (partial: Partial<Settings>) => {
				settings = { ...settings, ...partial };
				emit.settingsChanged({ ...settings });
				if ("language" in partial) {
					emit.languageChanged(partial.language ?? locale);
				}
				return { success: true, error: null };
			}),
			onChanged: spy((callback: (settings: Settings) => void) =>
				subscribe(listeners.settingsChanged, callback),
			),
			onToggle: spy((callback: () => void) =>
				subscribe(listeners.settingsToggle, callback),
			),
		},
		platform: {
			isMac: opts.isMac ?? true,
		},
		reveal: {
			showInFolder: spy(async (_filePath: string) => ({ success: true })),
			showContextMenu: spy(
				async (_paths: { cleanedPath: string; originalPath: string }) => ({
					success: true,
				}),
			),
		},
		folder: {
			classify: spy((_paths: string[]) => notConfigured("folder.classify")),
			expand: spy((_dirPath: string) => notConfigured("folder.expand")),
		},
	} satisfies Complete<ElectronApi>;

	const api: ElectronApi = {
		exif: { ...base.exif, ...overrides.exif },
		i18n: { ...base.i18n, ...overrides.i18n },
		files: { ...base.files, ...overrides.files },
		theme: { ...base.theme, ...overrides.theme },
		settings: { ...base.settings, ...overrides.settings },
		platform: { ...base.platform, ...overrides.platform },
		reveal: { ...base.reveal, ...overrides.reveal },
		folder: { ...base.folder, ...overrides.folder },
	};

	return {
		api,
		emit,
		clear: () => {
			for (const set of Object.values(listeners)) set.clear();
		},
	};
}
