import { spawn } from "node:child_process";
import fs from "node:fs";
import { ExiftoolProcess } from "../../../src/infrastructure/exiftool/ExiftoolProcess";
import {
	EXIFCLEANER_PARENT_PID_ENV,
	exiftoolSpawnArgs,
	exiftoolSpawnEnv,
} from "../../../src/infrastructure/exiftool/exiftool_spawn_args";

interface ParentSpec {
	mode: "class" | "raw";
	binPath: string;
	configPath?: string;
	readyFile?: string;
	parentPidEnv?: "self" | string;
	dieBeforeReady?: boolean;
	/** Raw mode: child stdout and stderr go to this file instead of pipes (FIFO write legs). */
	stdoutFile?: string;
	/** Raw mode, needs stdoutFile: after readiness, send a copy-mode write command. */
	inflightWrite?: { source: string; dest: string };
	/** Raw mode, forbids stdoutFile: after readiness, send an overwrite command over this dir. */
	inflightOverwriteDir?: string;
}

function parseSpec(raw: string | undefined): ParentSpec {
	if (raw === undefined) {
		throw new Error("orphan_parent: missing JSON spec argument");
	}
	return JSON.parse(raw) as ParentSpec;
}

async function startClass(spec: ParentSpec): Promise<number> {
	const exiftool =
		spec.configPath === undefined
			? new ExiftoolProcess({ binPath: spec.binPath })
			: new ExiftoolProcess({
					binPath: spec.binPath,
					configPath: spec.configPath,
				});
	const pid = await exiftool.open();
	if (spec.readyFile !== undefined) {
		await exiftool.readMetadata({ filePath: spec.readyFile, args: [] });
	}
	return pid;
}

async function startRaw(spec: ParentSpec): Promise<number> {
	if (spec.inflightWrite !== undefined && spec.stdoutFile === undefined) {
		throw new Error(
			"orphan_parent: inflightWrite requires stdoutFile (a pipe would let a dead-parent SIGPIPE end the child)",
		);
	}
	if (
		spec.inflightOverwriteDir !== undefined &&
		spec.stdoutFile !== undefined
	) {
		throw new Error(
			"orphan_parent: inflightOverwriteDir requires production stdio and forbids stdoutFile",
		);
	}
	const args =
		spec.configPath === undefined
			? ["-stay_open", "True", "-@", "-"]
			: exiftoolSpawnArgs({
					platform: process.platform,
					configPath: spec.configPath,
				});
	const base: NodeJS.ProcessEnv = { ...process.env };
	delete base[EXIFCLEANER_PARENT_PID_ENV];
	let env = base;
	if (spec.parentPidEnv === "self") {
		env = exiftoolSpawnEnv({
			platform: process.platform,
			base,
			parentPid: process.pid,
		});
	} else if (spec.parentPidEnv !== undefined) {
		env = { ...base, [EXIFCLEANER_PARENT_PID_ENV]: spec.parentPidEnv };
	}
	const logFd =
		spec.stdoutFile === undefined
			? undefined
			: fs.openSync(spec.stdoutFile, "w");
	const child = spawn(spec.binPath, args, {
		env,
		stdio: logFd === undefined ? "pipe" : ["pipe", logFd, logFd],
	});
	const stdin = child.stdin;
	if (stdin === null) {
		throw new Error("orphan_parent: raw spawn returned no stdin pipe");
	}
	const childPid = child.pid;
	if (childPid === undefined) {
		throw new Error("orphan_parent: raw spawn returned no pid");
	}
	if (spec.dieBeforeReady === true) {
		console.log(JSON.stringify({ parentPid: process.pid, childPid }));
		process.kill(process.pid, "SIGKILL");
		return childPid;
	}
	await new Promise<void>((resolve, reject) => {
		child.once("error", reject);
		if (spec.stdoutFile !== undefined) {
			const file = spec.stdoutFile;
			const deadline = Date.now() + 15_000;
			const poll = setInterval(() => {
				if (fs.readFileSync(file, "utf8").includes("{ready}")) {
					clearInterval(poll);
					resolve();
				} else if (Date.now() > deadline) {
					clearInterval(poll);
					reject(
						new Error("orphan_parent: no {ready} in stdoutFile within 15 s"),
					);
				}
			}, 20);
		} else {
			const stdout = child.stdout;
			if (stdout === null) {
				reject(new Error("orphan_parent: raw spawn returned no stdout pipe"));
				return;
			}
			let seen = "";
			stdout.setEncoding("utf8");
			stdout.on("data", (chunk: string) => {
				seen += chunk;
				if (seen.includes("{ready}")) {
					resolve();
				}
			});
		}
		stdin.write("-ver\n-execute\n");
	});
	if (spec.inflightWrite !== undefined) {
		const { source, dest } = spec.inflightWrite;
		stdin.write(`-all=\n-o\n${dest}\n${source}\n-execute\n`);
	}
	if (spec.inflightOverwriteDir !== undefined) {
		stdin.write(
			`-all=\n-overwrite_original\n${spec.inflightOverwriteDir}\n-execute\n`,
		);
	}
	return childPid;
}

async function main(): Promise<void> {
	const spec = parseSpec(process.argv[2]);
	const childPid =
		spec.mode === "class" ? await startClass(spec) : await startRaw(spec);
	console.log(JSON.stringify({ parentPid: process.pid, childPid }));
	setInterval(() => undefined, 60_000);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.stack : String(error));
	process.exit(1);
});
