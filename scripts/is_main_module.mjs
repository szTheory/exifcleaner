// Entry-point guard shared by the CLI gate scripts.
//
//   if (isMainModule(import.meta.url)) { ... run the CLI ... }
//
// Comparing `process.argv[1]` with `fileURLToPath(import.meta.url)` is false whenever the script
// is started through a symlinked path: Node leaves argv[1] as the path it was given while
// import.meta.url is the realpath. The CLI then silently never ran and the process exited 0
// (Phase 70 review WR-02), which for an integrity gate is a fail-open. Comparing real paths
// makes the guard false only when the module was imported rather than started.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * @param {string} moduleUrl the caller's `import.meta.url`
 * @param {readonly string[]} [argv] defaults to `process.argv`; element 1 is the started script path
 * @returns {boolean}
 */
export function isMainModule(moduleUrl, argv = process.argv) {
	const argv1 = argv[1];
	if (typeof argv1 !== "string" || argv1 === "") {
		return false;
	}
	try {
		return (
			fs.realpathSync.native(argv1) ===
			fs.realpathSync.native(fileURLToPath(moduleUrl))
		);
	} catch (error) {
		// A started path that does not exist cannot be this module. Anything else is a real
		// fault and must not be read as "imported, so skip the CLI".
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}
		throw error;
	}
}
