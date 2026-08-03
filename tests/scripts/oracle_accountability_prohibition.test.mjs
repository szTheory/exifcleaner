import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
	buildRepositorySubject,
	evaluateAccountabilitySubject,
} from "../../scripts/oracle_accountability_gate.mjs";

const appRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);

function cleanSubject() {
	return {
		metadataOracleSource:
			'const COMPUTED_TAG_NAMES = new Set(["SourceFile"]); const MANDATORY_QUICKTIME_ZERO_DATE_TAG_NAMES = new Set(["CreateDate", "ModifyDate", "TrackCreateDate", "TrackModifyDate", "MediaCreateDate", "MediaModifyDate"]); const QUICKTIME_ZERO_DATE = "0000:00:00 00:00:00"; if (MANDATORY_QUICKTIME_ZERO_DATE_TAG_NAMES.has(key) && tags[key] === QUICKTIME_ZERO_DATE) return false; export function assertMetadataStripped() {}',
		consumerSources: {
			"tests/e2e/oracle-accountability.spec.ts":
				'import { assertMetadataStripped } from "./helpers/metadata_assertions"; expect(value, "must be explicitly zeroed"); assertMetadataStripped(file);',
			"tests/smoke/packaged_app.smoke.ts":
				'import { assertMetadataStripped } from "../e2e/helpers/metadata_assertions"; assertMetadataStripped(file);',
		},
		fixtureGeneratorSource: 'write("issue240.mp4"); write("orientation.jpg");',
		orientationCommandSource:
			'if (preserveOrientation) preserveTags.push("-Orientation");',
		artifactPaths: [],
		claims: {
			schemaVersion: 1,
			issues: [
				{
					issue: 217,
					outcome: "synthetic_probe_stripped_cleanly",
					causality: "unknown",
					completion: "unclaimed",
					evidence: ["discovery.md"],
				},
				{
					issue: 240,
					outcome: "real_app_dates_explicitly_zeroed",
					causality: "unknown",
					completion: "unclaimed",
					evidence: ["oracle-accountability.spec.ts"],
				},
				{
					issue: 255,
					outcome: "synthetic_probe_stripped_cleanly",
					causality: "unknown",
					completion: "unclaimed",
					evidence: ["discovery.md"],
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
	};
}

function subjectForFixture(fixturePath) {
	const descriptor = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
	const subject = cleanSubject();
	switch (descriptor.violation) {
		case null:
			break;
		case "oracle-broadening":
			subject.metadataOracleSource += ' const hidden = new Set(["Source"]);';
			subject.consumerSources["tests/smoke/packaged_app.smoke.ts"] =
				"expect(metadata).toEqual({});";
			break;
		case "fixture-provenance":
			subject.fixtureGeneratorSource = 'write("orientation.jpg");';
			break;
		case "surviving-mutation":
			subject.orientationCommandSource = "const preserveTags = [];";
			break;
		case "unsupported-claim":
			subject.claims.issues[0].causality = "root_caused";
			break;
		case "fabricated-evidence":
			subject.artifactPaths.push("tests/e2e/fixtures/issue217.mp4");
			subject.knownGaps.records.push({
				issue: 217,
				releasePolicy: "allow",
				path: "tests/e2e/oracle-accountability.spec.ts",
			});
			break;
		default:
			throw new Error(`unknown prohibition fixture ${descriptor.violation}`);
	}
	return subject;
}

test("oracle accountability prohibition remains mechanically enforced", () => {
	const fixturePath = process.env["GSD_PROHIB_SUBJECT"];
	const subject =
		fixturePath === undefined
			? buildRepositorySubject(appRoot)
			: subjectForFixture(path.resolve(fixturePath));
	assert.deepEqual(evaluateAccountabilitySubject(subject), []);
});
