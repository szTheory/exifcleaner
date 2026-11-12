// Side-effect module, imported first by catalog.mjs.
//
// Importing the Storybook CSF parser (story_index.mjs) makes Storybook create
// `node_modules/.cache/storybook/<version>/default/dev-server` under the
// current directory when that directory is not a package root (a temp
// catalog repository in a test, or any bare checkout of the CHECK_INPUTS). A
// check must not write into the tree it checks, so this redirects that cache
// to the OS temp directory unless the caller chose a location. In the real
// repository (a package.json in the current directory) nothing changes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (
	process.env["CACHE_DIR"] === undefined &&
	!fs.existsSync(path.join(process.cwd(), "package.json"))
) {
	process.env["CACHE_DIR"] = path.join(
		os.tmpdir(),
		"exifcleaner-catalog-cache",
	);
}
