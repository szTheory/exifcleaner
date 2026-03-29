import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

function cspPlugin(): Plugin {
	return {
		name: "html-csp",
		transformIndexHtml(_html, ctx) {
			const isDev = ctx.server !== undefined;
			const connectSrc = isDev ? "'self' ws://localhost:*" : "'self'";
			return [
				{
					tag: "meta",
					attrs: {
						"http-equiv": "Content-Security-Policy",
						content: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src ${connectSrc}; base-uri 'none'; frame-ancestors 'none'`,
					},
					injectTo: "head-prepend",
				},
			];
		},
	};
}

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
		plugins: [react(), cspPlugin()],
		build: {
			rollupOptions: {
				output: {
					format: "es",
				},
			},
		},
	},
});
