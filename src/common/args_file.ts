import { withTempFile } from "./temp_file";
import { promises as fs } from "fs";

export async function withArgsTempFile(
	args: string[],
	fn: (argsTempFilePath: string) => Promise<any>
): Promise<any> {
	return withTempFile(tempFilePath => {
		const buffer = args.join("\n");

		fs.writeFile(tempFilePath, buffer);
		return fn(tempFilePath);
	});
}
