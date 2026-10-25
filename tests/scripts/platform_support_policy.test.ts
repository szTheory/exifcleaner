import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	checkPlatformPolicy,
	readRepositoryInputs,
	normalizeWindowsTargets,
	macFloorMajor,
} from "../../scripts/platform_support_policy.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

type Inputs = ReturnType<typeof readRepositoryInputs>;

describe("platform support policy", () => {
	test("the repository satisfies the policy", () => {
		expect(checkPlatformPolicy(readRepositoryInputs(ROOT))).toEqual([]);
	});

	test.each<[string, (inputs: Inputs) => void, string]>([
		[
			"32-bit arch re-added to nsis",
			(inputs) => {
				inputs.packageJson.build.win.target[0].arch.push("ia32");
			},
			"nsis arch must be exactly [x64]",
		],
		[
			"x64 plus arm64 on nsis",
			(inputs) => {
				inputs.packageJson.build.win.target[0].arch = ["x64", "arm64"];
			},
			"nsis arch must be exactly [x64]",
		],
		[
			"arch-less zip target",
			(inputs) => {
				inputs.packageJson.build.win.target.push({ target: "zip" });
			},
			"arch-less win target zip",
		],
		[
			"--ia32 appended to packwin",
			(inputs) => {
				inputs.packageJson.scripts.packwin += " --ia32";
				inputs.packageText = inputs.packageText.replace(
					"--windows --publish never",
					"--windows --publish never --ia32",
				);
			},
			"mentions --ia32",
		],
		[
			"workflow overrides the win target",
			(inputs) => {
				inputs.workflows.push({
					name: "x.yml",
					text: "run: electron-builder -c.win.target=nsis",
				});
			},
			"mentions -c.win.target",
		],
		[
			"second electron-builder config",
			(inputs) => {
				inputs.rootFiles.push("electron-builder.yml");
			},
			"second electron-builder config source",
		],
		[
			"macOS floor 12.0",
			(inputs) => {
				inputs.packageJson.build.mac.minimumSystemVersion = "12.0";
			},
			"mac.minimumSystemVersion must be 13.0",
		],
		[
			"README still says macOS 12+",
			(inputs) => {
				inputs.readme = inputs.readme.replace("macOS 13+", "macOS 12+");
			},
			"README must state macOS 13+",
		],
		[
			"README carries a second macOS floor",
			(inputs) => {
				inputs.readme += "\nmacOS 12+ also works\n";
			},
			"README states a different macOS floor",
		],
		[
			"electron caret range",
			(inputs) => {
				inputs.packageJson.devDependencies.electron = "^44.9.3";
			},
			"electron must be pinned exactly to 44.x",
		],
		[
			"installed electron differs",
			(inputs) => {
				inputs.installedElectronVersion = "44.0.0";
			},
			"installed electron",
		],
	])("negative control: %s", (_name, mutate, expected) => {
		const inputs = structuredClone(readRepositoryInputs(ROOT));
		mutate(inputs);
		const reasons = checkPlatformPolicy(inputs);
		expect(reasons.length).toBeGreaterThan(0);
		expect(reasons.join("\n")).toContain(expected);
	});

	test("normalizeWindowsTargets accepts object and bare string entries", () => {
		expect(
			normalizeWindowsTargets({
				target: [{ target: "nsis", arch: ["x64"] }, "portable"],
			}).targets,
		).toEqual([
			{ target: "nsis", arch: ["x64"] },
			{ target: "portable", arch: null },
		]);
	});

	test("macFloorMajor reads the major and rejects a bare number", () => {
		expect(macFloorMajor("13.0")).toBe(13);
		expect(() => macFloorMajor("13")).toThrow();
	});
});
