// Guard for the scoped Intel smoke (PLAT-01): the `smoke-macos-intel` job of ci.yml runs only the
// specs selected by its `--grep` and then requires EXACTLY EXPECT_TOTAL passed specs, EXPECT_NATIVE of
// them native. Every smoke spec added later (engine rows, overwrite platform rows, colour copy) must
// stay out of that selection, or the Intel count breaks on a runner that cannot show it.
//
// The selection is asked of Playwright itself (`--list --reporter=json --grep <pattern from ci.yml>`):
// Playwright applies the grep to the combined project, file, describe and test title, which a
// hand-written regexp over `test(` titles would get wrong. No app is launched by a listing.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(__dirname, "../../..");
const CI_WORKFLOW = path.join(REPOSITORY_ROOT, ".github/workflows/ci.yml");

// Specs that must never be selected by the Intel grep (files of 69-02, 69-03, 69-05 and 69-15; a
// file that does not exist yet simply selects nothing, which the non-vacuity test below pins down
// for the four specs that must be selected).
const FORBIDDEN_SPEC_FILES = [
	"engine_rows.smoke.ts",
	"overwrite_platform.smoke.ts",
	"color_copy.smoke.ts",
] as const;

const EXPECTED_INTEL_TITLES = [
	{
		file: "packaged_app.smoke.ts",
		title: "launches and mounts the UI",
	},
	{
		file: "packaged_app.smoke.ts",
		title: "ships the approved Electron fuse values in the native executable",
	},
	{
		file: "file_type_coverage.smoke.ts",
		title:
			"seeded sample-sips-icc.heic is cleaned by the native engine in the installed artifact",
	},
	{
		file: "file_type_coverage.smoke.ts",
		title:
			"seeded sample-sips-icc.avif is cleaned by the native engine in the installed artifact",
	},
] as const;

interface ListedSpec {
	readonly title: string;
	readonly file: string;
}

interface IntelJob {
	readonly grep: string;
	readonly expectTotal: number;
	readonly expectNative: number;
	readonly nativeTitle: RegExp;
}

// The text of one top-level job: from `  <name>:` to the next job at the same indentation.
function jobBlock(workflow: string, name: string): string {
	const lines = workflow.split("\n");
	const start = lines.findIndex((line) => line === `  ${name}:`);
	if (start === -1) {
		throw new Error(`ci.yml has no job named ${name}`);
	}
	let end = lines.length;
	for (let index = start + 1; index < lines.length; index += 1) {
		if (/^ {2}[A-Za-z0-9_-]+:\s*$/u.test(lines[index] ?? "")) {
			end = index;
			break;
		}
	}
	return lines.slice(start, end).join("\n");
}

function requireMatch(text: string, pattern: RegExp, what: string): string {
	const match = pattern.exec(text);
	const value = match?.[1];
	if (value === undefined) {
		throw new Error(`could not read ${what} from the smoke-macos-intel job`);
	}
	return value;
}

function readIntelJob(workflow: string): IntelJob {
	const block = jobBlock(workflow, "smoke-macos-intel");
	return {
		grep: requireMatch(block, /--grep '([^']+)'/u, "the --grep alternation"),
		expectTotal: Number(
			requireMatch(block, /const EXPECT_TOTAL = (\d+);/u, "EXPECT_TOTAL"),
		),
		expectNative: Number(
			requireMatch(block, /const EXPECT_NATIVE = (\d+);/u, "EXPECT_NATIVE"),
		),
		nativeTitle: new RegExp(
			requireMatch(block, /const nativeTitle = \/(.+)\/;/u, "nativeTitle"),
			"u",
		),
	};
}

// Counts the specs in Playwright's JSON list output (suites nest by file and describe).
function countMatches(listJson: unknown): ListedSpec[] {
	const specs: ListedSpec[] = [];
	const walk = (suite: unknown): void => {
		if (typeof suite !== "object" || suite === null) {
			return;
		}
		const record = suite as {
			specs?: ReadonlyArray<{ title?: unknown; file?: unknown }>;
			suites?: unknown[];
		};
		for (const spec of record.specs ?? []) {
			specs.push({
				title: String(spec.title),
				file: path.basename(String(spec.file)),
			});
		}
		for (const child of record.suites ?? []) {
			walk(child);
		}
	};
	const root = listJson as { suites?: unknown[] };
	for (const suite of root.suites ?? []) {
		walk(suite);
	}
	return specs;
}

function listSmokeSpecs(grep: string): unknown {
	const playwright = path.join(
		REPOSITORY_ROOT,
		"node_modules",
		".bin",
		process.platform === "win32" ? "playwright.cmd" : "playwright",
	);
	const environment: NodeJS.ProcessEnv = { ...process.env };
	delete environment["PLAYWRIGHT_JSON_OUTPUT_NAME"];
	delete environment["EXIFCLEANER_PACKAGED_APP"];
	const stdout = execFileSync(
		playwright,
		["test", "--project=smoke", "--list", "--reporter=json", "--grep", grep],
		{
			cwd: REPOSITORY_ROOT,
			env: environment,
			encoding: "utf8",
			maxBuffer: 16 * 1024 * 1024,
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	try {
		return JSON.parse(stdout);
	} catch {
		throw new Error(
			`playwright --list did not print JSON: ${stdout.slice(0, 200)}`,
		);
	}
}

describe("Intel smoke grep isolation (PLAT-01)", () => {
	const workflow = fs.readFileSync(CI_WORKFLOW, "utf8");
	const job = readIntelJob(workflow);

	it("reads the grep and the expected counts from ci.yml", () => {
		expect(job.expectTotal).toBe(4);
		expect(job.expectNative).toBe(2);
		expect(job.grep).toContain("launches and mounts the UI");
		expect(job.nativeTitle.test(EXPECTED_INTEL_TITLES[2].title)).toBe(true);
	});

	it("Playwright selects exactly the four Intel specs, two of them native, none from the later smoke files", () => {
		const matched = countMatches(listSmokeSpecs(job.grep));

		expect(matched).toHaveLength(job.expectTotal);
		expect(
			matched.filter((spec) => job.nativeTitle.test(spec.title)),
		).toHaveLength(job.expectNative);

		// Non-vacuity: the four titles exist in the two files that own them, so an absent
		// later file cannot make the exclusion below pass on an empty selection.
		for (const expected of EXPECTED_INTEL_TITLES) {
			expect(matched).toContainEqual(expected);
		}

		for (const spec of matched) {
			expect(FORBIDDEN_SPEC_FILES as readonly string[]).not.toContain(
				spec.file,
			);
		}
	}, 90_000);

	it("control: a spec whose title matches the grep makes the count report 5", () => {
		interface FakeSuite {
			title: string;
			file: string;
			specs: Array<{ title: string; file: string }>;
			suites?: FakeSuite[];
		}
		const real: { suites: FakeSuite[] } = {
			suites: [
				{
					title: "packaged_app.smoke.ts",
					file: "../smoke/packaged_app.smoke.ts",
					specs: EXPECTED_INTEL_TITLES.filter(
						(spec) => spec.file === "packaged_app.smoke.ts",
					).map((spec) => ({ title: spec.title, file: spec.file })),
					suites: [],
				},
				{
					title: "file_type_coverage.smoke.ts",
					file: "../smoke/file_type_coverage.smoke.ts",
					specs: [],
					suites: [
						{
							title: "seeded",
							file: "../smoke/file_type_coverage.smoke.ts",
							specs: EXPECTED_INTEL_TITLES.filter(
								(spec) => spec.file === "file_type_coverage.smoke.ts",
							).map((spec) => ({ title: spec.title, file: spec.file })),
						},
					],
				},
			],
		};
		expect(countMatches(real)).toHaveLength(job.expectTotal);

		const planted = structuredClone(real);
		planted.suites[0]?.specs.push({
			title: "launches and mounts the UI after an overwrite",
			file: "overwrite_platform.smoke.ts",
		});
		const counted = countMatches(planted);
		expect(counted).toHaveLength(5);
		expect(counted).not.toHaveLength(job.expectTotal);
		// The planted title really is one the grep would select, which is why the count must grow.
		expect(new RegExp(job.grep, "u").test(counted[4]?.title ?? "")).toBe(true);
	});
});
