import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SUPPORTED_ELECTRON_MAJOR = 44;
export const ARCHLESS_TARGET_ALLOWLIST = ["portable"];

export function normalizeWindowsTargets(win) {
	const target = win?.target;
	if (!Array.isArray(target))
		return { error: "build.win.target must be an array", targets: [] };
	const targets = target.map((entry) => {
		if (typeof entry === "string") return { target: entry, arch: null };
		const arch = Array.isArray(entry?.arch)
			? entry.arch.map(String)
			: typeof entry?.arch === "string"
				? [entry.arch]
				: null;
		return { target: String(entry?.target), arch };
	});
	return { error: null, targets };
}

export function checkPlatformPolicy(inputs) {
	const reasons = [];
	const { error, targets } = normalizeWindowsTargets(
		inputs.packageJson?.build?.win,
	);
	if (error) reasons.push(error);
	for (const entry of targets) {
		if (entry.arch && JSON.stringify(entry.arch) !== JSON.stringify(["x64"])) {
			reasons.push(
				`win target ${entry.target} arch must be exactly [x64]: got ${JSON.stringify(entry.arch)}`,
			);
		}
	}
	return reasons;
}

export function readRepositoryInputs(root) {
	const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
	const packageText = read("package.json");
	const workflowDirectory = path.join(root, ".github", "workflows");
	const workflows = fs.existsSync(workflowDirectory)
		? fs
				.readdirSync(workflowDirectory)
				.filter((name) => name.endsWith(".yml"))
				.sort()
				.map((name) => ({
					name,
					text: read(path.join(".github", "workflows", name)),
				}))
		: [];
	const electronPackage = path.join(
		root,
		"node_modules",
		"electron",
		"package.json",
	);
	return {
		packageJson: JSON.parse(packageText),
		packageText,
		readme: read("README.md"),
		workflows,
		rootFiles: fs.readdirSync(root),
		installedElectronVersion: fs.existsSync(electronPackage)
			? JSON.parse(fs.readFileSync(electronPackage, "utf8")).version
			: null,
	};
}
