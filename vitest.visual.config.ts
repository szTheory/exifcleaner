import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import type { BrowserCommandContext } from "vitest/node";

const OUTPUT_DIR = path.resolve(
	process.env["EXIFCLEANER_VISUAL_OUTPUT_DIR"] ??
		path.join(os.tmpdir(), "exifcleaner-visual-capture"),
);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function ensureOutputIsExternal(): void {
	const repository = fs.realpathSync(process.cwd());
	const relative = path.relative(repository, OUTPUT_DIR);
	if (
		relative === "" ||
		(relative !== ".." &&
			!relative.startsWith(`..${path.sep}`) &&
			!path.isAbsolute(relative))
	) {
		throw new Error("visual capture output must be outside the repository");
	}
	fs.mkdirSync(OUTPUT_DIR, { recursive: true });
	const resolvedOutput = fs.realpathSync(OUTPUT_DIR);
	const resolvedRelative = path.relative(repository, resolvedOutput);
	if (
		resolvedRelative === "" ||
		(resolvedRelative !== ".." &&
			!resolvedRelative.startsWith(`..${path.sep}`) &&
			!path.isAbsolute(resolvedRelative))
	) {
		throw new Error(
			"visual capture output must resolve outside the repository",
		);
	}
}

function safeName(name: string): string {
	if (
		name !== path.basename(name) ||
		!/^[A-Za-z0-9._-]+$/u.test(name) ||
		name.includes("..")
	) {
		throw new Error(`unsafe visual artifact filename: ${name}`);
	}
	return name;
}

function dimensions(png: Buffer): { width: number; height: number } {
	if (
		png.length < 24 ||
		!png.subarray(0, 8).equals(PNG_SIGNATURE) ||
		png.toString("ascii", 12, 16) !== "IHDR"
	) {
		throw new Error("capture is not a valid PNG with an IHDR header");
	}
	return {
		width: png.readUInt32BE(16),
		height: png.readUInt32BE(20),
	};
}

function commitSha(): string {
	const supplied = process.env["GITHUB_SHA"];
	if (supplied !== undefined && /^[0-9a-f]{40}$/u.test(supplied))
		return supplied;
	return execFileSync("git", ["rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim();
}

function visualReadBaseline(name: string): { sha256: string; base64: string } {
	const filename = safeName(name);
	const contractPath = path.join(
		process.cwd(),
		".storybook/visual-baselines.json",
	);
	const contract = JSON.parse(fs.readFileSync(contractPath, "utf8")) as {
		baselines?: Record<string, { path?: string; sha256?: string }>;
	};
	const record = contract.baselines?.[filename];
	const expectedPath = path.posix.join("visual-baselines", filename);
	if (
		record === undefined ||
		record.path !== expectedPath ||
		typeof record.sha256 !== "string" ||
		!/^[a-f0-9]{64}$/u.test(record.sha256)
	) {
		throw new Error(
			"no source-bound visual baseline is declared for " + filename,
		);
	}
	const directory = path.join(process.cwd(), ".storybook/visual-baselines");
	const directoryStat = fs.lstatSync(directory);
	if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
		throw new Error("visual baseline directory must be a real directory");
	}
	const baselinePath = path.join(directory, filename);
	const stat = fs.lstatSync(baselinePath);
	if (!stat.isFile() || stat.isSymbolicLink()) {
		throw new Error("visual baseline must be a regular PNG file: " + filename);
	}
	const png = fs.readFileSync(baselinePath);
	const sha256 = createHash("sha256").update(png).digest("hex");
	if (sha256 !== record.sha256) {
		throw new Error("visual baseline hash mismatch: " + filename);
	}
	dimensions(png);
	return { sha256, base64: png.toString("base64") };
}

const commands = {
	visualEnv: (
		_ctx: BrowserCommandContext,
		browser: string,
		deviceScaleFactor: number,
	) => ({
		commit: commitSha(),
		ref: process.env["GITHUB_REF"] ?? "local",
		runId: process.env["GITHUB_RUN_ID"] ?? "0",
		runAttempt: process.env["GITHUB_RUN_ATTEMPT"] ?? "0",
		image: process.env["EXIFCLEANER_VISUAL_IMAGE"] ?? "local-unpinned",
		runner: process.env["EXIFCLEANER_VISUAL_RUNNER"] ?? "local",
		architecture: os.arch(),
		platform: process.platform,
		node: process.version,
		browser,
		deviceScaleFactor,
		capturedAt: new Date().toISOString(),
	}),
	visualWritePng: (
		_ctx: BrowserCommandContext,
		name: string,
		base64: string,
	): { sha256: string; width: number; height: number; bytes: number } => {
		ensureOutputIsExternal();
		const png = Buffer.from(base64, "base64");
		const size = dimensions(png);
		fs.writeFileSync(path.join(OUTPUT_DIR, safeName(name)), png, {
			flag: "wx",
		});
		return {
			sha256: createHash("sha256").update(png).digest("hex"),
			...size,
			bytes: png.length,
		};
	},
	visualWriteManifest: (
		_ctx: BrowserCommandContext,
		manifest: unknown,
	): void => {
		ensureOutputIsExternal();
		fs.writeFileSync(
			path.join(OUTPUT_DIR, "manifest.json"),
			`${JSON.stringify(manifest, null, "\t")}\n`,
			{ flag: "wx" },
		);
	},
	visualReadBaseline: (
		_ctx: BrowserCommandContext,
		name: string,
	): { sha256: string; base64: string } => visualReadBaseline(name),
};

const browser = () => ({
	enabled: true,
	headless: true,
	provider: playwright({ contextOptions: { reducedMotion: "reduce" } }),
	viewport: { width: 1280, height: 800 },
	instances: [{ browser: "chromium" as const }],
});

export default defineConfig({
	plugins: [react()],
	test: {
		include: ["tests/visual/visual_capture.test.tsx"],
		fileParallelism: false,
		testTimeout: 900_000,
		hookTimeout: 60_000,
		browser: { ...browser(), commands },
	},
});
