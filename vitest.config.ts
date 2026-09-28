import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		root: ".",
		include: ["tests/**/*.test.{ts,tsx}"],
		allowOnly: false,
		// Many contract and integration tests spawn the real ExifTool binary. They finish in
		// under 1.5s alone but exceed vitest's 5s default under full-suite CPU contention.
		// 30s matches ExiftoolProcess's own command timeout.
		testTimeout: 30_000,
	},
});
