import { promises as fs } from "fs";
import os from "os";
import path from "path";

// wrap a function around a valid tempfile path that
// will be cleaned up when the function teminates
export async function withTempFile(
	fn: (tempFilePath: string) => any
): Promise<any> {
	return withTempDir(dir => {
		const tempFilePath = path.join(dir, "file");

		return fn(tempFilePath);
	});
}

// wrap a function around a tempdir that is automatically
// created for the duration of the function and cleaned up
// after when the function terminates
async function withTempDir(fn: (tempDirPath: string) => any): Promise<any> {
	// create tempdir
	const tempDirPath = await fs.mkdtemp(
		(await fs.realpath(os.tmpdir())) + path.sep
	);

	try {
		// call wrapper function
		return await fn(tempDirPath);
	} finally {
		// cleanup
		fs.rmdir(tempDirPath, { recursive: true });
	}
}
