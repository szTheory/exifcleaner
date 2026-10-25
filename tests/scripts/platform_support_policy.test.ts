import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	checkPlatformPolicy,
	readRepositoryInputs,
	normalizeWindowsTargets,
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
});
