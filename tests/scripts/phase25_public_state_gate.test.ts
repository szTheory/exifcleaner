import { describe, expect, test } from "vitest";
import { PHASE25_MARKERS } from "../../scripts/phase25_issue_actions.mjs";
import { evaluatePhase25State } from "../../scripts/phase25_public_state_gate.mjs";

const RELEASE_URL =
	"https://github.com/szTheory/exifcleaner/releases/tag/v4.0.1";
const PORTABLE_HASH = "a".repeat(64);
const INSTALLER_HASH = "b".repeat(64);
const PUBLISHED_AT = "2026-08-02T23:30:00Z";
const CLOSE_DATE = "2026-09-01";

function issue(
	number: number,
	state: "open" | "closed",
	reason: string | null,
) {
	const marker = PHASE25_MARKERS[number];
	return {
		state,
		state_reason: reason,
		comments:
			marker === undefined
				? []
				: [
						{
							body: `${marker}\n${RELEASE_URL}\n${CLOSE_DATE}`,
						},
					],
	};
}

function validSnapshot() {
	return {
		release: {
			tag_name: "v4.0.1",
			draft: false,
			published_at: PUBLISHED_AT,
			html_url: RELEASE_URL,
			body: `Windows portable (recommended)
submitted to Microsoft for malware analysis
https://www.virustotal.com/gui/file/${PORTABLE_HASH}
https://www.virustotal.com/gui/file/${INSTALLER_HASH}`,
			assets: [
				"ExifCleaner.4.0.1.exe",
				"ExifCleaner.Setup.4.0.1.exe",
				"ExifCleaner-4.0.1-arm64.dmg",
				"ExifCleaner-4.0.1.dmg",
				"ExifCleaner-4.0.1.AppImage",
				"exifcleaner_4.0.1_amd64.deb",
				"exifcleaner-4.0.1.x86_64.rpm",
				"SHASUMS256.txt",
			].map((name) => ({ name })),
		},
		issues: {
			"139": issue(139, "open", null),
			"182": issue(182, "closed", "not_planned"),
			"199": issue(199, "open", null),
			"211": issue(211, "open", null),
			"215": issue(215, "open", null),
			"216": issue(216, "closed", "not_planned"),
			"217": issue(217, "open", null),
			"254": issue(254, "open", null),
			"262": issue(262, "closed", "not_planned"),
		},
	};
}

describe("Phase 25 public-state gate", () => {
	test("accepts the exact published release and allowlisted issue outcomes", () => {
		expect(evaluatePhase25State(validSnapshot())).toEqual([]);
	});

	test("rejects update manifests and an unfinalized security block", () => {
		const snapshot = validSnapshot();
		snapshot.release.assets.push({ name: "latest.yml" });
		snapshot.release.body += "\nwill be added to the draft";

		expect(evaluatePhase25State(snapshot)).toEqual(
			expect.arrayContaining([
				"Automatic-update manifests must not be published",
				"Release notes still contain the pre-build security placeholder",
			]),
		);
	});

	test("rejects a duplicate issue action and a closed investigation", () => {
		const snapshot = validSnapshot();
		const firstComment = snapshot.issues["139"].comments[0];
		if (firstComment !== undefined) {
			snapshot.issues["139"].comments.push(firstComment);
		}
		snapshot.issues["199"].state = "closed";

		expect(evaluatePhase25State(snapshot)).toEqual(
			expect.arrayContaining([
				"Issue #139 must contain exactly one Phase 25 comment",
				"Issue #199 must be open",
			]),
		);
	});
});
