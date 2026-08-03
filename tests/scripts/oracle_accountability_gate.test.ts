import fs from "node:fs";
import { describe, expect, test } from "vitest";
import {
	evaluateAccountabilitySubject,
	evaluateCiWiring,
	renderAccountabilityClaims,
} from "../../scripts/oracle_accountability_gate.mjs";

type AccountabilitySubject = Parameters<
	typeof evaluateAccountabilitySubject
>[0];

const cleanSubject = (): AccountabilitySubject => ({
	metadataOracleSource: `
		const COMPUTED_TAG_PREFIXES = ["File", "ExifTool"];
		const COMPUTED_TAG_NAMES = new Set(["Directory", "FileName", "SourceFile"]);
		const MANDATORY_QUICKTIME_ZERO_DATE_TAG_NAMES = new Set(["CreateDate", "ModifyDate", "TrackCreateDate", "TrackModifyDate", "MediaCreateDate", "MediaModifyDate"]);
		const QUICKTIME_ZERO_DATE = "0000:00:00 00:00:00";
		if (MANDATORY_QUICKTIME_ZERO_DATE_TAG_NAMES.has(key) && tags[key] === QUICKTIME_ZERO_DATE) return false;
		export async function assertMetadataStripped() {}
	`,
	consumerSources: {
		"tests/e2e/oracle-accountability.spec.ts":
			'import { assertMetadataStripped } from "./helpers/metadata_assertions"; expect(value, "must be explicitly zeroed"); assertMetadataStripped(file);',
		"tests/smoke/packaged_app.smoke.ts":
			'import { assertMetadataStripped } from "../e2e/helpers/metadata_assertions"; assertMetadataStripped(file);',
	},
	fixtureGeneratorSource:
		'write("issue240.mp4"); write("orientation.jpg"); // generator-owned synthetic fixtures',
	orientationCommandSource:
		'if (preserveOrientation) preserveTags.push("-Orientation");',
	artifactPaths: [
		"tests/e2e/fixtures/issue240.mp4",
		"tests/e2e/fixtures/orientation.jpg",
	],
	claims: {
		schemaVersion: 1,
		issues: [
			{
				issue: 217,
				outcome: "synthetic_probe_stripped_cleanly",
				causality: "unknown",
				completion: "unclaimed",
				evidence: ["docs/evidence/discovery.md"],
			},
			{
				issue: 240,
				outcome: "real_app_dates_explicitly_zeroed",
				causality: "unknown",
				completion: "unclaimed",
				evidence: ["tests/e2e/oracle-accountability.spec.ts"],
			},
			{
				issue: 255,
				outcome: "synthetic_probe_stripped_cleanly",
				causality: "unknown",
				completion: "unclaimed",
				evidence: ["docs/evidence/discovery.md"],
			},
		],
	},
	knownGaps: {
		records: [
			{
				issue: 304,
				releasePolicy: "block",
				path: "tests/e2e/settings.spec.ts",
			},
		],
	},
});

describe("evaluateAccountabilitySubject", () => {
	test("accepts the finite repository-owned Phase 20 contract", () => {
		expect(evaluateAccountabilitySubject(cleanSubject())).toEqual([]);
	});

	test("rejects oracle broadening and a consumer that bypasses the shared helper", () => {
		const subject = cleanSubject();
		subject.metadataOracleSource +=
			'\nconst hidden = new Set(["Source", "CreateDate"]);';
		subject.consumerSources["tests/smoke/packaged_app.smoke.ts"] =
			"expect(metadata).toEqual({});";

		expect(evaluateAccountabilitySubject(subject)).toEqual(
			expect.arrayContaining([
				expect.stringContaining('forbidden oracle exception "Source"'),
				expect.stringContaining("packaged_app.smoke.ts"),
			]),
		);
	});

	test("rejects fabricated issue artifacts and non-generator-owned fixtures", () => {
		const subject = cleanSubject();
		subject.artifactPaths.push(
			"tests/e2e/fixtures/issue217.mp4",
			"docs/evidence/issue255-discovery.json",
		);
		subject.fixtureGeneratorSource =
			'write("orientation.jpg"); // issue240 fixture is no longer generated';

		expect(evaluateAccountabilitySubject(subject)).toEqual(
			expect.arrayContaining([
				expect.stringContaining("issue217.mp4"),
				expect.stringContaining("issue255-discovery.json"),
				expect.stringContaining("issue240.mp4"),
			]),
		);
	});

	test("rejects a missing or duplicated production Orientation seam", () => {
		const subject = cleanSubject();
		subject.orientationCommandSource = "const preserveTags = [];";
		expect(evaluateAccountabilitySubject(subject)).toEqual(
			expect.arrayContaining([
				expect.stringContaining("Orientation copy-back seam"),
			]),
		);

		subject.orientationCommandSource =
			'preserveTags.push("-Orientation"); preserveTags.push("-Orientation");';
		expect(evaluateAccountabilitySubject(subject)).toEqual(
			expect.arrayContaining([
				expect.stringContaining("Orientation copy-back seam"),
			]),
		);
	});

	test("rejects causal/completion claims and claim-to-known-gap drift", () => {
		const subject = cleanSubject();
		subject.claims.issues[0]!.causality = "root_caused";
		subject.claims.issues[2]!.completion = "fixed";
		subject.knownGaps.records.push({
			issue: 217,
			releasePolicy: "allow",
			path: "tests/e2e/oracle-accountability.spec.ts",
		});

		expect(evaluateAccountabilitySubject(subject)).toEqual(
			expect.arrayContaining([
				expect.stringContaining("#217 causality"),
				expect.stringContaining("#255 completion"),
				expect.stringContaining("metadata allow set"),
			]),
		);
	});
});

describe("renderAccountabilityClaims", () => {
	test("renders only measured outcomes and explicit unknown/unclaimed boundaries", () => {
		const rendered = renderAccountabilityClaims(cleanSubject().claims);

		expect(rendered).toContain(
			"| #240 | verified: real app explicitly zeroed the measured QuickTime date family | unknown | unclaimed |",
		);
		expect(rendered).toContain(
			"| #217 | not reproduced: synthetic candidate stripped cleanly through the real app flow | unknown | unclaimed |",
		);
		const claimRows = rendered
			.split("\n")
			.filter((line) => line.startsWith("| #"));
		expect(claimRows.join("\n")).not.toContain("fixed");
		expect(claimRows.join("\n")).not.toContain("root cause");
	});
});

describe("evaluateCiWiring", () => {
	test("requires policy before known gaps and mutation before the full E2E suite", () => {
		const workflow = `
run: yarn verify:accountability:policy
run: yarn verify:known-gaps
run: yarn verify:accountability:mutation
run: yarn test:e2e
`;
		const scripts = {
			"verify:accountability:policy":
				"node scripts/oracle_accountability_gate.mjs",
			"verify:accountability:mutation":
				"node scripts/orientation_mutation_gate.mjs",
		};

		expect(evaluateCiWiring(workflow, scripts)).toEqual([]);
		expect(
			evaluateCiWiring(workflow.replace("mutation", "missing"), scripts),
		).toEqual(expect.arrayContaining([expect.stringContaining("mutation")]));
		expect(
			evaluateCiWiring(
				workflow.split("\n").filter(Boolean).reverse().join("\n"),
				scripts,
			),
		).toEqual(expect.arrayContaining([expect.stringContaining("ordering")]));
	});
});

const prohibitionSubject = process.env["GSD_PROHIB_SUBJECT"];
if (prohibitionSubject !== undefined) {
	test("GSD prohibition subject satisfies the accountability policy", () => {
		const subject = JSON.parse(
			fs.readFileSync(prohibitionSubject, "utf8"),
		) as AccountabilitySubject;
		expect(evaluateAccountabilitySubject(subject)).toEqual([]);
	});
}
