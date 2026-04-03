// After electron-builder signs the app, re-sign the entire bundle with
// a consistent ad-hoc identity. This ensures all nested frameworks and
// helpers have matching signatures, preventing "different Team IDs"
// crashes on macOS.
//
// Only runs when no real signing certificate is configured.
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

module.exports = async function (context) {
	if (process.platform !== "darwin") return;

	// Skip if real signing identity is configured
	if (process.env.CSC_LINK || process.env.CSC_NAME) return;

	const appPath = path.join(
		context.appOutDir,
		`${context.packager.appInfo.productFilename}.app`,
	);

	if (!fs.existsSync(appPath)) return;

	console.log(`  • re-signing entire bundle (ad-hoc)  app=${appPath}`);

	const frameworksDir = path.join(appPath, "Contents", "Frameworks");

	// Sign all nested .app bundles (helpers) and frameworks first
	if (fs.existsSync(frameworksDir)) {
		const entries = fs.readdirSync(frameworksDir);
		for (const entry of entries) {
			const entryPath = path.join(frameworksDir, entry);
			if (entry.endsWith(".app") || entry.endsWith(".framework")) {
				console.log(`    signing: ${entry}`);
				execSync(
					`codesign --force --sign - --deep "${entryPath}"`,
					{ stdio: "pipe" },
				);
			}
		}
	}

	// Sign the outer app last
	console.log(`    signing: ExifCleaner.app`);
	execSync(`codesign --force --sign - "${appPath}"`, { stdio: "pipe" });
};
