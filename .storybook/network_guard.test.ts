import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../tests/helpers/dir_effect";

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

	// WR-01: the allowlist used to match hostname PREFIXES, so a DNS name that merely began
	// with `10.`, `127.`, `192.168.` or `172.16-31.` counted as private and was neither
	// blocked nor logged. These cases never reach the network: a stub installed before the
	// guard replaces the real connect and records every connection the guard let through.
	describe("host allowlist (WR-01)", () => {
		let reachedLog = "";

		beforeEach(() => {
			reachedLog = path.join(tmp, "reached.log");
		});

		function connectTo(hosts: string[]) {
			const stub = path.join(tmp, "connect_stub.mjs");
			writeFileSync(
				stub,
				[
					'import fs from "node:fs";',
					'import net from "node:net";',
					"net.Socket.prototype.connect = function (...args) {",
					"\tconst first = args[0];",
					"\tconst options = Array.isArray(first) ? first[0] : first;",
					"\tfs.appendFileSync(process.env.REACHED_LOG, `REACHED ${options.host}\\n`);",
					"\tprocess.nextTick(() => this.destroy());",
					"\treturn this;",
					"};",
					"",
				].join("\n"),
			);
			const before = snapshotDir(tmp);
			const result = spawnSync(
				process.execPath,
				[
					"--import",
					stub,
					"--import",
					guard,
					"-e",
					`const net = require("node:net");
					for (const host of JSON.parse(process.argv[1])) {
						const socket = new net.Socket();
						socket.on("error", () => {});
						socket.connect({ host, port: 80 });
					}`,
					JSON.stringify(hosts),
				],
				{
					encoding: "utf8",
					env: {
						PATH: process.env["PATH"] ?? "",
						TRACE_LOG: traceLog,
						REACHED_LOG: reachedLog,
					},
					timeout: 60_000,
				},
			);
			expect(result.status, result.stderr).toBe(0);
			const after = snapshotDir(tmp);
			const read = (file: string) =>
				existsSync(file) ? readFileSync(file, "utf8") : "";
			return {
				before,
				after,
				blocked: read(traceLog),
				reached: read(reachedLog),
			};
		}

		test.each([
			"10.evil.example.com",
			"127.0.0.1.attacker.net",
			"192.168.1.evil.org",
			"172.20.attacker.io",
		])("the hostname %s is blocked and logged, never connected", (host) => {
			const { before, after, blocked, reached } = connectTo([host]);
			expect(blocked).toBe(`BLOCKED ${host}\n`);
			expect(reached).toBe("");
			assertDirEffect(before, after, { added: ["trace.log"] });
		});

		test("loopback and private literal addresses and localhost connect and log nothing", () => {
			const hosts = [
				"localhost",
				"127.0.0.1",
				"127.1.2.3",
				"::1",
				"0.0.0.0",
				"10.1.2.3",
				"192.168.0.5",
				"172.16.0.1",
				"172.31.255.255",
			];
			const { before, after, blocked, reached } = connectTo(hosts);
			expect(blocked).toBe("");
			expect(reached).toBe(hosts.map((host) => `REACHED ${host}\n`).join(""));
			assertDirEffect(before, after, { added: ["reached.log"] });
		});

		test("public literal addresses and the edges of the private ranges are blocked and logged", () => {
			const hosts = [
				"172.32.0.1",
				"172.15.255.255",
				"192.169.0.1",
				"11.0.0.1",
				"8.8.8.8",
				"fe80::1",
			];
			const { before, after, blocked, reached } = connectTo(hosts);
			expect(blocked).toBe(hosts.map((host) => `BLOCKED ${host}\n`).join(""));
			expect(reached).toBe("");
			assertDirEffect(before, after, { added: ["trace.log"] });
		});
	});
});
