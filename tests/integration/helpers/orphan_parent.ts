import { spawn } from "node:child_process";
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
	const child = spawn(spec.binPath, args, { env });
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
		let seen = "";
		child.once("error", reject);
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			seen += chunk;
			if (seen.includes("{ready}")) {
				resolve();
			}
		});
		child.stdin.write("-ver\n-execute\n");
	});
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
