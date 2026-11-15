import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// PLN-01 spike (76-01): throwaway Vitest config on the unmerged branch spike/76-pln-01.
// The browser factory is copied verbatim from vitest.storybook.config.ts so the capture
// provider is the one VIS-01 will use (D-24): playwright provider, reduced motion, a
// fixed 1280x800 viewport, one headless chromium instance.
const browser = () => ({
	enabled: true,
	headless: true,
	provider: playwright({ contextOptions: { reducedMotion: "reduce" } }),
	viewport: { width: 1280, height: 800 },
	instances: [{ browser: "chromium" as const }],
});

const OUT = path.resolve(process.cwd(), "spike-out");

function ensureOut(): void {
	fs.mkdirSync(OUT, { recursive: true });
}

// A file name inside spike-out only: no separators, no parent hops.
function safeName(name: string): string {
	if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) {
		throw new Error(`unsafe spike file name: ${name}`);
	}
	return name;
}

function readText(file: string): string | null {
	try {
		return fs.readFileSync(file, "utf8");
	} catch {
		return null;
	}
}

// CPU model for the manifest (D-24: log the model so a matching fleet is stated as a
// residual risk rather than claimed as proof): /proc/cpuinfo on Linux, sysctl on macOS,
// then os.cpus() as the last resort.
function cpuModel(): string {
	const cpuinfo = readText("/proc/cpuinfo");
	if (cpuinfo !== null) {
		const named = /^(?:model name|Model Name|Hardware)\s*:\s*(.+)$/m.exec(cpuinfo);
		if (named?.[1]) return named[1].trim();
		const implementer = /^CPU implementer\s*:\s*(\S+)/m.exec(cpuinfo)?.[1];
		const part = /^CPU part\s*:\s*(\S+)/m.exec(cpuinfo)?.[1];
		if (implementer !== undefined && part !== undefined) {
			return `${os.arch()} implementer ${implementer} part ${part}`;
		}
	}
	try {
		const brand = execFileSync("sysctl", ["-n", "machdep.cpu.brand_string"], {
			encoding: "utf8",
		}).trim();
		if (brand !== "") return brand;
	} catch {
		// not macOS
	}
	return `${os.cpus()[0]?.model ?? "unknown"} (${os.arch()})`;
}

function commitSha(): string {
	const fromEnv = process.env["GITHUB_SHA"];
	if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
	try {
		return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	} catch {
		return "local-no-git";
	}
}

function sha256(buffer: Buffer): string {
	return createHash("sha256").update(buffer).digest("hex");
}

// Node-side commands the browser tests call through `commands` from vitest/browser.
const commands = {
	spikeEnv: () => ({
		commit: commitSha(),
		image: process.env["SPIKE_IMAGE"] ?? "host-no-container",
		cpu: cpuModel(),
		lane: process.env["SPIKE_LANE"] ?? "local",
		runnerImage: process.env["ImageOS"] ?? "local",
		runnerVersion: process.env["ImageVersion"] ?? "local",
		arch: os.arch(),
	}),
	spikeWritePng: (_ctx: unknown, name: string, base64: string): string => {
		ensureOut();
		const buffer = Buffer.from(base64, "base64");
		fs.writeFileSync(path.join(OUT, safeName(name)), buffer);
		return sha256(buffer);
	},
	spikeWriteJson: (_ctx: unknown, name: string, value: unknown): void => {
		ensureOut();
		fs.writeFileSync(
			path.join(OUT, safeName(name)),
			`${JSON.stringify(value, null, "\t")}\n`,
		);
	},
	spikeManifestAppend: (_ctx: unknown, row: Record<string, unknown>): number => {
		ensureOut();
		const file = path.join(OUT, "manifest.json");
		const existing = readText(file);
		const rows: unknown[] = existing === null ? [] : JSON.parse(existing);
		rows.push(row);
		fs.writeFileSync(file, `${JSON.stringify(rows, null, "\t")}\n`);
		return rows.length;
	},
};

// Framework-mandated default export (vitest loads this file by default export).
export default defineConfig({
	test: {
		projects: [
			{
				plugins: [react()],
				test: {
					name: "spike",
					include: ["spike/**/*.spike.test.tsx"],
					// The App stories wait on mocked intake chains; LargeBatch alone allows 30 s.
					testTimeout: 180_000,
					hookTimeout: 60_000,
					// One file at a time: the capture and measure files share one document
					// size and one machine, and the plants compare against the same job's control.
					fileParallelism: false,
					browser: { ...browser(), commands },
				},
			},
		],
	},
});
