import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		root: ".",
		include: ["tests/**/*.test.{ts,tsx}"],
		allowOnly: false,
		// LIF-01 / D-08: fail the run if any exiftool -stay_open child outlives it.
		globalSetup: ["tests/global/exiftool_leftovers.global_setup.ts"],
		// Many contract and integration tests spawn the real ExifTool binary. They finish in
		// under 1.5s alone but exceed vitest's 5s default under full-suite CPU contention.
		// 30s matches ExiftoolProcess's own command timeout.
		testTimeout: 30_000,
	},
});
