import os from "os";
import { ExiftoolProcess } from "node-exiftool";
import { exiftoolBinPath } from "../common/binaries";

export function spawnExifToolProcesses(
	maxNumProcesses: number
): ExiftoolProcess[] {
	const numProcesses = Math.min(os.cpus().length, maxNumProcesses);

	return [...Array(numProcesses)].map((n) => {
		return newExifToolProcess();
	});
}

function newExifToolProcess(): ExiftoolProcess {
	return new ExiftoolProcess(exiftoolBinPath);
}
