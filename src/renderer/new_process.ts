import { exiftoolBinPath } from "../common/binaries";
import exiftool from "node-exiftool";

export function newExifToolProcess(): exiftool.ExiftoolProcess {
	const binPath = exiftoolBinPath();
	const process = new exiftool.ExiftoolProcess(binPath);

	return process;
}
