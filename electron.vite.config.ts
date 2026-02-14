import { defineConfig } from "electron-vite";

export default defineConfig({
	main: {
		build: {
			rollupOptions: {
				external: ["electron"],
			},
		},
	},
	preload: {},
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
