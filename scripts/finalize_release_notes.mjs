import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BLOCK_START = "<!-- exifcleaner-windows-security:start v1 -->";
const BLOCK_END = "<!-- exifcleaner-windows-security:end -->";

function parseArguments(argv) {
	const values = new Map();
	for (let index = 0; index < argv.length; index += 2) {
		const key = argv[index];
		const value = argv[index + 1];
		if (key === undefined || value === undefined || !key.startsWith("--")) {
			throw new Error(
				"Usage: finalize_release_notes.mjs --notes <path> --shas <path> --evidence <path> --output <path>",
			);
		}
		values.set(key, value);
	}
	return values;
}

export function parseChecksums(source) {
	const checksums = new Map();
	for (const line of source.split(/\r?\n/)) {
		if (line.trim() === "") continue;
		const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line);
		if (match === null) {
			throw new Error(`Invalid SHASUMS256.txt line: ${line}`);
		}
		const hash = match[1];
		const filename = match[2];
		if (hash === undefined || filename === undefined) {
			throw new Error(`Invalid SHASUMS256.txt line: ${line}`);
		}
		checksums.set(path.basename(filename), hash.toLowerCase());
	}
	return checksums;
}

function validateVirusTotalUrl(url, sha256) {
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`Invalid VirusTotal URL for ${sha256}`);
	}
	const validHost =
		parsed.hostname === "virustotal.com" ||
		parsed.hostname === "www.virustotal.com";
	const validPath =
		parsed.pathname === `/gui/file/${sha256}` ||
		parsed.pathname.startsWith(`/gui/file/${sha256}/`);
	if (parsed.protocol !== "https:" || !validHost || !validPath) {
		throw new Error(`VirusTotal URL does not identify SHA-256 ${sha256}`);
	}
}

function validateSubmission(submission, checksums) {
	if (
		typeof submission !== "object" ||
		submission === null ||
		typeof submission.artifact !== "string" ||
		typeof submission.sha256 !== "string" ||
		typeof submission.virusTotalUrl !== "string" ||
		typeof submission.microsoftSubmissionId !== "string" ||
		typeof submission.submittedAt !== "string"
	) {
		throw new Error(
			"Each Windows submission must contain all required string fields",
		);
	}
	const expectedHash = checksums.get(submission.artifact);
	const actualHash = submission.sha256.toLowerCase();
	if (expectedHash === undefined) {
		throw new Error(`${submission.artifact} is absent from SHASUMS256.txt`);
	}
	if (actualHash !== expectedHash) {
		throw new Error(
			`${submission.artifact} SHA-256 does not match SHASUMS256.txt`,
		);
	}
	if (submission.microsoftSubmissionId.trim() === "") {
		throw new Error(
			`${submission.artifact} has no Microsoft submission receipt`,
		);
	}
	if (Number.isNaN(Date.parse(submission.submittedAt))) {
		throw new Error(
			`${submission.artifact} has an invalid submission timestamp`,
		);
	}
	validateVirusTotalUrl(submission.virusTotalUrl, actualHash);
	return {
		artifact: submission.artifact,
		sha256: actualHash,
		virusTotalUrl: submission.virusTotalUrl,
		submittedAt: submission.submittedAt,
	};
}

export function buildFinalReleaseNotes({ notes, shas, evidence }) {
	if (evidence?.schemaVersion !== 1 || !Array.isArray(evidence.submissions)) {
		throw new Error("Windows security evidence must use schemaVersion 1");
	}
	const startCount = notes.split(BLOCK_START).length - 1;
	const endCount = notes.split(BLOCK_END).length - 1;
	if (startCount !== 1 || endCount !== 1) {
		throw new Error(
			"Release notes must contain exactly one Windows security block",
		);
	}

	const checksums = parseChecksums(shas);
	const versionMatch = /^# ExifCleaner (\d+\.\d+\.\d+)$/m.exec(notes);
	const version = versionMatch?.[1];
	if (version === undefined) {
		throw new Error(
			"Release notes have no canonical ExifCleaner version heading",
		);
	}
	const expectedArtifacts = [
		`ExifCleaner.${version}.exe`,
		`ExifCleaner.Setup.${version}.exe`,
	];
	const submissions = evidence.submissions.map((submission) =>
		validateSubmission(submission, checksums),
	);
	if (submissions.length !== expectedArtifacts.length) {
		throw new Error(
			"Evidence must contain exactly the two Windows release artifacts",
		);
	}
	for (const artifact of expectedArtifacts) {
		if (submissions.filter((item) => item.artifact === artifact).length !== 1) {
			throw new Error(
				`Evidence must contain exactly one record for ${artifact}`,
			);
		}
	}

	const byArtifact = new Map(
		submissions.map((submission) => [submission.artifact, submission]),
	);
	const labels = new Map([
		[expectedArtifacts[0], "Windows portable (recommended)"],
		[expectedArtifacts[1], "Windows installer"],
	]);
	const lines = expectedArtifacts.map((artifact) => {
		const submission = byArtifact.get(artifact);
		if (submission === undefined) throw new Error(`Missing ${artifact}`);
		const submittedDate = submission.submittedAt.slice(0, 10);
		return `- **${labels.get(artifact)}:** \`${artifact}\` — SHA-256 \`${submission.sha256}\`; [VirusTotal report](${submission.virusTotalUrl}); submitted to Microsoft for malware analysis on ${submittedDate}.`;
	});
	const replacement = [
		BLOCK_START,
		"## Windows security checks",
		"",
		...lines,
		"",
		"These unsigned artifacts may still trigger reputation-based warnings. The links above identify the exact release bytes; they are not a promise that every scanner reports zero detections.",
		BLOCK_END,
	].join("\n");

	const before = notes.indexOf(BLOCK_START);
	const after = notes.indexOf(BLOCK_END) + BLOCK_END.length;
	return `${notes.slice(0, before)}${replacement}${notes.slice(after)}`;
}

export function main(argv = process.argv.slice(2)) {
	try {
		const args = parseArguments(argv);
		const notesPath = args.get("--notes");
		const shasPath = args.get("--shas");
		const evidencePath = args.get("--evidence");
		const outputPath = args.get("--output");
		if (
			notesPath === undefined ||
			shasPath === undefined ||
			evidencePath === undefined ||
			outputPath === undefined
		) {
			throw new Error(
				"Usage: finalize_release_notes.mjs --notes <path> --shas <path> --evidence <path> --output <path>",
			);
		}
		const notes = fs.readFileSync(notesPath, "utf8");
		const shas = fs.readFileSync(shasPath, "utf8");
		const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
		fs.writeFileSync(
			outputPath,
			buildFinalReleaseNotes({ notes, shas, evidence }),
			"utf8",
		);
		console.log(`✓ Final release notes written to ${outputPath}`);
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
