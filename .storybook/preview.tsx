import { useContext } from "react";
import type { ReactNode } from "react";
import type { Preview } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { createMockApi } from "../tests/fakes/mock_window_api";
import type { MockApiOverrides } from "../tests/fakes/mock_window_api";
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

function themeOf(globals: Record<string, unknown>): "light" | "dark" {
	return globals["theme"] === "dark" ? "dark" : "light";
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
	},
	initialGlobals: { theme: "light" },
	beforeEach: async (ctx) => {
		const theme = themeOf(ctx.globals);
		const raw = ctx.parameters["mockApi"];
		const parameter: MockApiParameter = isMockApiParameter(raw) ? raw : {};
		const mock = createMockApi(parameter.overrides, {
			systemDark: parameter.systemDark ?? theme === "dark",
			...(parameter.settings === undefined
				? {}
				: { settings: parameter.settings }),
			locale: "en",
			strings: {},
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
	decorators: [
		(Story, ctx) => {
			const theme = themeOf(ctx.globals);
			const raw = ctx.parameters["mockApi"];
			const gate = isMockApiParameter(raw) ? raw.gate !== false : true;
			// The key remounts the providers when a toolbar global changes: the
			// mock is rebuilt then, and a mounted provider keeps subscriptions on
			// the old one. The real ThemeProvider is the only writer of data-theme.
			return (
				<ThemeProvider key={`${theme}:en`}>
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
