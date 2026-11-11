import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
	stories: ["../src/renderer/**/*.stories.@(ts|tsx)"],
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
