import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PHASE25_MARKERS } from "./phase25_issue_actions.mjs";

const REPOSITORY = "szTheory/exifcleaner";
const ISSUE_NUMBERS = [139, 182, 199, 211, 215, 216, 217, 254, 262];

function expectedCloseDate(publishedAt) {
	const value = Date.parse(publishedAt);
	if (Number.isNaN(value)) return undefined;
	return new Date(value + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function evaluatePhase25State(snapshot) {
	const problems = [];
	const release = snapshot?.release;
	if (release?.tag_name !== "v4.0.1" || release.draft !== false) {
		problems.push("v4.0.1 must be a published, non-draft release");
		return problems;
	}
	if (typeof release.published_at !== "string") {
		problems.push("v4.0.1 has no publication timestamp");
	}
	const requiredAssets = [
		"ExifCleaner.4.0.1.exe",
		"ExifCleaner.Setup.4.0.1.exe",
		"ExifCleaner-4.0.1-arm64.dmg",
		"ExifCleaner-4.0.1.dmg",
		"ExifCleaner-4.0.1.AppImage",
		"exifcleaner_4.0.1_amd64.deb",
		"exifcleaner-4.0.1.x86_64.rpm",
		"SHASUMS256.txt",
	];
	const assetNames = Array.isArray(release.assets)
		? release.assets.map((asset) => asset.name)
		: [];
	for (const asset of requiredAssets) {
		if (!assetNames.includes(asset))
			problems.push(`Missing release asset ${asset}`);
	}
	if (assetNames.some((asset) => /\.ya?ml$/i.test(asset))) {
		problems.push("Automatic-update manifests must not be published");
	}
	const releaseBody = typeof release.body === "string" ? release.body : "";
	if (!releaseBody.includes("Windows portable (recommended)")) {
		problems.push("Release notes do not promote the Windows portable build");
	}
	if (!releaseBody.includes("submitted to Microsoft for malware analysis")) {
		problems.push("Release notes do not record Microsoft submissions");
	}
	const virusTotalHashes = new Set(
		Array.from(
			releaseBody.matchAll(
				/https:\/\/(?:www\.)?virustotal\.com\/gui\/file\/([a-f0-9]{64})/g,
			),
		).map((match) => match[1]),
	);
	if (virusTotalHashes.size !== 2) {
		problems.push(
			"Release notes must contain two exact VirusTotal SHA-256 links",
		);
	}
	if (releaseBody.includes("will be added to the draft")) {
		problems.push(
			"Release notes still contain the pre-build security placeholder",
		);
	}

	const expectedStates = new Map([
		[139, ["open", null]],
		[182, ["closed", "not_planned"]],
		[199, ["open", null]],
		[211, ["open", null]],
		[215, ["open", null]],
		[216, ["closed", "not_planned"]],
		[217, ["open", null]],
		[254, ["open", null]],
		[262, ["closed", "not_planned"]],
	]);
	const closeDate = expectedCloseDate(release.published_at);
	for (const [issueNumber, [state, reason]] of expectedStates) {
		const issue = snapshot.issues?.[String(issueNumber)];
		if (issue?.state !== state) {
			problems.push(`Issue #${issueNumber} must be ${state}`);
		}
		if (reason !== null && issue?.state_reason !== reason) {
			problems.push(`Issue #${issueNumber} must close as ${reason}`);
		}
		const marker = PHASE25_MARKERS[issueNumber];
		if (marker === undefined) continue;
		const matchingComments = Array.isArray(issue?.comments)
			? issue.comments.filter(
					(comment) =>
						typeof comment.body === "string" && comment.body.includes(marker),
				)
			: [];
		if (matchingComments.length !== 1) {
			problems.push(
				`Issue #${issueNumber} must contain exactly one Phase 25 comment`,
			);
			continue;
		}
		const body = matchingComments[0]?.body ?? "";
		if ([139, 211, 254].includes(issueNumber)) {
			if (closeDate === undefined || !body.includes(closeDate)) {
				problems.push(`Issue #${issueNumber} has the wrong 30-day close date`);
			}
			if (
				typeof release.html_url !== "string" ||
				!body.includes(release.html_url)
			) {
				problems.push(`Issue #${issueNumber} does not link the exact release`);
			}
		}
	}
	return problems;
}

function runGh(path) {
	const result = spawnSync("gh", ["api", path], { encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(result.stderr || result.stdout || `gh api ${path} failed`);
	}
	return JSON.parse(result.stdout);
}

function readLiveSnapshot() {
	const release = runGh(`repos/${REPOSITORY}/releases/tags/v4.0.1`);
	const issues = {};
	for (const issueNumber of ISSUE_NUMBERS) {
		const issue = runGh(`repos/${REPOSITORY}/issues/${issueNumber}`);
		const comments = runGh(
			`repos/${REPOSITORY}/issues/${issueNumber}/comments?per_page=100`,
		);
		issues[String(issueNumber)] = { ...issue, comments };
	}
	return { release, issues };
}

export function main(argv = process.argv.slice(2)) {
	try {
		const snapshotIndex = argv.indexOf("--snapshot");
		const snapshot =
			snapshotIndex >= 0
				? JSON.parse(fs.readFileSync(argv[snapshotIndex + 1], "utf8"))
				: readLiveSnapshot();
		const problems = evaluatePhase25State(snapshot);
		if (problems.length > 0) {
			for (const problem of problems) console.error(`✗ ${problem}`);
			return 1;
		}
		console.log("✓ PHASE 25 PUBLIC-STATE GATE PASSED");
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
