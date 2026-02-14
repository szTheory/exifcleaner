import { defineConfig } from "electron-vite";
import { builtinModules } from "module";

// Externalize Node.js builtins in the renderer.
// Temporary: the renderer uses nodeIntegration: true and imports
// Node/Electron modules directly. Chunk 3 (Electron upgrade) will
// introduce a preload script and remove this workaround.
const nodeBuiltins = [
	...builtinModules,
	...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig({
	main: {
		build: {
			rollupOptions: {
				external: ["electron"],
			},
		},
	},
	renderer: {
		build: {
			rollupOptions: {
				external: ["electron", ...nodeBuiltins, "node-exiftool"],
				output: {
					format: "es",
				},
			},
		},
	},
});
