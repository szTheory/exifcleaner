import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const guard = path.resolve(import.meta.dirname, "network_guard.mjs");

describe("network_guard.mjs (D-12 layer 3)", () => {
	let tmp = "";
	let traceLog = "";

	beforeEach(() => {
		tmp = mkdtempSync(path.join(os.tmpdir(), "network-guard-test-"));
		traceLog = path.join(tmp, "trace.log");
	});

	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	// Only PATH and TRACE_LOG are passed: no inherited NODE_OPTIONS, so the guard
	// under test is the one named by --import and nothing else.
	function runNode(script: string) {
		return spawnSync(process.execPath, ["--import", guard, "-e", script], {
			encoding: "utf8",
			env: { PATH: process.env["PATH"] ?? "", TRACE_LOG: traceLog },
			timeout: 60_000,
		});
	}

	test("a fetch to storybook.js.org fails and writes exactly one BLOCKED line", () => {
		const result = runNode(
			"fetch('https://storybook.js.org/').then(() => process.exit(0), () => process.exit(3))",
		);
		expect(result.status).toBe(3);
		expect(readFileSync(traceLog, "utf8")).toBe("BLOCKED storybook.js.org\n");
	});

	test("a loopback request succeeds and writes nothing", () => {
		const result = runNode(`
			const http = require("node:http");
			const server = http.createServer((_req, res) => res.end("ok"));
			server.listen(0, "127.0.0.1", async () => {
				try {
					const response = await fetch("http://127.0.0.1:" + server.address().port + "/");
					process.exitCode = (await response.text()) === "ok" ? 0 : 4;
				} catch {
					process.exitCode = 5;
				}
				server.close();
			});
		`);
		expect(result.status).toBe(0);
		expect(existsSync(traceLog) ? readFileSync(traceLog, "utf8") : "").toBe("");
	});
});
