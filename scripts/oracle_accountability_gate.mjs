import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FORBIDDEN_ORACLE_NAMES = ["Source", "XResolution", "YResolution"];
const REQUIRED_QUICKTIME_ZERO_DATE_NAMES = [
	"CreateDate",
	"ModifyDate",
	"TrackCreateDate",
	"TrackModifyDate",
	"MediaCreateDate",
	"MediaModifyDate",
];
const REQUIRED_CONSUMERS = [
	"tests/e2e/oracle-accountability.spec.ts",
	"tests/smoke/packaged_app.smoke.ts",
];
const REQUIRED_GENERATED_FIXTURES = ["issue240.mp4", "orientation.jpg"];
const FORBIDDEN_ISSUE_ARTIFACT = /(?:issue|#)(?:217|255)/i;
const EXPECTED_OUTCOMES = new Map([
	[217, "synthetic_probe_stripped_cleanly"],
	[240, "real_app_dates_explicitly_zeroed"],
	[255, "synthetic_probe_stripped_cleanly"],
]);
const CLAIMS_START = "<!-- oracle-accountability:claims:start -->";
const CLAIMS_END = "<!-- oracle-accountability:claims:end -->";
const OUTCOME_TEXT = new Map([
	[
		"synthetic_probe_stripped_cleanly",
		"not reproduced: synthetic candidate stripped cleanly through the real app flow",
	],
	[
		"real_app_dates_explicitly_zeroed",
		"verified: real app explicitly zeroed the measured QuickTime date family",
	],
]);

/**
 * @typedef {{
 *   schemaVersion: number,
 *   issues: Array<{
 *     issue: number,
 *     outcome: string,
 *     causality: string,
 *     completion: string,
 *     evidence: string[]
 *   }>
 * }} AccountabilityClaims
 *
 * @typedef {{
 *   metadataOracleSource: string,
 *   consumerSources: Record<string, string>,
 *   fixtureGeneratorSource: string,
 *   orientationCommandSource: string,
 *   artifactPaths: string[],
 *   claims: AccountabilityClaims,
 *   knownGaps: {records: Array<{issue: number, releasePolicy: string, path: string}>}
 * }} AccountabilitySubject
 */

/**
 * Evaluate the finite, repository-owned accountability contract.
 *
 * @param {AccountabilitySubject} subject
 * @returns {string[]}
 */
export function evaluateAccountabilitySubject(subject) {
	const problems = [];

	if (!subject.metadataOracleSource.includes('"SourceFile"')) {
		problems.push(
			'metadata oracle is missing exact computed name "SourceFile"',
		);
	}
	for (const name of FORBIDDEN_ORACLE_NAMES) {
		const quoted = new RegExp(`["']${name}["']`);
		if (quoted.test(subject.metadataOracleSource)) {
			problems.push(`forbidden oracle exception "${name}" is present`);
		}
	}
	for (const name of REQUIRED_QUICKTIME_ZERO_DATE_NAMES) {
		if (!subject.metadataOracleSource.includes(`"${name}"`)) {
			problems.push(`QuickTime zero-date contract is missing "${name}"`);
		}
	}
	if (
		!subject.metadataOracleSource.includes(
			'const QUICKTIME_ZERO_DATE = "0000:00:00 00:00:00"',
		) ||
		!subject.metadataOracleSource.includes("tags[key] === QUICKTIME_ZERO_DATE")
	) {
		problems.push(
			"QuickTime date tags may be structural only when their value is the mandatory zero date",
		);
	}
	const accountabilityConsumer =
		subject.consumerSources["tests/e2e/oracle-accountability.spec.ts"] ?? "";
	if (
		accountabilityConsumer.includes("test.fail(") ||
		!accountabilityConsumer.includes("must be explicitly zeroed")
	) {
		problems.push(
			"#240 must be a normal passing real-app test that proves the date family is explicitly zeroed",
		);
	}

	for (const consumer of REQUIRED_CONSUMERS) {
		const source = subject.consumerSources[consumer];
		if (
			source === undefined ||
			!source.includes("assertMetadataStripped") ||
			!source.includes("metadata_assertions")
		) {
			problems.push(
				`${consumer} must import and call the shared assertMetadataStripped oracle`,
			);
		}
	}

	for (const fixture of REQUIRED_GENERATED_FIXTURES) {
		if (!subject.fixtureGeneratorSource.includes(`"${fixture}"`)) {
			problems.push(`${fixture} is not owned by the fixture generator`);
		}
	}
	const orientationSeams =
		subject.orientationCommandSource.split('preserveTags.push("-Orientation")')
			.length - 1;
	if (orientationSeams !== 1) {
		problems.push(
			`production source must contain exactly one Orientation copy-back seam, found ${orientationSeams}`,
		);
	}
	for (const artifactPath of subject.artifactPaths) {
		if (FORBIDDEN_ISSUE_ARTIFACT.test(artifactPath)) {
			problems.push(`forbidden fabricated issue artifact: ${artifactPath}`);
		}
	}

	if (subject.claims.schemaVersion !== 1) {
		problems.push(
			`unsupported oracle-accountability schemaVersion ${String(subject.claims.schemaVersion)}`,
		);
	}
	const claimsByIssue = new Map(
		subject.claims.issues.map((claim) => [claim.issue, claim]),
	);
	for (const [issue, expectedOutcome] of EXPECTED_OUTCOMES) {
		const claim = claimsByIssue.get(issue);
		if (claim === undefined) {
			problems.push(`missing accountability claim for #${issue}`);
			continue;
		}
		if (claim.outcome !== expectedOutcome) {
			problems.push(
				`#${issue} outcome must be ${expectedOutcome}, received ${claim.outcome}`,
			);
		}
		if (claim.causality !== "unknown") {
			problems.push(
				`#${issue} causality must remain unknown, received ${claim.causality}`,
			);
		}
		if (claim.completion !== "unclaimed") {
			problems.push(
				`#${issue} completion must remain unclaimed, received ${claim.completion}`,
			);
		}
		if (!Array.isArray(claim.evidence) || claim.evidence.length === 0) {
			problems.push(`#${issue} must name at least one evidence path`);
		}
	}
	const unexpectedClaims = subject.claims.issues
		.map((claim) => claim.issue)
		.filter((issue) => !EXPECTED_OUTCOMES.has(issue));
	if (unexpectedClaims.length > 0) {
		problems.push(
			`unexpected accountability issue claims: ${unexpectedClaims.join(", ")}`,
		);
	}

	const metadataAllowSet = subject.knownGaps.records
		.filter(
			(record) =>
				record.releasePolicy === "allow" &&
				record.path === "tests/e2e/oracle-accountability.spec.ts",
		)
		.map((record) => record.issue)
		.sort((a, b) => a - b);
	if (JSON.stringify(metadataAllowSet) !== "[]") {
		problems.push(
			`metadata allow set must be empty, received ${JSON.stringify(metadataAllowSet)}`,
		);
	}

	return problems;
}

/**
 * Render the only repository-authorized public claim language from closed enums.
 *
 * @param {AccountabilityClaims} claims
 * @returns {string}
 */
export function renderAccountabilityClaims(claims) {
	const rows = [...claims.issues]
		.sort((left, right) => left.issue - right.issue)
		.map((claim) => {
			const outcome =
				OUTCOME_TEXT.get(claim.outcome) ??
				`invalid measured outcome: ${claim.outcome}`;
			return `| #${claim.issue} | ${outcome} | ${claim.causality} | ${claim.completion} |`;
		});
	return [
		"## Generated Issue Claim Boundary",
		"",
		"Generated from `docs/oracle-accountability.json`; do not hand-edit this block.",
		"",
		"| Issue | Measured outcome | Causality | Completion |",
		"|---|---|---|---|",
		...rows,
		"",
		"Only the measured outcomes above are authorized. `unknown` causality and `unclaimed` completion prohibit root-cause, fixed, or nonexistent conclusions.",
	].join("\n");
}

export function evaluateCiWiring(workflowSource, scripts) {
	const problems = [];
	if (
		scripts["verify:accountability:policy"] !==
		"node scripts/oracle_accountability_gate.mjs"
	) {
		problems.push(
			"package script verify:accountability:policy must invoke the policy gate directly",
		);
	}
	if (
		scripts["verify:accountability:mutation"] !==
		"node scripts/orientation_mutation_gate.mjs"
	) {
		problems.push(
			"package script verify:accountability:mutation must invoke the mutation gate directly",
		);
	}
	const policy = workflowSource.indexOf("yarn verify:accountability:policy");
	const knownGaps = workflowSource.indexOf("yarn verify:known-gaps");
	const mutation = workflowSource.indexOf(
		"yarn verify:accountability:mutation",
	);
	const fullE2e = workflowSource.indexOf("yarn test:e2e", mutation + 1);
	if (policy === -1) {
		problems.push("CI is missing the accountability policy gate");
	}
	if (mutation === -1) {
		problems.push("CI is missing the accountability mutation gate");
	}
	if (
		policy === -1 ||
		knownGaps === -1 ||
		mutation === -1 ||
		fullE2e === -1 ||
		policy > knownGaps ||
		mutation > fullE2e
	) {
		problems.push(
			"CI accountability ordering must be policy → known-gap gate and mutation → full E2E",
		);
	}
	return problems;
}

function managedClaimsBlock(claims) {
	return `${CLAIMS_START}\n${renderAccountabilityClaims(claims)}\n${CLAIMS_END}`;
}

function replaceManagedClaims(document, claims) {
	const block = managedClaimsBlock(claims);
	const start = document.indexOf(CLAIMS_START);
	const end = document.indexOf(CLAIMS_END);
	if (start === -1 && end === -1) {
		return `${document.trimEnd()}\n\n${block}\n`;
	}
	if (start === -1 || end === -1 || end < start) {
		throw new Error("malformed oracle-accountability managed claims block");
	}
	return `${document.slice(0, start)}${block}${document.slice(end + CLAIMS_END.length)}`;
}

function walkFiles(root, current = root, output = []) {
	for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
		const absolute = path.join(current, entry.name);
		if (entry.isDirectory()) {
			walkFiles(root, absolute, output);
		} else {
			output.push(path.relative(root, absolute).split(path.sep).join("/"));
		}
	}
	return output;
}

export function buildRepositorySubject(repoRoot = process.cwd()) {
	const read = (relative) =>
		fs.readFileSync(path.join(repoRoot, relative), "utf8");
	const testsRoot = path.join(repoRoot, "tests");
	return {
		metadataOracleSource: read("tests/e2e/helpers/metadata_assertions.ts"),
		consumerSources: Object.fromEntries(
			REQUIRED_CONSUMERS.map((relative) => [relative, read(relative)]),
		),
		fixtureGeneratorSource: read("tests/e2e/fixtures/generate_fixtures.ts"),
		orientationCommandSource: read(
			"src/application/commands/strip_metadata_command.ts",
		),
		artifactPaths: walkFiles(repoRoot, testsRoot)
			.concat(walkFiles(repoRoot, path.join(repoRoot, "docs", "evidence")))
			.filter((relative) => /(?:217|255)/.test(relative)),
		claims: JSON.parse(read("docs/oracle-accountability.json")),
		knownGaps: JSON.parse(read("docs/known-gaps.json")),
	};
}

function sha256(filePath) {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function verifyGeneratedFixtures(repoRoot = process.cwd()) {
	const tempDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "exifcleaner-accountability-fixtures-"),
	);
	try {
		const generation = spawnSync(
			"yarn",
			[
				"tsx",
				"tests/e2e/fixtures/generate_fixtures.ts",
				"--output-dir",
				tempDir,
			],
			{
				cwd: repoRoot,
				encoding: "utf8",
				maxBuffer: 20 * 1024 * 1024,
			},
		);
		if (generation.status !== 0) {
			return [
				`fixture regeneration failed (exit ${generation.status})\n${generation.stdout}${generation.stderr}`,
			];
		}
		const problems = [];
		for (const fixture of REQUIRED_GENERATED_FIXTURES) {
			const committed = path.join(repoRoot, "tests/e2e/fixtures", fixture);
			const generated = path.join(tempDir, fixture);
			if (!fs.existsSync(generated)) {
				problems.push(`${fixture} was not regenerated`);
				continue;
			}
			if (sha256(committed) !== sha256(generated)) {
				problems.push(`${fixture} differs from a fresh generator-owned copy`);
			}
		}
		return problems;
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

function main() {
	let subject;
	try {
		subject = buildRepositorySubject();
	} catch (error) {
		console.error(
			`✗ ORACLE ACCOUNTABILITY GATE FAILED\n${error instanceof Error ? error.message : String(error)}`,
		);
		process.exitCode = 1;
		return;
	}
	const problems = evaluateAccountabilitySubject(subject);
	problems.push(...verifyGeneratedFixtures());
	const packageJson = JSON.parse(
		fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
	);
	problems.push(
		...evaluateCiWiring(
			fs.readFileSync(
				path.join(process.cwd(), ".github/workflows/ci.yml"),
				"utf8",
			),
			packageJson.scripts ?? {},
		),
	);
	if (problems.length > 0) {
		console.error(
			`✗ ORACLE ACCOUNTABILITY GATE FAILED\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
		);
		process.exitCode = 1;
		return;
	}
	const closurePath = path.join(
		process.cwd(),
		"docs/evidence/2026-07-30-oracle-accountability-closure.md",
	);
	const closure = fs.readFileSync(closurePath, "utf8");
	const expectedClosure = replaceManagedClaims(closure, subject.claims);
	if (process.argv.includes("--write-claims")) {
		fs.writeFileSync(closurePath, expectedClosure);
		console.log("✓ Wrote generated oracle-accountability claim boundary");
	} else if (closure !== expectedClosure) {
		console.error(
			"✗ ORACLE ACCOUNTABILITY GATE FAILED\n- generated claim boundary is missing or stale; run yarn accountability:write-claims",
		);
		process.exitCode = 1;
		return;
	}
	console.log(
		"✓ Oracle accountability policy: strict shared oracle, synthetic fixtures, measured claims, empty allow set",
	);
}

const invokedPath = process.argv[1];
if (
	invokedPath !== undefined &&
	fileURLToPath(import.meta.url) === path.resolve(invokedPath)
) {
	main();
}
