import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// SBK-01 / D-13: the built catalog makes no outbound request. Both catalogs are
// built fresh on every run (never trusted from disk), served from 127.0.0.1,
// and every story is opened in Chromium with every non-local request aborted.
// The planted build is the negative control: the same collector must see
// exactly one outbound request there.

const repoRoot = path.resolve(import.meta.dirname, "..");
const guard = path.resolve(import.meta.dirname, "network_guard.mjs");
const REAL_DIR = path.join(repoRoot, "storybook-static");
const PLANTED_DIR = path.join(repoRoot, "storybook-static-nc");
const LOCAL_HOST = "127.0.0.1";

const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".png": "image/png",
};

const storybookBin = (() => {
	const require = createRequire(import.meta.url);
	const pkgPath = require.resolve("storybook/package.json");
	const pkg: unknown = JSON.parse(readFileSync(pkgPath, "utf8"));
	const bin =
		typeof pkg === "object" && pkg !== null
			? Object.entries(pkg).find(([key]) => key === "bin")?.[1]
			: undefined;
	// `bin` is a single path string here; a name-to-path map is also accepted.
	const entry =
		typeof bin === "string"
			? bin
			: typeof bin === "object" && bin !== null
				? Object.entries(bin).find(([key]) => key === "storybook")?.[1]
				: undefined;
	if (typeof entry !== "string") {
		throw new Error("storybook/package.json bin has no storybook entry");
	}
	return path.resolve(path.dirname(pkgPath), entry);
})();

let tmp = "";
const guardLogs = { real: "", planted: "" };

function buildCatalog(args: { outDir: string; planted: boolean; log: string }) {
	rmSync(args.outDir, { recursive: true, force: true });
	const result = spawnSync(
		process.execPath,
		[storybookBin, "build", "-o", args.outDir, "--quiet"],
		{
			cwd: repoRoot,
			encoding: "utf8",
			timeout: 170_000,
			// Only what the build needs: no inherited NODE_OPTIONS or tokens.
			env: {
				PATH: process.env["PATH"] ?? "",
				HOME: process.env["HOME"] ?? "",
				STORYBOOK_DISABLE_TELEMETRY: "true",
				CI: "true",
				NODE_OPTIONS: `--import=${guard}`,
				TRACE_LOG: args.log,
				...(args.planted ? { STORYBOOK_OFFLINE_NC: "1" } : {}),
			},
		},
	);
	expect(result.status, result.stderr).toBe(0);
	expect(existsSync(path.join(args.outDir, "index.json"))).toBe(true);
}

function serve(dir: string): Promise<http.Server> {
	const server = http.createServer((request, response) => {
		const pathname = decodeURIComponent(
			new URL(request.url ?? "/", `http://${LOCAL_HOST}`).pathname,
		);
		const file = path.join(dir, pathname === "/" ? "index.html" : pathname);
		if (
			!file.startsWith(dir + path.sep) ||
			!existsSync(file) ||
			!statSync(file).isFile()
		) {
			response.writeHead(404).end();
			return;
		}
		const type =
			Object.entries(CONTENT_TYPES).find(
				([ext]) => ext === path.extname(file),
			)?.[1] ?? "application/octet-stream";
		response.writeHead(200, { "content-type": type });
		response.end(readFileSync(file));
	});
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, LOCAL_HOST, () => resolve(server));
	});
}

function storyIdsFrom(dir: string): string[] {
	const index: unknown = JSON.parse(
		readFileSync(path.join(dir, "index.json"), "utf8"),
	);
	const entries =
		typeof index === "object" && index !== null
			? Object.entries(index).find(([key]) => key === "entries")?.[1]
			: undefined;
	if (typeof entries !== "object" || entries === null) return [];
	return Object.values(entries).flatMap((entry) => {
		if (typeof entry !== "object" || entry === null) return [];
		const fields = Object.fromEntries(Object.entries(entry));
		return fields["type"] === "story" && typeof fields["id"] === "string"
			? [fields["id"]]
			: [];
	});
}

// Opens every story of a built catalog with the network cut and reports what
// tried to leave: aborted non-local requests, websockets, and the anti-vacuity
// counts (local requests served, story roots that stayed empty).
async function collectOutbound(dir: string) {
	const server = await serve(dir);
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("static server has no port");
	}
	const origin = `http://${LOCAL_HOST}:${address.port}`;
	const browser = await chromium.launch({
		args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${LOCAL_HOST}`],
	});
	const outbound: string[] = [];
	let localRequests = 0;
	const emptyRoots: string[] = [];
	const storyIds = storyIdsFrom(dir);
	try {
		const context = await browser.newContext({ reducedMotion: "reduce" });
		await context.route("**/*", (route) => {
			const url = new URL(route.request().url());
			if (url.hostname !== LOCAL_HOST) {
				outbound.push(url.href);
				return route.abort();
			}
			localRequests += 1;
			return route.continue();
		});
		for (const id of storyIds) {
			const page = await context.newPage();
			page.on("websocket", (socket) => outbound.push(`ws:${socket.url()}`));
			await page.goto(
				`${origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`,
			);
			try {
				await page.waitForFunction(
					() => {
						const root = document.querySelector("#storybook-root");
						return root !== null && root.children.length > 0;
					},
					undefined,
					{ timeout: 30_000 },
				);
			} catch {
				emptyRoots.push(id);
			}
			// Give a post-render effect (the planted fetch) time to be attempted.
			await page.waitForTimeout(500);
			await page.close();
		}
		await context.close();
	} finally {
		await browser.close();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
	return { outbound, localRequests, storyIds, emptyRoots };
}

function dedupe(values: string[]): string[] {
	return [...new Set(values)];
}

function readLog(file: string): string {
	return existsSync(file) ? readFileSync(file, "utf8") : "";
}

describe("offline static catalog (SBK-01, D-13)", () => {
	let real: Awaited<ReturnType<typeof collectOutbound>>;
	let planted: Awaited<ReturnType<typeof collectOutbound>>;

	beforeAll(async () => {
		tmp = mkdtempSync(path.join(os.tmpdir(), "offline-proof-"));
		guardLogs.real = path.join(tmp, "real.log");
		guardLogs.planted = path.join(tmp, "planted.log");
		buildCatalog({ outDir: REAL_DIR, planted: false, log: guardLogs.real });
		buildCatalog({
			outDir: PLANTED_DIR,
			planted: true,
			log: guardLogs.planted,
		});
		real = await collectOutbound(REAL_DIR);
		planted = await collectOutbound(PLANTED_DIR);
		// Recorded for the phase evidence (read from the test output).
		console.log(
			`offline real: stories=${JSON.stringify(real.storyIds)} outbound=${JSON.stringify(dedupe(real.outbound))} local=${real.localRequests}`,
		);
		console.log(
			`offline planted: stories=${JSON.stringify(planted.storyIds)} outbound=${JSON.stringify(dedupe(planted.outbound))} local=${planted.localRequests}`,
		);
	});

	afterAll(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	test("the real catalog makes no outbound request", () => {
		expect(real.storyIds.length).toBeGreaterThanOrEqual(3);
		expect(real.storyIds.filter((id) => id.startsWith("fixtures-"))).toEqual(
			[],
		);
		expect(dedupe(real.outbound)).toEqual([]);
	});

	test("the real run is not vacuous: pages loaded and every story rendered", () => {
		expect(real.localRequests).toBeGreaterThan(0);
		expect(real.emptyRoots).toEqual([]);
	});

	test("the real build's network guard log is empty", () => {
		expect(readLog(guardLogs.real)).toBe("");
	});

	test("the planted catalog is caught: exactly one outbound request", () => {
		expect(planted.storyIds).toEqual(["fixtures-offlineplanted--planted"]);
		expect(planted.localRequests).toBeGreaterThan(0);
		expect(planted.emptyRoots).toEqual([]);
		expect(dedupe(planted.outbound)).toEqual(["http://planted.invalid/"]);
	});
});
