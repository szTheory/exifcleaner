// After electron-builder packs the app, re-sign the entire bundle with
// a consistent ad-hoc identity. Electron 35 ships with pre-signed
// frameworks; leaving them signed inside an otherwise-unsigned app causes
// macOS Gatekeeper to report the app as "damaged." A uniform ad-hoc
// signature produces the bypassable "unidentified developer" dialog instead.
//
// Skips when a real signing certificate is configured (CI with Apple cert).
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

exports.default = async function afterPack(context) {
	if (context.electronPlatformName !== "darwin") return;

	// Skip if real signing identity is configured
	if (process.env.CSC_LINK || process.env.CSC_NAME) return;

	const appPath = path.join(
		context.appOutDir,
		`${context.packager.appInfo.productFilename}.app`,
	);

	if (!fs.existsSync(appPath)) return;

	console.log(`  • Re-signing bundle ad-hoc: ${appPath}`);
	execSync(`codesign --force --deep --sign - "${appPath}"`, {
		stdio: "inherit",
	});
};
