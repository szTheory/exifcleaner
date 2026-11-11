import react from "@vitejs/plugin-react";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Storybook's own vitest config (the root vitest.config.ts stays untouched so
// `yarn test` is unchanged). Every browser project must get its browser config
// from this factory: sharing one object across projects makes vitest fail with
// "Cannot define a nested project for a chromium browser". Reduced motion plus
// a fixed viewport keep scans and screenshots deterministic.
const browser = () => ({
	enabled: true,
	headless: true,
	provider: playwright({ contextOptions: { reducedMotion: "reduce" } }),
	viewport: { width: 1280, height: 800 },
	instances: [{ browser: "chromium" as const }],
});

// Light and dark differ only by the `theme` global; the stories are the same.
const THEMES = ["light", "dark"] as const;

// Framework-mandated default export (vitest loads this file by default export).
export default defineConfig({
	test: {
		projects: [
			...THEMES.map((theme) => ({
				plugins: [
					react(),
					storybookTest({
						configDir: ".storybook",
						initialGlobals: { theme },
					}),
				],
				test: { name: `storybook-${theme}`, browser: browser() },
			})),
			{
				test: {
					name: "storybook-node",
					environment: "node",
					include: [".storybook/**/*.test.ts"],
					allowOnly: false,
					testTimeout: 120_000,
					hookTimeout: 180_000,
				},
			},
		],
	},
});
