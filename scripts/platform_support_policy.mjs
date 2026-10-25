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
	for (const entry of targets) {
		if (
			entry.arch === null &&
			!ARCHLESS_TARGET_ALLOWLIST.includes(entry.target)
		) {
			reasons.push(`arch-less win target ${entry.target} is not allowlisted`);
		}
	}

	const TOKEN_PATTERN = /\bia32\b|--ia32|\barmv7l?\b|-c\.win\.target/;
	const scanned = [
		{ name: "package.json", text: inputs.packageText },
		...inputs.workflows.map((w) => ({
			name: `.github/workflows/${w.name}`,
			text: w.text,
		})),
	];
	for (const file of scanned) {
		const match = TOKEN_PATTERN.exec(file.text);
		if (match) reasons.push(`${file.name} mentions ${match[0]}`);
	}

	for (const name of inputs.rootFiles) {
		if (
			/^electron-builder\.(ya?ml|json5?|toml)$/.test(name) ||
			/^electron-builder\.config\./.test(name)
		) {
			reasons.push(`second electron-builder config source: ${name}`);
		}
	}

	const floor = inputs.packageJson?.build?.mac?.minimumSystemVersion;
	if (floor !== "13.0") {
		reasons.push(`mac.minimumSystemVersion must be 13.0: got ${floor}`);
	}
	try {
		const expected = `macOS ${macFloorMajor(floor)}+`;
		if (!inputs.readme.includes(expected)) {
			reasons.push(`README must state ${expected}`);
		}
		const others = (inputs.readme.match(/macOS \d+\+/g) ?? []).filter(
			(m) => m !== expected,
		);
		if (others.length > 0) {
			reasons.push(
				`README states a different macOS floor: ${others.join(", ")}`,
			);
		}
	} catch (e) {
		reasons.push(`mac.minimumSystemVersion unreadable: ${e.message}`);
	}

	const electron = inputs.packageJson?.devDependencies?.electron;
	const pin = new RegExp(`^${SUPPORTED_ELECTRON_MAJOR}\\.\\d+\\.\\d+$`);
	if (typeof electron !== "string" || !pin.test(electron)) {
		reasons.push(
			`electron must be pinned exactly to ${SUPPORTED_ELECTRON_MAJOR}.x: got ${electron}`,
		);
	} else if (inputs.installedElectronVersion !== electron) {
		reasons.push(
			`installed electron ${inputs.installedElectronVersion} does not match pinned ${electron}`,
		);
	}
	return reasons;
}

export function macFloorMajor(version) {
	const match = /^(\d+)\.\d+$/.exec(String(version));
	if (!match)
		throw new Error(`minimumSystemVersion must look like N.M: ${version}`);
	return Number(match[1]);
}

export function main(argv = process.argv.slice(2)) {
	try {
		const rootIndex = argv.indexOf("--root");
		const root =
			rootIndex >= 0
				? path.resolve(argv[rootIndex + 1])
				: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
		const reasons = checkPlatformPolicy(readRepositoryInputs(root));
		if (reasons.length === 0) {
			console.log("✓ PLATFORM SUPPORT POLICY PASSED");
			return 0;
		}
		console.error("✗ PLATFORM SUPPORT POLICY FAILED:");
		for (const reason of reasons) console.error(reason);
		return 1;
	} catch (error) {
		console.error(
			`✗ PLATFORM SUPPORT POLICY FAILED:\n${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
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
