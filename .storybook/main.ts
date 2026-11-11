import type { StorybookConfig } from "@storybook/react-vite";

// D-13: STORYBOOK_OFFLINE_NC=1 swaps the catalog for the planted-request
// fixture only, so .storybook/offline.test.ts can prove its collector sees an
// outbound request. The real build never sets it.
const stories =
	process.env["STORYBOOK_OFFLINE_NC"] === "1"
		? ["./fixtures/offline_planted.stories.tsx"]
		: ["../src/renderer/**/*.stories.@(ts|tsx)"];

const config: StorybookConfig = {
	stories,
	addons: ["@storybook/addon-a11y", "@storybook/addon-vitest"],
	framework: {
		name: "@storybook/react-vite",
		options: {
			builder: { viteConfigPath: ".storybook/vite.config.ts" },
		},
	},
	// D-12 layer 2: telemetry, what's-new and crash reports are off in config too.
	core: {
		disableTelemetry: true,
		disableWhatsNewNotifications: true,
		enableCrashReports: false,
	},
	typescript: { reactDocgen: false },
};

// Framework-mandated default export (Storybook loads main.ts by default export).
export default config;
