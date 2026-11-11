import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import config from "./main";

// Walks a dotted path through unknown config values without type assertions.
function at(value: unknown, keys: string[]): unknown {
	let current: unknown = value;
	for (const key of keys) {
		if (typeof current !== "object" || current === null) return undefined;
		current = Object.entries(current).find(([name]) => name === key)?.[1];
	}
	return current;
}

const REQUIRED: ReadonlyArray<{ keys: string[]; expected: unknown }> = [
	{
		keys: ["framework", "options", "builder", "viteConfigPath"],
		expected: ".storybook/vite.config.ts",
	},
	{ keys: ["core", "disableTelemetry"], expected: true },
	{ keys: ["core", "disableWhatsNewNotifications"], expected: true },
	{ keys: ["core", "enableCrashReports"], expected: false },
	{ keys: ["typescript", "reactDocgen"], expected: false },
];

// Problems with the Storybook harness config: every entry names the dotted key
// that is missing or wrong.
export function harnessConfigProblems(value: unknown): string[] {
	return REQUIRED.filter(
		({ keys, expected }) => at(value, keys) !== expected,
	).map(
		({ keys, expected }) => `${keys.join(".")} must be ${String(expected)}`,
	);
}

const PLANTED_OMISSIONS: ReadonlyArray<[string, string]> = [
	["framework.options.builder.viteConfigPath", "viteConfigPath"],
	["core.disableTelemetry", "disableTelemetry"],
	["core.disableWhatsNewNotifications", "disableWhatsNewNotifications"],
	["core.enableCrashReports", "enableCrashReports"],
	["typescript.reactDocgen", "reactDocgen"],
];

function plantedWithout(omitted: string) {
	return {
		framework: {
			options: {
				builder:
					omitted === "framework.options.builder.viteConfigPath"
						? {}
						: { viteConfigPath: ".storybook/vite.config.ts" },
			},
		},
		core: {
			...(omitted === "core.disableTelemetry"
				? {}
				: { disableTelemetry: true }),
			...(omitted === "core.disableWhatsNewNotifications"
				? {}
				: { disableWhatsNewNotifications: true }),
			...(omitted === "core.enableCrashReports"
				? {}
				: { enableCrashReports: false }),
		},
		typescript:
			omitted === "typescript.reactDocgen" ? {} : { reactDocgen: false },
	};
}

describe("storybook harness config", () => {
	test("the checked-in main.ts upholds the harness policy", () => {
		expect(harnessConfigProblems(config)).toEqual([]);
	});

	test("the planted full config is clean (the controls below differ by one key)", () => {
		expect(harnessConfigProblems(plantedWithout("none"))).toEqual([]);
	});

	test.each(PLANTED_OMISSIONS)(
		"reports a config lacking %s",
		(omitted, name) => {
			const problems = harnessConfigProblems(plantedWithout(omitted));
			expect(problems).toHaveLength(1);
			expect(problems[0]).toContain(name);
		},
	);

	test("reports a wrong value, not only a missing key", () => {
		const wrong = plantedWithout("none");
		wrong.core.disableTelemetry = false;
		expect(harnessConfigProblems(wrong)).toEqual([
			expect.stringContaining("core.disableTelemetry"),
		]);
	});

	test("the dedicated Vite config uses react() only and never mentions the app build", () => {
		const source = readFileSync(
			path.resolve(import.meta.dirname, "vite.config.ts"),
			"utf8",
		);
		expect(source).toContain("react()");
		expect(source).not.toContain("electron");
	});
});

const GUARD_PRELOAD = "NODE_OPTIONS=--import=./.storybook/network_guard.mjs";

// A script runs Storybook when it invokes the `storybook` binary or names the
// Storybook vitest config. A prettier glob that merely lists `.storybook` is not one.
function runsStorybook(command: string): boolean {
	return (
		/(?:^|[\s;&|])storybook\s/.test(command) ||
		command.includes("vitest.storybook.config.ts")
	);
}

// D-12 layers 1 and 4: every script that runs Storybook (or its vitest config)
// disables telemetry, sets CI and preloads the egress guard; the dev script
// also never opens a browser or checks for versions. Returns script names.
export function telemetryViolations(scripts: Record<string, string>): string[] {
	const violations: string[] = [];
	for (const [name, command] of Object.entries(scripts)) {
		if (!runsStorybook(command)) continue;
		const missing =
			!command.includes("STORYBOOK_DISABLE_TELEMETRY=true") ||
			!command.includes("CI=true") ||
			!command.includes(GUARD_PRELOAD) ||
			(/storybook\s+dev\b/.test(command) &&
				(!command.includes("--no-open") ||
					!command.includes("--no-version-updates")));
		if (missing) violations.push(name);
	}
	return violations;
}

const ENV = `STORYBOOK_DISABLE_TELEMETRY=true CI=true ${GUARD_PRELOAD}`;

describe("telemetry env policy", () => {
	test("the checked-in package.json scripts uphold the policy", () => {
		const pkg: unknown = JSON.parse(
			readFileSync(
				path.resolve(import.meta.dirname, "../package.json"),
				"utf8",
			),
		);
		const scripts = at(pkg, ["scripts"]);
		expect(typeof scripts).toBe("object");
		const map = Object.fromEntries(
			Object.entries(scripts ?? {}).filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			),
		);
		// Anti-vacuity: the three Storybook scripts exist and are the ones inspected.
		for (const name of ["storybook:build", "storybook:dev", "test:storybook"]) {
			expect(map[name], name).toBeDefined();
			expect(runsStorybook(map[name] ?? ""), name).toBe(true);
		}
		expect(telemetryViolations(map)).toEqual([]);
	});

	test("a compliant planted script map is clean and a prettier glob is not a Storybook script", () => {
		expect(
			telemetryViolations({
				"storybook:build": `${ENV} storybook build -o storybook-static`,
				"storybook:dev": `${ENV} storybook dev -p 6006 --no-open --no-version-updates`,
				"test:storybook": `${ENV} vitest run --config vitest.storybook.config.ts`,
				lint: "prettier --check '{src,tests,scripts,.storybook}/**/*.ts'",
			}),
		).toEqual([]);
	});

	test.each([
		[
			"a bare storybook build",
			{ "storybook:build": "storybook build" },
			"storybook:build",
		],
		[
			"a dev script without --no-open and --no-version-updates",
			{ "storybook:dev": `${ENV} storybook dev -p 6006` },
			"storybook:dev",
		],
		[
			"a test script without the guard preload",
			{
				"test:storybook":
					"STORYBOOK_DISABLE_TELEMETRY=true CI=true vitest run --config vitest.storybook.config.ts",
			},
			"test:storybook",
		],
		[
			"a build script without CI=true",
			{
				"storybook:build": `STORYBOOK_DISABLE_TELEMETRY=true ${GUARD_PRELOAD} storybook build`,
			},
			"storybook:build",
		],
	])("reports %s", (_label, scripts, name) => {
		expect(telemetryViolations(scripts)).toEqual([name]);
	});
});

// W4: src/ production code stays named-export only. Framework-mandated default
// exports (CSF `meta` in *.stories.tsx) are the one exception under src/.
export function defaultExportViolations(
	files: ReadonlyArray<{ path: string; text: string }>,
): string[] {
	return files
		.filter(
			({ path: file, text }) =>
				file.startsWith("src/") &&
				!file.endsWith(".stories.tsx") &&
				/^export default /m.test(text),
		)
		.map(({ path: file }) => file);
}

function listSourceFiles(root: string, relative: string): string[] {
	return readdirSync(path.join(root, relative), {
		withFileTypes: true,
	}).flatMap((entry) => {
		const child = `${relative}/${entry.name}`;
		if (entry.isDirectory()) return listSourceFiles(root, child);
		return /\.(ts|tsx|mjs|js)$/.test(entry.name) ? [child] : [];
	});
}

describe("named exports in src", () => {
	test("no non-story file under src/ has a default export", () => {
		const root = path.resolve(import.meta.dirname, "..");
		const files = listSourceFiles(root, "src").map((file) => ({
			path: file,
			text: readFileSync(path.join(root, file), "utf8"),
		}));
		// Anti-vacuity: the walk really saw production code.
		expect(files.length).toBeGreaterThan(50);
		expect(defaultExportViolations(files)).toEqual([]);
	});

	test("reports a planted default export in a production file", () => {
		expect(
			defaultExportViolations([
				{
					path: "src/renderer/components/x.tsx",
					text: "export default function X() {}",
				},
			]),
		).toEqual(["src/renderer/components/x.tsx"]);
	});

	test("allows the CSF default meta of a story file and ignores files outside src/", () => {
		expect(
			defaultExportViolations([
				{
					path: "src/renderer/components/x.stories.tsx",
					text: "const meta = {};\nexport default meta;",
				},
				{ path: ".storybook/main.ts", text: "export default config;" },
			]),
		).toEqual([]);
	});
});
