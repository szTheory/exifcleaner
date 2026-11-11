import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dedicated Storybook build config: the React plugin only. The app's own
// build config carries CSP and file-protocol plugins that must not apply here.
// Framework-mandated default export (Vite loads this file by default export).
export default defineConfig({
	plugins: [react()],
});
