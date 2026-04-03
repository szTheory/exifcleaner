import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

// Strip crossorigin attributes from script/link tags in production builds.
// Vite adds crossorigin by default for ES modules, but on file:// protocol
// in packaged Electron apps, crossorigin can cause silent loading failures.
function removeCrossOriginPlugin(): Plugin {
	return {
		name: "remove-crossorigin",
		enforce: "post",
		transformIndexHtml(html) {
			return html.replace(/ crossorigin/g, "");
		},
	};
}

function cspPlugin(): Plugin {
	return {
		name: "html-csp",
		transformIndexHtml(_html, ctx) {
			const isDev = ctx.server !== undefined;
			const scriptSrc = isDev
				? "'self' 'unsafe-inline'"
				: "'self'";
			const styleSrc = isDev ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline'";
			const connectSrc = isDev ? "'self' ws://localhost:*" : "'self'";
			return [
				{
					tag: "meta",
					attrs: {
						"http-equiv": "Content-Security-Policy",
						content: `default-src 'none'; script-src ${scriptSrc}; style-src ${styleSrc}; img-src 'self' data:; font-src 'self'; connect-src ${connectSrc}; base-uri 'none'; frame-ancestors 'none'`,
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
		plugins: [react(), cspPlugin(), removeCrossOriginPlugin()],
		build: {
			rollupOptions: {
				output: {
					format: "es",
				},
			},
		},
	},
});
