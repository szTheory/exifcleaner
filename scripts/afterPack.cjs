// After electron-builder flips its configured fuses and runs its signing
// stage, re-sign the entire bundle with a consistent ad-hoc identity.
// Electron 35 ships with pre-signed
// frameworks; leaving them signed inside an otherwise-unsigned app causes
// macOS Gatekeeper to report the app as "damaged." A uniform ad-hoc
// signature produces the bypassable "unidentified developer" dialog instead.
//
// The product deliberately configures identity: null, so this hook is the
// authoritative final signature even if conventional CSC variables happen to
// exist in a maintainer environment.
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

exports.default = async function afterSign(context) {
	if (context.electronPlatformName !== "darwin") return;

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
