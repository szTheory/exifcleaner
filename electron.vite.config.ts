import { defineConfig } from "electron-vite";

export default defineConfig({
	main: {
		build: {
			rollupOptions: {
				external: ["electron"],
			},
		},
	},
	preload: {
		build: {
			rollupOptions: {
				output: {
					format: "cjs",
				},
			},
		},
	},
	renderer: {
		build: {
			rollupOptions: {
				output: {
					format: "es",
				},
			},
		},
	},
});
