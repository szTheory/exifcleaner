import { defineConfig } from "@playwright/test";

const isCI = process.env["CI"] !== undefined;

export default defineConfig({
	testDir: "./tests/e2e",
	testMatch: "*.spec.ts",
	timeout: 15000,
	retries: 0,
	// The app holds an OS-level single-instance lock, so two workers launching
	// it concurrently would deadlock. This is a constraint, not a tuning knob.
	workers: 1,
	// A stray test.only reports green while silently skipping the rest of the suite.
	forbidOnly: true,
	// "list" so CI logs show which test failed — the HTML report is not
	// readable from a workflow log.
	reporter: isCI
		? [["list"], ["github"], ["html", { open: "never" }]]
		: [["list"], ["html", { open: "never" }]],
	use: {
		trace: "retain-on-failure",
	},
	projects: [
		{
			name: "dev",
			testDir: "./tests/e2e",
			testMatch: "*.spec.ts",
		},
		{
			name: "smoke",
			testDir: "./tests/smoke",
			testMatch: "*.smoke.ts",
			// Cold-starting a packaged bundle on a hosted runner is materially
			// slower than electron-vite dev, and the x64 leg adds Rosetta.
			timeout: 120000,
			// Semantic installed-artifact assertions are never retried. Any needed
			// install/cold-launch stabilization belongs in a separate readiness step.
			retries: 0,
		},
	],
});
