// macOS Gatekeeper regression gate for ad-hoc-signed builds.
//
// Context: ExifCleaner ships unsigned with an ad-hoc signature (scripts/afterPack.cjs).
// There are two distinct macOS failure states and only one of them is acceptable:
//
//   "damaged and can't be opened"  -> NOT bypassable. The user's only option is Trash.
//                                     Caused by an inconsistent bundle: Electron ships
//                                     pre-signed frameworks, and leaving them inside an
//                                     otherwise-unsigned app produces this. Shipped as #290.
//   "unidentified developer"       -> Bypassable via right-click > Open (macOS <= 14) or
//                                     System Settings > Privacy & Security > Open Anyway
//                                     (macOS 15+). This is the acceptable state.
//
// This gate exists to prove every macOS build lands in the second state.
//
// It is deliberately TWO layers, because neither tool alone is sufficient:
//
//   Layer 1  codesign --verify --deep --strict   exit code IS authoritative
//   Layer 2  spctl -a -vv --type execute         exit code is IGNORED; text is parsed
//
// Why layer 2 exists: codesign walks the signature graph but does not run the Gatekeeper
// assessment, so it cannot see sealed-resource / resource-envelope problems. A
// codesign-only check is mechanically what would have let #290 ship green.
//
// Why layer 2 ignores the exit code: an ad-hoc-signed app is EXPECTED by Apple's own
// model to be "rejected" by spctl — that rejection IS what "unidentified developer,
// right-click to override" looks like from the CLI. A gate written as
// `spctl --assess || exit 1` is permanently red on a perfectly healthy build. It then
// gets `|| true`'d within a week and deleted within a month, which is precisely the
// shortcut that let #290 reach users. Most spctl examples online are written by people
// validating Developer-ID-signed, notarized apps where exit 0 is the right target;
// that context does not transfer here.
//
// Usage:  node scripts/gatekeeper_check.mjs --app <path/to/ExifCleaner.app>
//         node scripts/gatekeeper_check.mjs --self-test
//
// Exits 0 when the bundle is an acceptable ad-hoc app, 1 when it is ship-blocking.
// On non-darwin hosts it exits 0 with a skip notice.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

// EMPIRICALLY MEASURED on macOS 26.5 (build 25F71), 2026-07-28, against a real
// `yarn packmacdir` build of this project. Do not replace these with examples from
// Apple forum posts — those describe older macOS and do not match.
//
//   bundle state              codesign --verify --deep --strict   spctl -a -vv
//   -----------------------   --------------------------------   ---------------------------
//   healthy ad-hoc            exit 0, no output                  "rejected", NO source line
//   unsigned nested helper    exit 1, "not signed at all"        "rejected", source=no usable signature
//   broken outer seal         exit 1, "not signed at all"        "rejected", source=no usable signature
//
// Three consequences, each of which contradicts an assumption this gate was built on:
//
//  1. A HEALTHY ad-hoc bundle emits NO `source=` line at all. An earlier version of
//     this parser required one and failed closed without it — i.e. it rejected every
//     healthy build. Requiring a source= line is wrong.
//
//  2. `source=no usable signature` appears on BROKEN bundles here, not healthy ones.
//     It was originally in the allow-list. That is inverted on this macOS. Its meaning
//     is version-dependent, so this gate does NOT branch on it either way — treating it
//     as fatal risks false-failing on an older macOS where it is the healthy signal.
//
//  3. codesign (layer 1) caught BOTH break variants, including the one deliberately
//     constructed to be the "spctl-only" case. The two-layer rationale — that spctl
//     sees resource-envelope problems codesign structurally cannot — did NOT reproduce
//     here. Layer 1 is the authoritative discriminator; layer 2 is a net for specific
//     corruption strings that may surface on other macOS versions.
//
// Recorded rather than quietly dropped, per the negative-test protocol in
// tests/smoke/README.md: if the evidence contradicts the justification, change the
// justification.

// Unambiguous corruption. These are fatal on any macOS version — none of them can
// describe a healthy bundle.
const FATAL_MARKERS = [
	"damaged",
	"a sealed resource is missing or invalid",
	"resource envelope is obsolete",
	"obsolete resource envelope",
	"invalid signature",
	"code object is not signed at all",
	"resource fork, finder information, or similar detritus not allowed",
	"invalid info.plist",
	"malformed",
];

/**
 * Classify `spctl -a -vv` output. Pure function — unit-tested in
 * tests/scripts/gatekeeper_check.test.ts over recorded fixtures, so the parser
 * (the part that rots) is covered on every PR regardless of host platform.
 *
 * Deliberately does NOT require a `source=` line and does NOT branch on
 * `no usable signature` — see the measurement table above.
 *
 * @param {string} output combined stdout+stderr from spctl
 * @returns {{ok: boolean, source?: string, reason?: string}}
 */
export function classifySpctl(output) {
	const text = String(output).toLowerCase();

	const fatal = FATAL_MARKERS.find((marker) => text.includes(marker));
	if (fatal !== undefined) {
		return { ok: false, reason: `fatal marker in spctl output: "${fatal}"` };
	}

	const match = /source=([^\n\r]*)/i.exec(output);
	const source = match?.[1]?.trim().toLowerCase() ?? "(none)";

	return { ok: true, source };
}

function run(file, args) {
	try {
		const stdout = execFileSync(file, args, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		return { code: 0, output: stdout };
	} catch (err) {
		const e =
			/** @type {{status?: number, stdout?: string, stderr?: string}} */ (err);
		return {
			code: e.status ?? 1,
			output: `${e.stdout ?? ""}${e.stderr ?? ""}`,
		};
	}
}

function fail(message) {
	console.error(`\n✗ GATEKEEPER GATE FAILED: ${message}\n`);
	process.exit(1);
}

function checkApp(appPath) {
	if (!existsSync(appPath)) {
		fail(`no such bundle: ${appPath}`);
	}

	// Reject anything that is not a .app up front. codesign will happily run against
	// an inner directory and report "bundle format unrecognized, invalid, or unsuitable"
	// — indistinguishable, to this script, from a genuinely broken signature. CI run
	// 30419211027 hit exactly that: a caller passed ".../ExifCleaner.app/Contents" and
	// the gate reported a healthy build as the unbypassable "damaged" class.
	// A mis-wired path is a usage error and must not be reported as a signing verdict.
	if (!appPath.endsWith(".app")) {
		fail(
			`--app must point at a .app bundle, got: ${appPath}\n` +
				`  (if you derived this from the executable path, strip /Contents/MacOS/<name>)`,
		);
	}

	// Work on a copy so the shipping artifact is never mutated by the gate.
	// ditto (not cp -R) preserves extended attributes, symlinks, and the signature.
	const scratch = mkdtempSync(path.join(tmpdir(), "exifcleaner-gk-"));
	const target = path.join(scratch, path.basename(appPath));
	run("ditto", [appPath, target]);

	try {
		// Step 1 — apply a realistic quarantine attribute.
		//
		// Generated per-run rather than hardcoded from a blog: the flag semantics have
		// drifted across macOS versions (0001/0081/0083 all appear in the wild) and the
		// thing that matters is that SOME quarantine xattr is present to trigger the
		// download-time assessment path at all.
		//
		// Bundle root ONLY, not recursive — that is what Finder and a browser actually
		// produce. A recursive set is not a faithful simulation.
		const quarantineValue = `0081;${Math.floor(Date.now() / 1000).toString(16)};ExifCleanerCI;${randomUUID()}`;
		run("xattr", ["-w", "com.apple.quarantine", quarantineValue, target]);

		// Step 2 — VACUITY GUARD. Read the attribute back and compare.
		//
		// This is the step everyone omits and it is what keeps the gate honest. If a
		// future macOS or runner image makes `xattr -w` a silent no-op, an unquarantined
		// app skips Gatekeeper's download-time checks entirely, both layers below pass
		// trivially, and the gate stays green forever while testing nothing.
		const readBack = run("xattr", ["-p", "com.apple.quarantine", target]);
		if (readBack.code !== 0 || !readBack.output.includes(quarantineValue)) {
			fail(
				"quarantine attribute did not apply — every assertion below would be vacuous.\n" +
					`  wrote: ${quarantineValue}\n` +
					`  read back: ${readBack.output.trim() || "(nothing)"}`,
			);
		}
		console.log(`  quarantine applied and verified: ${quarantineValue}`);

		// Step 3 — LAYER 1. codesign, exit code authoritative. Fail fast: if the bundle
		// is structurally broken it is broken regardless of what spctl thinks.
		const codesign = run("codesign", [
			"--verify",
			"--deep",
			"--strict",
			"--verbose=4",
			target,
		]);
		console.log("\n--- codesign --verify --deep --strict ---");
		console.log(codesign.output.trim() || "(no output)");
		if (codesign.code !== 0) {
			fail(
				`codesign --verify --deep --strict exited ${codesign.code}. ` +
					"The bundle has a structurally invalid signature — this is the " +
					'"damaged" class of failure that is NOT user-bypassable.',
			);
		}
		console.log("  ✓ layer 1 passed: signature is structurally well-formed");

		// Step 4 — LAYER 2. spctl, exit code deliberately ignored, text parsed.
		const spctl = run("spctl", ["-a", "-vv", "--type", "execute", target]);
		console.log("\n--- spctl -a -vv --type execute ---");
		console.log(spctl.output.trim() || "(no output)");
		console.log(
			`  (exit code ${spctl.code} is EXPECTED to be nonzero for an ad-hoc build and is ignored)`,
		);

		const verdict = classifySpctl(spctl.output);
		if (!verdict.ok) {
			fail(`spctl verdict rejected: ${verdict.reason}`);
		}
		console.log(
			`  ✓ layer 2 passed: no corruption markers (source=${verdict.source})`,
		);

		// Spot-check that the ad-hoc re-sign actually reached a nested helper. A helper
		// showing an older identity than the outer app means --deep did not walk it.
		const helper = path.join(
			target,
			"Contents/Frameworks/ExifCleaner Helper.app",
		);
		if (existsSync(helper)) {
			const helperInfo = run("codesign", ["-dv", "--verbose=4", helper]);
			console.log("\n--- nested helper spot-check ---");
			console.log(helperInfo.output.trim() || "(no output)");
		}

		console.log(
			"\n✓ GATEKEEPER GATE PASSED — bundle is ad-hoc signed and will show the " +
				'bypassable "unidentified developer" dialog, not "damaged".\n',
		);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

function main() {
	const args = process.argv.slice(2);

	if (process.platform !== "darwin") {
		console.log("gatekeeper_check: not darwin, skipping.");
		process.exit(0);
	}

	const appIndex = args.indexOf("--app");
	if (appIndex === -1 || args[appIndex + 1] === undefined) {
		console.error(
			"usage: node scripts/gatekeeper_check.mjs --app <path/to/ExifCleaner.app>",
		);
		process.exit(2);
	}

	checkApp(path.resolve(args[appIndex + 1]));
}

// Only run when invoked directly, so the module can be imported by tests.
if (
	process.argv[1] !== undefined &&
	import.meta.url.endsWith(path.basename(process.argv[1]))
) {
	main();
}
