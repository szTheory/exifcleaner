import { useContext } from "react";
import type { ReactNode } from "react";
import type { Preview } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { createMockApi } from "../tests/fakes/mock_window_api";
import type { MockApiOverrides } from "../tests/fakes/mock_window_api";
import { Locale } from "../src/domain/i18n/i18n_lookup";
import type { Settings } from "../src/domain/settings_schema";
import {
	I18nContext,
	I18nProvider,
} from "../src/renderer/contexts/I18nContext";
import {
	ThemeContext,
	ThemeProvider,
} from "../src/renderer/contexts/ThemeContext";
import "../src/renderer/styles/reset.css";
import "../src/renderer/styles/tokens.css";
import "../src/renderer/styles/app.css";
import "../src/renderer/styles/drop_zone.css";
import "../src/renderer/styles/empty_state.css";
import "../src/renderer/styles/error_boundary.css";
import "../src/renderer/styles/file_list.css";
import "../src/renderer/styles/file_table.css";
import "../src/renderer/styles/folder_row.css";
import "../src/renderer/styles/status_bar.css";
import "../src/renderer/styles/status_icon.css";
import "../src/renderer/styles/toast.css";
import "../src/renderer/styles/type_pill.css";
import "./harness.css";
import copyLintRules from "./catalog/copy_lint_rules.json";
import copyFindings from "./catalog/copy-findings.json";
import glossary from "./catalog/glossary.json";
import { buildRuleset, excusedTemplates } from "./catalog/copy_lint.mjs";
import { collectCopyUnits, copyLintHits } from "./catalog/copy_lint_dom";
import { LOCALE_DICTIONARY } from "./locale_dictionary";

// `parameters.mockApi` of a story: what the mock starts with. `gate: false`
// renders the story before the providers finish loading (loading-state stories).
export type MockApiParameter = {
	overrides?: MockApiOverrides;
	settings?: Partial<Settings>;
	systemDark?: boolean;
	gate?: boolean;
};

function isOptional(value: unknown, type: "object" | "boolean"): boolean {
	return (
		value === undefined ||
		(type === "object"
			? typeof value === "object" && value !== null
			: typeof value === "boolean")
	);
}

export function isMockApiParameter(value: unknown): value is MockApiParameter {
	if (typeof value !== "object" || value === null) return false;
	const fields = new Map(Object.entries(value));
	return (
		isOptional(fields.get("overrides"), "object") &&
		isOptional(fields.get("settings"), "object") &&
		isOptional(fields.get("systemDark"), "boolean") &&
		isOptional(fields.get("gate"), "boolean")
	);
}

// Waits until both providers have read their data, so a story (and an
// accessibility scan) never sees the loading state.
function ReadyGate({
	enabled,
	children,
}: {
	enabled: boolean;
	children: ReactNode;
}): React.JSX.Element | null {
	const theme = useContext(ThemeContext);
	const i18n = useContext(I18nContext);
	if (enabled && (theme.isLoading || i18n.isLoading)) return null;
	return <>{children}</>;
}

// `parameters.copyLint` of a story: substrings of the rendered text that are
// data, not copy (a user's file name), stripped before the lint. Nothing else
// is read from it, so there is no way to turn the lint off for a story.
export type CopyLintParameter = { fixtureText?: string[] | undefined };

export function isCopyLintParameter(
	value: unknown,
): value is CopyLintParameter {
	if (typeof value !== "object" || value === null) return false;
	const fixtureText = new Map(Object.entries(value)).get("fixtureText");
	return (
		fixtureText === undefined ||
		(Array.isArray(fixtureText) &&
			fixtureText.every((text) => typeof text === "string"))
	);
}

// Built once per module load: the rules plus the glossary-derived vocabulary.
const COPY_RULESET = buildRuleset(copyLintRules, glossary);

// The English strings come from the one dictionary the stories already load,
// never a second copy. A rendered unit that is exactly a baselined en string
// (statusBar.tagsRemoved, say) is excused; anything else still fails.
const ENGLISH_STRINGS: Record<string, string> = Object.fromEntries(
	Object.entries(LOCALE_DICTIONARY).flatMap(([key, locales]) => {
		const text = locales["en"];
		return text === undefined ? [] : [[key, text]];
	}),
);
const EXCUSED_TEMPLATES = excusedTemplates(copyFindings, ENGLISH_STRINGS);

function themeOf(globals: Record<string, unknown>): "light" | "dark" {
	return globals["theme"] === "dark" ? "dark" : "light";
}

function localeOf(globals: Record<string, unknown>): string {
	const value = globals["locale"];
	return typeof value === "string" ? value : "en";
}

const preview: Preview = {
	globalTypes: {
		theme: {
			description: "Theme the real ThemeProvider resolves from the mock",
			toolbar: {
				title: "Theme",
				icon: "circlehollow",
				items: [
					{ value: "light", title: "Light" },
					{ value: "dark", title: "Dark" },
				],
			},
		},
		locale: {
			description: "Locale the real I18nProvider resolves from the mock",
			toolbar: {
				title: "Locale",
				icon: "globe",
				items: Object.values(Locale).map((value) => ({ value, title: value })),
			},
		},
	},
	initialGlobals: { theme: "light", locale: "en" },
	// Accessibility violations fail the story (D-27). color-contrast stays on.
	parameters: { a11y: { test: "error" } },
	beforeEach: async (ctx) => {
		const theme = themeOf(ctx.globals);
		const raw = ctx.parameters["mockApi"];
		const parameter: MockApiParameter = isMockApiParameter(raw) ? raw : {};
		const mock = createMockApi(parameter.overrides, {
			systemDark: parameter.systemDark ?? theme === "dark",
			...(parameter.settings === undefined
				? {}
				: { settings: parameter.settings }),
			locale: localeOf(ctx.globals),
			strings: LOCALE_DICTIONARY,
			spy: (f) => fn(f),
		});
		window.api = mock.api;
		// The providers never reset these, so every run (and re-run) does.
		return () => {
			Reflect.deleteProperty(window, "api");
			const html = document.documentElement;
			html.removeAttribute("data-theme");
			html.removeAttribute("lang");
			html.removeAttribute("dir");
			html.style.removeProperty("--ec-color-accent");
			html.classList.remove("theme-transitioning");
			mock.clear();
		};
	},
	// D-12: every English story is linted for brand copy after it renders. A
	// thrown error is what fails a story (a report entry does not).
	afterEach: async (ctx) => {
		if (ctx.viewMode !== "story" || localeOf(ctx.globals) !== "en") return;
		const raw = ctx.parameters["copyLint"];
		const fixtureText =
			isCopyLintParameter(raw) && raw.fixtureText !== undefined
				? raw.fixtureText
				: [];
		const hits = copyLintHits(collectCopyUnits(document.body), COPY_RULESET, {
			fixtureText,
			templates: EXCUSED_TEMPLATES,
		});
		if (hits.length > 0) {
			throw new Error(
				hits
					.map(
						(hit) => `${ctx.id}: ${hit.ruleId} "${hit.match}" in ${hit.text}`,
					)
					.join("\n"),
			);
		}
	},
	decorators: [
		(Story, ctx) => {
			const theme = themeOf(ctx.globals);
			const locale = localeOf(ctx.globals);
			const raw = ctx.parameters["mockApi"];
			const gate = isMockApiParameter(raw) ? raw.gate !== false : true;
			// The key remounts the providers when a toolbar global changes: the
			// mock is rebuilt then, and a mounted provider keeps subscriptions on
			// the old one. The real providers are the only writers of data-theme, lang and dir.
			return (
				<ThemeProvider key={`${theme}:${locale}`}>
					<I18nProvider>
						<ReadyGate enabled={gate}>
							<Story />
						</ReadyGate>
					</I18nProvider>
				</ThemeProvider>
			);
		},
	],
};

// Framework-mandated default export (Storybook loads preview.tsx by default export).
export default preview;
