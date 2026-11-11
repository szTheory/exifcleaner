import { readFileSync } from "node:fs";
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
