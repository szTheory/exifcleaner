import { describe, expect, test } from "vitest";
import {
	buildFinalReleaseNotes,
	parseChecksums,
} from "../../scripts/finalize_release_notes.mjs";

const PORTABLE_HASH = "a".repeat(64);
const INSTALLER_HASH = "b".repeat(64);
const NOTES = `# ExifCleaner 4.0.1

Before.

<!-- exifcleaner-windows-security:start v1 -->
Pending.
<!-- exifcleaner-windows-security:end -->

After.
`;
const SHAS = `${PORTABLE_HASH}  ExifCleaner.4.0.1.exe
${INSTALLER_HASH}  ./nested/ExifCleaner.Setup.4.0.1.exe
`;

type Submission = {
	artifact: string;
	sha256: string;
	virusTotalUrl: string;
	microsoftSubmissionId: string;
	submittedAt: string;
};

type Evidence = {
	schemaVersion: number;
	submissions: [Submission, Submission];
};

function evidence(): Evidence {
	return {
		schemaVersion: 1,
		submissions: [
			{
				artifact: "ExifCleaner.4.0.1.exe",
				sha256: PORTABLE_HASH,
				virusTotalUrl: `https://www.virustotal.com/gui/file/${PORTABLE_HASH}`,
				microsoftSubmissionId: "receipt-portable",
				submittedAt: "2026-08-02T12:00:00Z",
			},
			{
				artifact: "ExifCleaner.Setup.4.0.1.exe",
				sha256: INSTALLER_HASH,
				virusTotalUrl: `https://www.virustotal.com/gui/file/${INSTALLER_HASH}/detection`,
				microsoftSubmissionId: "receipt-installer",
				submittedAt: "2026-08-02T12:01:00Z",
			},
		],
	};
}

describe("release-note security finalizer", () => {
	test("binds both Windows reports and Microsoft submissions to exact release hashes", () => {
		const result = buildFinalReleaseNotes({
			notes: NOTES,
			shas: SHAS,
			evidence: evidence(),
		});

		expect(result).toContain(`SHA-256 \`${PORTABLE_HASH}\``);
		expect(result).toContain(`SHA-256 \`${INSTALLER_HASH}\``);
		expect(result).toContain("submitted to Microsoft for malware analysis");
		expect(result).toContain("Before.");
		expect(result).toContain("After.");
		expect(result).not.toContain("Pending.");
	});

	test("parses checksum paths by release filename", () => {
		const checksums = parseChecksums(SHAS);

		expect(checksums.get("ExifCleaner.4.0.1.exe")).toBe(PORTABLE_HASH);
		expect(checksums.get("ExifCleaner.Setup.4.0.1.exe")).toBe(INSTALLER_HASH);
	});

	const invalidEvidenceCases: Array<[string, (subject: Evidence) => void]> = [
		[
			"mismatched hash",
			(subject) => {
				subject.submissions[0].sha256 = "c".repeat(64);
			},
		],
		[
			"wrong VirusTotal target",
			(subject) => {
				subject.submissions[0].virusTotalUrl = `https://www.virustotal.com/gui/file/${INSTALLER_HASH}`;
			},
		],
		[
			"missing Microsoft receipt",
			(subject) => {
				subject.submissions[0].microsoftSubmissionId = "";
			},
		],
	];

	test.each(invalidEvidenceCases)("rejects %s", (_name, mutate) => {
		const subject = evidence();
		mutate(subject);

		expect(() =>
			buildFinalReleaseNotes({ notes: NOTES, shas: SHAS, evidence: subject }),
		).toThrow();
	});

	test("rejects duplicate managed blocks", () => {
		expect(() =>
			buildFinalReleaseNotes({
				notes: `${NOTES}\n${NOTES}`,
				shas: SHAS,
				evidence: evidence(),
			}),
		).toThrow("exactly one Windows security block");
	});
});
