import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	testMatch: "*.spec.ts",
	timeout: 10000,
	retries: 0,
	workers: 1,
	reporter: [["html", { open: "never" }]],
	use: {
		trace: "retain-on-failure",
	},
});
