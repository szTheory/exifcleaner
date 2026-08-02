import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPOSITORY = "szTheory/exifcleaner";
const README_LIMITATIONS =
	"https://github.com/szTheory/exifcleaner/blob/master/README.md#known-limitations-by-format";
const V400_CONTAINER =
	"https://github.com/szTheory/exifcleaner/blob/bf7f88dcdf31ec6bde4c601a058ce5acf3cc218b/src/main/container.ts#L36-L47";
const V400_HANDLER =
	"https://github.com/szTheory/exifcleaner/blob/bf7f88dcdf31ec6bde4c601a058ce5acf3cc218b/src/main/exif_handlers.ts#L23-L38";

export const PHASE25_MARKERS = Object.freeze({
	139: "<!-- exifcleaner-phase25:COMM-04:139 -->",
	182: "<!-- exifcleaner-phase25:COMM-02:182 -->",
	211: "<!-- exifcleaner-phase25:COMM-04:211 -->",
	216: "<!-- exifcleaner-phase25:COMM-02:216 -->",
	217: "<!-- exifcleaner-phase25:COMM-01:217 -->",
	254: "<!-- exifcleaner-phase25:COMM-04:254 -->",
	262: "<!-- exifcleaner-phase25:COMM-03:262 -->",
});

function closeDateFor(publishedAt) {
	const published = Date.parse(publishedAt);
	if (Number.isNaN(published)) {
		throw new Error("--published-at must be an ISO release timestamp");
	}
	return new Date(published + 30 * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);
}

export function buildIssueActions({ stage, releaseUrl, publishedAt }) {
	if (stage === "pre-release") {
		return [
			{
				issue: 217,
				close: false,
				body: `${PHASE25_MARKERS[217]}
Correction to my previous comment: the **Remove macOS attributes** setting in v4.0.0 could not affect embedded MP4 \`Source\` metadata. In the v4.0.0 source, the xattr command was [constructed and returned from the container](${V400_CONTAINER}), but the [\`exif:remove\` handler only called the metadata-strip command](${V400_HANDLER}).

v4.0.1 connects the separate macOS extended-attribute feature to processing, but it does **not** fix or establish the cause of this embedded MP4 \`Source\` report. This issue remains open for evidence-first investigation. Sorry for the incorrect claim.`,
			},
			{
				issue: 216,
				close: true,
				body: `${PHASE25_MARKERS[216]}
Thanks for the report. ExifCleaner uses ExifTool for PDF updates, and ExifTool documents that those updates are reversible because the original PDF metadata is not actually deleted. ExifCleaner therefore cannot promise secure, irreversible PDF metadata removal.

This is now documented in the README's [known limitations by format](${README_LIMITATIONS}). I am closing this as a documented format limitation, not as a shipped fix.`,
			},
			{
				issue: 182,
				close: true,
				body: `${PHASE25_MARKERS[182]}
Thanks for the detailed report. ExifTool exposes Matroska/MKV metadata for reading but does not provide writable Matroska tags, so ExifCleaner cannot reliably remove it without adding a separate remuxing engine.

This is now documented in the README's [known limitations by format](${README_LIMITATIONS}). I am closing this as a documented format limitation, not as a shipped fix.`,
			},
		];
	}

	if (stage !== "post-release") {
		throw new Error("--stage must be pre-release or post-release");
	}
	if (releaseUrl === undefined || publishedAt === undefined) {
		throw new Error(
			"Post-release actions require --release-url and --published-at",
		);
	}
	const closeDate = closeDateFor(publishedAt);
	return [
		{
			issue: 262,
			close: true,
			body: `${PHASE25_MARKERS[262]}
ExifCleaner 4.0.1 remains unsigned, and no signed build is being promised. The release uses three concrete mitigations: the **portable Windows build is now the recommended download**, both exact 4.0.1 Windows executables were submitted to Microsoft's false-positive portal, and the [4.0.1 release notes](${releaseUrl}) link the VirusTotal reports for the exact published SHA-256 values.

Closing this as wontfix-with-mitigations. Reputation-based warnings may still occur; the release notes and checksums identify the exact bytes that were tested and published.`,
		},
		{
			issue: 139,
			close: false,
			body: `${PHASE25_MARKERS[139]}
ExifCleaner 4.0.1 is now available: ${releaseUrl}

Please retest dragging multiple files on Windows 10 with this exact version. If there is no update by **${closeDate}**, this issue will be closed as stale; a later reproduction can still be reported.`,
		},
		{
			issue: 211,
			close: false,
			body: `${PHASE25_MARKERS[211]}
ExifCleaner 4.0.1 is now available: ${releaseUrl}

Please retest drag-and-drop on Fedora with GNOME Wayland using this exact AppImage. If there is no update by **${closeDate}**, this issue will be closed as stale; a later reproduction can still be reported.`,
		},
		{
			issue: 254,
			close: false,
			body: `${PHASE25_MARKERS[254]}
ExifCleaner 4.0.1 is now available: ${releaseUrl}

Please retest the RPM on Fedora with GNOME Wayland using this exact version. If there is no update by **${closeDate}**, this issue will be closed as stale; a later reproduction can still be reported.`,
		},
	];
}

function runGh(args) {
	const result = spawnSync("gh", args, { encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(result.stderr || result.stdout || "gh command failed");
	}
	return result.stdout;
}

function applyAction(action) {
	const comments = JSON.parse(
		runGh(["api", `repos/${REPOSITORY}/issues/${action.issue}/comments`]),
	);
	const marker = PHASE25_MARKERS[action.issue];
	const markerCount = comments.filter(
		(comment) =>
			typeof comment.body === "string" && comment.body.includes(marker),
	).length;
	if (markerCount > 1) {
		throw new Error(`Issue #${action.issue} has duplicate Phase 25 comments`);
	}
	if (markerCount === 0) {
		runGh([
			"api",
			`repos/${REPOSITORY}/issues/${action.issue}/comments`,
			"-X",
			"POST",
			"-f",
			`body=${action.body}`,
		]);
		console.log(`Commented on #${action.issue}`);
	} else {
		console.log(`Skipped existing Phase 25 comment on #${action.issue}`);
	}
	if (action.close) {
		runGh([
			"api",
			`repos/${REPOSITORY}/issues/${action.issue}`,
			"-X",
			"PATCH",
			"-f",
			"state=closed",
			"-f",
			"state_reason=not_planned",
		]);
		console.log(`Closed #${action.issue} as not planned`);
	}
}

export function main(argv = process.argv.slice(2)) {
	try {
		const stageIndex = argv.indexOf("--stage");
		const releaseUrlIndex = argv.indexOf("--release-url");
		const publishedAtIndex = argv.indexOf("--published-at");
		const stage = stageIndex >= 0 ? argv[stageIndex + 1] : undefined;
		const releaseUrl =
			releaseUrlIndex >= 0 ? argv[releaseUrlIndex + 1] : undefined;
		const publishedAt =
			publishedAtIndex >= 0 ? argv[publishedAtIndex + 1] : undefined;
		const actions = buildIssueActions({ stage, releaseUrl, publishedAt });
		if (!argv.includes("--apply")) {
			console.log(JSON.stringify(actions, null, 2));
			return 0;
		}
		for (const action of actions) applyAction(action);
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
