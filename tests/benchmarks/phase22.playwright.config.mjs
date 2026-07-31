import { defineConfig } from "@playwright/test";

export default defineConfig({ testDir: ".", testMatch: "jpeg_batch.spec.ts", workers: 1, retries: 0, repeatEach: 1, reporter: "line", timeout: 120000, use: { trace: "off" } });
