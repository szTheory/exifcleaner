import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	BRAND_REPO,
	CACHE_DIR_NAME,
	PIN_FILE_NAME,
	ZIP_FILE_NAME,
	pinUrl,
	readPin,
	serializePin,
	sha256Hex,
	type BrandPin,
} from "../../../scripts/brand_lib.mjs";
import {
	MANIFEST_FILE_NAME,
	VENDORED_DIR,
	main,
	vendoredProblems,
} from "../../../scripts/brand_vendored_check.mjs";
import { assertDirEffect, snapshotDir } from "../../helpers/dir_effect";
import { BRAND_FIXTURE_ENTRIES, buildZip } from "../../helpers/zip_fixture";
import expectedManifest from "./brand_vendored_expected.json";

// GAT-04 / D-17, D-18: a vendored brand asset must equal its pinned source byte for byte.
//
// brand.vendored.json (beside brand.pin.json) lists each vendored file as
// { source, target, sha256 }: `source` is a path inside the pinned brand zip's root, `target`
// is the vendored copy under src/renderer/assets/brand/, and `sha256` is the hash both must
// have. The list is empty today (SUR-03 fills it in Phase 79), so these tests drive the
// checker with fixture zips and temporary trees; the real tree runs the 3-state cache rule.
//
// No test touches the network: the global fetch is a trap, and `ensureBrand` runs offline.
// The 3-state rule never skips (known_gap_gate.mjs forbids the skip family under tests/, and a
// skip in CI is a silent pass): the cache is present (assert), absent locally (record
// "absent"), or absent under CI (fail).

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const COMMIT = "a".repeat(40);
const goodZip = buildZip(BRAND_FIXTURE_ENTRIES);
const PIN: BrandPin = {
	repo: BRAND_REPO,
	commit: COMMIT,
	url: pinUrl(BRAND_REPO, COMMIT),
	sha256: sha256Hex(goodZip),
	size: goodZip.length,
	root: "exifcleaner-brand",
};

// An entry of BRAND_FIXTURE_ENTRIES: `exifcleaner-brand/assets/logo/mark.svg` holds "<svg/>".
const SOURCE = "assets/logo/mark.svg";
const SOURCE_BYTES = Buffer.from("<svg/>");
const TARGET = `${VENDORED_DIR}/mark.svg`;
const GOOD_ROW = {
	source: SOURCE,
	target: TARGET,
	sha256: sha256Hex(SOURCE_BYTES),
};

let tmp: string;
const fetchTrap = vi.fn(() => {
	throw new Error("unexpected network access");
});

beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brand-vendored-test-"));
	fetchTrap.mockClear();
	vi.stubGlobal("fetch", fetchTrap);
});
afterEach(() => {
	vi.unstubAllGlobals();
	fs.rmSync(tmp, { recursive: true, force: true });
});

function manifestWith(files: unknown[], brandPin: string = COMMIT): unknown {
	return { brandPin, files };
}

// Lays out a temporary repository root: the cached zip (or none) and the vendored files.
function arrange({
	cache = goodZip,
	vendored = {},
}: {
	cache?: Buffer | null;
	vendored?: Record<string, string | Buffer>;
} = {}): { root: string; cacheDir: string; vendoredDir: string } {
	const cacheDir = path.join(tmp, CACHE_DIR_NAME);
	if (cache !== null) {
		fs.mkdirSync(cacheDir, { recursive: true });
		fs.writeFileSync(path.join(cacheDir, ZIP_FILE_NAME), cache);
	}
	for (const [target, data] of Object.entries(vendored)) {
		const file = path.join(tmp, target);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, data);
	}
	return { root: tmp, cacheDir, vendoredDir: path.join(tmp, VENDORED_DIR) };
}

async function problemsFor({
	manifest,
	cache,
	vendored,
}: {
	manifest: unknown;
	cache?: Buffer | null;
	vendored?: Record<string, string | Buffer>;
}) {
	const layout = arrange({
		...(cache === undefined ? {} : { cache }),
		...(vendored === undefined ? {} : { vendored }),
	});
	return vendoredProblems({ ...layout, pin: PIN, manifest });
}

const codes = (problems: Array<{ code: string }>): string[] =>
	problems.map((problem) => problem.code).sort();

describe("vendoredProblems: the manifest and the cache", () => {
	test("a valid cache and the empty manifest give no problem", async () => {
		expect(await problemsFor({ manifest: manifestWith([]) })).toEqual([]);
		expect(fetchTrap).not.toHaveBeenCalled();
	});

	test("whole-directory effect: the check only unpacks into the cache and never touches the manifest, the zip or a vendored file", async () => {
		const layout = arrange({ vendored: { [TARGET]: SOURCE_BYTES } });
		const before = snapshotDir(layout.root);
		const problems = await vendoredProblems({
			...layout,
			pin: PIN,
			manifest: manifestWith([GOOD_ROW]),
		});
		expect(problems).toEqual([]);
		assertDirEffect(before, snapshotDir(layout.root), {
			added: [
				`${CACHE_DIR_NAME}/unpacked`,
				`${CACHE_DIR_NAME}/unpacked/.pin-sha256`,
				`${CACHE_DIR_NAME}/unpacked/exifcleaner-brand`,
				`${CACHE_DIR_NAME}/unpacked/exifcleaner-brand/BRAND.md`,
				`${CACHE_DIR_NAME}/unpacked/exifcleaner-brand/assets`,
				`${CACHE_DIR_NAME}/unpacked/exifcleaner-brand/assets/fonts`,
				`${CACHE_DIR_NAME}/unpacked/exifcleaner-brand/assets/fonts/OFL-Alpha.txt`,
				`${CACHE_DIR_NAME}/unpacked/exifcleaner-brand/assets/fonts/OFL-Beta.txt`,
				`${CACHE_DIR_NAME}/unpacked/exifcleaner-brand/assets/fonts/static`,
				`${CACHE_DIR_NAME}/unpacked/exifcleaner-brand/assets/fonts/static/Alpha-Regular.ttf`,
				`${CACHE_DIR_NAME}/unpacked/exifcleaner-brand/assets/logo`,
				`${CACHE_DIR_NAME}/unpacked/exifcleaner-brand/assets/logo/mark.svg`,
			],
			unchanged: [`${CACHE_DIR_NAME}/${ZIP_FILE_NAME}`, TARGET],
		});
	});

	test("whole-directory effect: an invalid cache adds, changes and removes nothing", async () => {
		const flipped = Buffer.from(goodZip);
		flipped[0] = (flipped[0] ?? 0) ^ 0xff;
		const layout = arrange({
			cache: flipped,
			vendored: { [TARGET]: SOURCE_BYTES },
		});
		const before = snapshotDir(layout.root);
		const problems = await vendoredProblems({
			...layout,
			pin: PIN,
			manifest: manifestWith([GOOD_ROW]),
		});
		expect(codes(problems)).toEqual(["cache"]);
		assertDirEffect(before, snapshotDir(layout.root), {
			unchanged: [`${CACHE_DIR_NAME}/${ZIP_FILE_NAME}`, TARGET],
		});
	});

	test("a manifest brandPin that differs from the pin commit is a problem", async () => {
		const problems = await problemsFor({
			manifest: manifestWith([], "b".repeat(40)),
		});
		expect(codes(problems)).toEqual(["pin-mismatch"]);
	});

	test("a cache zip whose sha256 differs from the pin is a problem, never a pass", async () => {
		const flipped = Buffer.from(goodZip);
		flipped[0] = (flipped[0] ?? 0) ^ 0xff;
		const problems = await problemsFor({
			manifest: manifestWith([]),
			cache: flipped,
		});
		expect(codes(problems)).toEqual(["cache"]);
		expect(problems[0]?.message).toContain("brand zip");
	});

	test("a cache zip whose size differs from the pin is a problem, never a pass", async () => {
		const problems = await problemsFor({
			manifest: manifestWith([]),
			cache: Buffer.concat([goodZip, Buffer.from("x")]),
		});
		expect(codes(problems)).toEqual(["cache"]);
	});

	test("an absent cache is a problem and never reaches the network", async () => {
		const problems = await problemsFor({
			manifest: manifestWith([]),
			cache: null,
		});
		expect(codes(problems)).toEqual(["cache"]);
		expect(problems[0]?.message).toContain("no cached brand zip");
		expect(fetchTrap).not.toHaveBeenCalled();
	});

	test("an invalid cache does not hide a manifest problem", async () => {
		const problems = await problemsFor({
			manifest: manifestWith([], "b".repeat(40)),
			cache: null,
		});
		expect(codes(problems)).toEqual(["cache", "pin-mismatch"]);
	});

	test.each([
		["null", null],
		["a string", "manifest"],
		["an array", []],
		["no files array", { brandPin: COMMIT }],
		["files not an array", { brandPin: COMMIT, files: {} }],
		["no brandPin", { files: [] }],
		["an extra top-level key", { brandPin: COMMIT, files: [], note: "x" }],
		["a row that is not an object", manifestWith(["row"])],
		["a row with an extra key", manifestWith([{ ...GOOD_ROW, mode: "0644" }])],
		[
			"a row without a target",
			manifestWith([{ source: SOURCE, sha256: GOOD_ROW.sha256 }]),
		],
		[
			"a sha256 that is not 64 lowercase hex characters",
			manifestWith([{ ...GOOD_ROW, sha256: GOOD_ROW.sha256.toUpperCase() }]),
		],
	])(
		"a malformed manifest (%s) is a manifest-shape problem",
		async (_name, manifest) => {
			const problems = await problemsFor({ manifest });
			expect(codes(problems)).toContain("manifest-shape");
		},
	);
});

describe("vendoredProblems: rows", () => {
	test("a row whose source and vendored file match its sha256 passes", async () => {
		expect(
			await problemsFor({
				manifest: manifestWith([GOOD_ROW]),
				vendored: { [TARGET]: SOURCE_BYTES },
			}),
		).toEqual([]);
	});

	test("negative control: a planted wrong sha256 is red for the source and the vendored file", async () => {
		const problems = await problemsFor({
			manifest: manifestWith([{ ...GOOD_ROW, sha256: "0".repeat(64) }]),
			vendored: { [TARGET]: SOURCE_BYTES },
		});
		expect(codes(problems)).toEqual(["source-hash", "vendored-hash"]);
	});

	test("a vendored file edited after vendoring is red (its source still matches)", async () => {
		const problems = await problemsFor({
			manifest: manifestWith([GOOD_ROW]),
			vendored: { [TARGET]: "<svg>edited</svg>" },
		});
		expect(codes(problems)).toEqual(["vendored-hash"]);
	});

	test("a cache source that no longer matches a pinned row is red (the vendored file still matches)", async () => {
		const edited = Buffer.from("<svg>other</svg>");
		const problems = await problemsFor({
			manifest: manifestWith([{ ...GOOD_ROW, sha256: sha256Hex(edited) }]),
			vendored: { [TARGET]: edited },
		});
		expect(codes(problems)).toEqual(["source-hash"]);
	});

	test("a vendored file with no manifest row is red, in any subdirectory", async () => {
		const problems = await problemsFor({
			manifest: manifestWith([GOOD_ROW]),
			vendored: {
				[TARGET]: SOURCE_BYTES,
				[`${VENDORED_DIR}/sub/extra.svg`]: "<svg/>",
			},
		});
		expect(codes(problems)).toEqual(["unlisted-vendored"]);
		expect(problems[0]?.message).toContain(`${VENDORED_DIR}/sub/extra.svg`);
	});

	test.each([
		["a parent segment", "../BRAND.md"],
		["an embedded parent segment", "assets/../../BRAND.md"],
		["an absolute path", "/etc/passwd"],
		["a backslash", "assets\\logo\\mark.svg"],
		["an empty path", ""],
	])(
		"a row whose source has %s is red (outside the brand root)",
		async (_name, source) => {
			const problems = await problemsFor({
				manifest: manifestWith([{ ...GOOD_ROW, source }]),
				vendored: { [TARGET]: SOURCE_BYTES },
			});
			expect(codes(problems)).toEqual(["source-unresolvable"]);
		},
	);

	test("a row whose source is not in the cached brand is red", async () => {
		const problems = await problemsFor({
			manifest: manifestWith([{ ...GOOD_ROW, source: "assets/logo/nope.svg" }]),
			vendored: { [TARGET]: SOURCE_BYTES },
		});
		expect(codes(problems)).toEqual(["source-missing"]);
	});

	test("a row whose vendored file is absent is red", async () => {
		const problems = await problemsFor({ manifest: manifestWith([GOOD_ROW]) });
		expect(codes(problems)).toEqual(["vendored-missing"]);
	});

	test("a row whose target lies outside the vendored directory is red", async () => {
		const outside = "src/renderer/assets/other/mark.svg";
		const problems = await problemsFor({
			manifest: manifestWith([{ ...GOOD_ROW, target: outside }]),
			vendored: { [outside]: SOURCE_BYTES },
		});
		expect(codes(problems)).toEqual(["target-outside"]);
	});

	test("two rows for one target are red", async () => {
		const problems = await problemsFor({
			manifest: manifestWith([GOOD_ROW, GOOD_ROW]),
			vendored: { [TARGET]: SOURCE_BYTES },
		});
		expect(codes(problems)).toEqual(["duplicate-target"]);
	});

	test("rows are not checked against an invalid cache (one cache problem, no noise)", async () => {
		const problems = await problemsFor({
			manifest: manifestWith([GOOD_ROW]),
			vendored: { [TARGET]: SOURCE_BYTES },
			cache: null,
		});
		expect(codes(problems)).toEqual(["cache"]);
	});
});

describe("brand_vendored_check main (the strict CLI body)", () => {
	function arrangeRepo({
		cache,
		manifestText,
	}: {
		cache: Buffer | null;
		manifestText?: string;
	}): string {
		fs.writeFileSync(path.join(tmp, PIN_FILE_NAME), serializePin(PIN));
		if (manifestText !== undefined) {
			fs.writeFileSync(path.join(tmp, MANIFEST_FILE_NAME), manifestText);
		}
		arrange({ cache });
		return tmp;
	}

	const lines = (): { out: string[]; err: string[] } => ({ out: [], err: [] });

	test("exits 0 with a valid cache and prints the pass line with the file count and short pin", async () => {
		const root = arrangeRepo({
			cache: goodZip,
			manifestText: `${JSON.stringify(manifestWith([]), null, "\t")}\n`,
		});
		const { out, err } = lines();
		const code = await main({
			root,
			log: (line) => out.push(line),
			error: (line) => err.push(line),
		});
		expect(code).toBe(0);
		expect(out).toEqual(["BRAND VENDORED CHECK PASSED (0 files, pin aaaaaaa)"]);
		expect(err).toEqual([]);
	});

	test("exits 1 when the cache is absent (strict, D-18)", async () => {
		const root = arrangeRepo({
			cache: null,
			manifestText: `${JSON.stringify(manifestWith([]), null, "\t")}\n`,
		});
		const { out, err } = lines();
		const before = snapshotDir(root);
		const code = await main({
			root,
			log: (line) => out.push(line),
			error: (line) => err.push(line),
		});
		expect(code).toBe(1);
		expect(out).toEqual([]);
		// Whole-directory effect: a failed strict run creates nothing (no cache is fetched
		// or half-written) and leaves the pin and the manifest as they were.
		assertDirEffect(before, snapshotDir(root), {
			unchanged: [PIN_FILE_NAME, MANIFEST_FILE_NAME],
		});
		expect(err.join("\n")).toContain("cache");
		expect(err.join("\n")).toContain("BRAND VENDORED CHECK FAILED");
		expect(fetchTrap).not.toHaveBeenCalled();
	});

	test("exits 1 on a manifest problem with a valid cache", async () => {
		const root = arrangeRepo({
			cache: goodZip,
			manifestText: `${JSON.stringify(manifestWith([], "b".repeat(40)), null, "\t")}\n`,
		});
		const { err } = lines();
		const code = await main({
			root,
			log: () => {},
			error: (line) => err.push(line),
		});
		expect(code).toBe(1);
		expect(err.join("\n")).toContain("pin-mismatch");
	});

	test.each([
		["is missing", undefined],
		["is not JSON", "{ not json"],
	])(
		"exits 1, never throws, when the manifest file %s",
		async (_name, manifestText) => {
			const root = arrangeRepo({
				cache: goodZip,
				...(manifestText === undefined ? {} : { manifestText }),
			});
			const { err } = lines();
			const code = await main({
				root,
				log: () => {},
				error: (line) => err.push(line),
			});
			expect(code).toBe(1);
			expect(err.join("\n")).toContain("manifest");
		},
	);
});

describe("the real repository (3-state cache rule, no skip)", () => {
	const realZip = path.join(REPO_ROOT, CACHE_DIR_NAME, ZIP_FILE_NAME);
	const state = fs.existsSync(realZip) ? "present" : "absent";
	const pin = readPin(path.join(REPO_ROOT, PIN_FILE_NAME));
	const manifestText = fs.readFileSync(
		path.join(REPO_ROOT, MANIFEST_FILE_NAME),
		"utf8",
	);

	test("brand.vendored.json pins the brand.pin.json commit and matches its explicit expected rows", () => {
		const manifest = JSON.parse(manifestText) as {
			brandPin: string;
			files: unknown[];
		};
		expect(Object.keys(manifest)).toEqual(["brandPin", "files"]);
		expect(manifest.brandPin).toBe(pin.commit);
		expect(manifest.files).toEqual(expectedManifest.files);
		expect(manifestText).toBe(`${JSON.stringify(manifest, null, "\t")}\n`);
	});

	test("under CI the brand cache must be present; present: the real check passes; absent locally: recorded", async () => {
		if (process.env["CI"] !== undefined) {
			expect(state, "the CI brand step runs yarn brand:fetch first").toBe(
				"present",
			);
		}
		if (state === "present") {
			const problems = await vendoredProblems({
				root: REPO_ROOT,
				pin,
				manifest: JSON.parse(manifestText),
				cacheDir: path.join(REPO_ROOT, CACHE_DIR_NAME),
				vendoredDir: path.join(REPO_ROOT, VENDORED_DIR),
			});
			expect(problems).toEqual([]);
		} else {
			expect(state).toBe("absent");
		}
	});
});
