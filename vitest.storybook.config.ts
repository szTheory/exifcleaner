import { defineConfig } from "vitest/config";

// Storybook's own vitest config (the root vitest.config.ts stays untouched so
// `yarn test` is unchanged). Browser projects are added in 70-04; each must get
// its browser config from a factory function (a shared object makes vitest
// fail with "Cannot define a nested project for a chromium browser"), and the
// a11y gate project sets VITEST_STORYBOOK=false so axe failures throw.
// Framework-mandated default export (vitest loads this file by default export).
export default defineConfig({
	test: {
		projects: [
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
