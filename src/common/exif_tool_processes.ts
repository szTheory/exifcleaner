import os from "os";
import { ExiftoolProcess } from "node-exiftool";
import { exiftoolBinPath } from "../common/binaries.js";

export function spawnExifToolProcesses(
	maxNumProcesses: number
): ExiftoolProcess[] {
	const numProcesses = Math.min(os.cpus().length, maxNumProcesses);

	return [...Array(numProcesses)].map((_n) => {
		return newExifToolProcess();
	});
}

function newExifToolProcess(): ExiftoolProcess {
	return new ExiftoolProcess(exiftoolBinPath);
}
