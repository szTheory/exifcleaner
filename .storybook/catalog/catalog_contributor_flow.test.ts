import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../../tests/helpers/dir_effect";
import { canonicalJson, compareCodeUnits } from "./closed.mjs";
import {
	type CopyFindingsDocument,
	fingerprintFor,
	validateRegister,
} from "./copy_findings_ratchet.mjs";
import { renderFindings } from "./findings_view.mjs";
import {
	git,
	makeCatalogRepo,
	realScript,
	repoRoot,
	runNode,
} from "./temp_repo";

// The contributor flow for a fixed copy deviation (Phase 75.1, D2): the check names
// one command, and running exactly that command turns the check green. Every control
// plants its own deviation inside a temp repo, so none reads a live copy string and
// the real register is never touched.
const CATALOG = ".storybook/catalog/catalog.mjs";
const REGISTER = ".storybook/catalog/copy-findings.json";
const FINDINGS_MD = ".storybook/catalog/FINDINGS.md";
const KNOWN_FINDINGS = "docs/evidence/known-findings.json";
const EN_JSON = ".resources/locales/en.json";
const UNLISTED_KEY = "zz.plantedUnlisted";
const PLANTED_SLUG = "zz-planted-stale";

function withRepo(body: (repo: string) => void): void {
	const repo = makeCatalogRepo();
	try {
		body(repo);
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
}

function run(repo: string, args: string[]) {
	return runNode(realScript(CATALOG), args, repo);
}

// One synthetic stale entry, committed to the temp repo's `main` together with a
// FINDINGS.md rendered from that register: the merge-base equals the head, so
// `added` cannot fire, and the view agrees with the register, so the entry itself is
// the only thing out of date. A `manual` entry carries an `en:` ref the register's
// own scheme accepts, and the key does not exist, so the detector never fires for it.
function plantStale(repo: string): {
	fingerprint: string;
	originalRegister: string;
	originalView: string;
} {
	const registerPath = path.join(repo, REGISTER);
	const originalRegister = fs.readFileSync(registerPath, "utf8");
	const originalView = fs.readFileSync(path.join(repo, FINDINGS_MD), "utf8");
	const doc = JSON.parse(originalRegister) as CopyFindingsDocument;
	const template = doc.entries.find((entry) => entry.kind === "manual");
	if (template === undefined) {
		throw new Error("the register has no manual entry to clone");
	}
	const fingerprint = fingerprintFor("manual", [PLANTED_SLUG]);
	const entries = [...doc.entries];
	const at = entries.findIndex(
		(entry) => compareCodeUnits(entry.fingerprint, fingerprint) > 0,
	);
	entries.splice(at === -1 ? entries.length : at, 0, {
		...template,
		fingerprint,
		ref: "en:no.such.key",
		text: "planted stale entry",
	});
	const planted = { ...doc, entries };
	expect(validateRegister(planted)).toEqual([]);
	fs.writeFileSync(registerPath, canonicalJson(planted));
	const baseline = JSON.parse(
		fs.readFileSync(path.join(repo, KNOWN_FINDINGS), "utf8"),
	);
	fs.writeFileSync(
		path.join(repo, FINDINGS_MD),
		renderFindings({ baseline, copyFindings: planted }),
	);
	git(repo, ["add", "-A"]);
	git(repo, ["commit", "-q", "-m", "plant a stale copy finding"]);
	return { fingerprint, originalRegister, originalView };
}

function packageScripts(): Record<string, string> {
	const manifest = JSON.parse(
		fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
	) as { scripts: Record<string, string> };
	return manifest.scripts;
}

// What a contributor does with the message: read the `yarn <script>` it names and run
// what the real package.json maps that script to. The script must be a plain `node`
// command (no shell), so running it through runNode is the same thing yarn runs.
function commandFromMessage(stderr: string): {
	name: string;
	script: string;
	args: string[];
} {
	const named = /run yarn ([a-z0-9:_-]+) to remove it/.exec(stderr);
	if (named === null) {
		throw new Error(`the message names no yarn script to run: ${stderr}`);
	}
	const name = named[1] ?? "";
	const command = packageScripts()[name];
	if (command === undefined) {
		throw new Error(`package.json has no script ${name}`);
	}
	const [program, script, ...args] = command.split(" ");
	if (program !== "node" || script === undefined) {
		throw new Error(`script ${name} is not a plain node command: ${command}`);
	}
	return { name, script: realScript(script), args };
}

describe("fix a copy deviation (D2)", () => {
	test("shown red: a planted stale entry fails --check with one line that names yarn catalog:write", () => {
		withRepo((repo) => {
			const { fingerprint } = plantStale(repo);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status, result.stdout).toBe(1);
			expect(result.stderr).toBe(
				`✗ CATALOG CHECK FAILED: stale: entry ${fingerprint} no longer matches its detector or its source; run yarn catalog:write to remove it\n`,
			);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("following the message verbatim turns --check green in one command and removes only the entry", () => {
		withRepo((repo) => {
			const { originalRegister, originalView } = plantStale(repo);
			const red = run(repo, ["--check", "--base", "main"]);
			expect(red.status).toBe(1);
			const { script, args } = commandFromMessage(red.stderr);
			const before = snapshotDir(repo);

			const written = runNode(script, args, repo);
			expect(written.status, written.stderr).toBe(0);
			expect(written.stdout).toContain("pruned 1 stale copy findings");
			assertDirEffect(before, snapshotDir(repo), {
				modified: [REGISTER, FINDINGS_MD],
			});
			const register = fs.readFileSync(path.join(repo, REGISTER), "utf8");
			expect(JSON.parse(register)).toEqual(JSON.parse(originalRegister));
			expect(register).toBe(originalRegister);
			expect(fs.readFileSync(path.join(repo, FINDINGS_MD), "utf8")).toBe(
				originalView,
			);

			const green = run(repo, ["--check", "--base", "main"]);
			expect(green.status, green.stderr).toBe(0);

			const settled = snapshotDir(repo);
			const again = runNode(script, args, repo);
			expect(again.status, again.stderr).toBe(0);
			expect(again.stdout).not.toContain("pruned");
			assertDirEffect(settled, snapshotDir(repo), {});
		});
	});

	test("shown red: --write refuses on an unlisted deviation next to a stale entry, names it and changes nothing", () => {
		withRepo((repo) => {
			const { fingerprint: stale } = plantStale(repo);
			// An unlisted deviation: a new en string whose wording the brand lint bans.
			const enPath = path.join(repo, EN_JSON);
			const en = JSON.parse(fs.readFileSync(enPath, "utf8")) as Record<
				string,
				string
			>;
			en[UNLISTED_KEY] = "Just clean it";
			fs.writeFileSync(enPath, `${JSON.stringify(en, null, "\t")}\n`);
			git(repo, ["add", "-A"]);
			git(repo, ["commit", "-q", "-m", "plant an unlisted deviation"]);
			const unlisted = fingerprintFor("banned", [
				"banned.just",
				`en:${UNLISTED_KEY}`,
			]);

			const before = snapshotDir(repo);
			const result = run(repo, ["--write"]);
			expect(result.status, result.stdout).toBe(1);
			expect(result.stderr).toContain("refusing to write");
			expect(result.stderr).toContain("unlisted");
			expect(result.stderr).toContain(unlisted);
			assertDirEffect(before, snapshotDir(repo), {});
			expect(fs.readFileSync(path.join(repo, REGISTER), "utf8")).toContain(
				stale,
			);
		});
	});

	test("the message names the script package.json maps to catalog.mjs --write, so the two cannot drift apart", () => {
		expect(packageScripts()["catalog:write"]).toBe(
			"node .storybook/catalog/catalog.mjs --write",
		);
	});
});
