import { describe, expect, test } from "vitest";
import {
	classifyTestFile,
	classifyExemptionFreshness,
} from "../../scripts/dir_effect_gate.mjs";

// Fixtures below are literal template-literal strings, never files read from disk -- this is
// what lets the parser (the part most likely to rot) run on every PR with zero filesystem
// access and no platform dependence, exactly as tests/scripts/gatekeeper_check.test.ts does
// for classifySpctl.

// A compliant Playwright spec using the fixture-directory factory and calling the assertion.
const COMPLIANT_SPEC = `
import { createFixtureDir } from "../helpers/fixture_copier";
import { snapshotDir, assertDirEffect } from "../helpers/dir_effect";

test("strips metadata", async () => {
	const { dir, copyFixture } = createFixtureDir();
	const before = snapshotDir(dir);
	await processFile(copyFixture("sample.jpg"));
	const after = snapshotDir(dir);
	assertDirEffect(before, after, { modified: ["sample.jpg"] });
});
`;

// The exact violation this gate exists to catch: writes to disk via the fixture-directory
// factory, but never names the resulting delta.
const NONCOMPLIANT_SPEC = `
import { createFixtureDir } from "../helpers/fixture_copier";

test("strips metadata", async () => {
	const { dir, copyFixture } = createFixtureDir();
	await processFile(copyFixture("sample.jpg"));
	expect(await readMetadata(copyFixture("sample.jpg"))).toEqual({});
});
`;

// Negative control for the WIDENED detector (RESEARCH.md Pitfall 2). Written the way
// settings_service.test.ts used to be written before plan 18-07 normalised it: joins
// os.tmpdir() with a random suffix and calls a plain mkdir, never calling anything literally
// named mkdtemp or createFixtureDir. If the third detector alternative ("tmpdir") is ever
// reverted, this case silently starts returning ok:true and the whole suite goes green while
// testing nothing -- that is the exact failure mode this fixture pins.
const MANUAL_TMPDIR_IDIOM_UNASSERTED_TEST = `
import { tmpdir } from "node:os";
import path from "node:path";

it("saves settings", async () => {
	const dir = path.join(tmpdir(), "manual-" + Date.now());
	mkdirSync(dir);
	await service.save(dir);
});
`;

// A source that touches neither disk-write idiom at all -- a pure-logic test with no
// filesystem interaction. Must never be flagged, regardless of content otherwise.
const NO_DISK_WRITE_TEST = `
import { describe, test, expect } from "vitest";
import { cleanExifData } from "../../src/domain/exif";

describe("cleanExifData", () => {
	test("removes computed fields", () => {
		expect(cleanExifData({ SourceFile: "x.jpg", Make: "Canon" })).toEqual({
			Make: "Canon",
		});
	});
});
`;

// The live state of the ONE real exemption (tests/application/expand_folder_query.test.ts,
// D-23): it writes to disk via mkdtemp in its own beforeEach, but its subject under test
// (ExpandFolderQuery) only ever reads -- so it deliberately never calls assertDirEffect.
const EXPAND_FOLDER_EXEMPT_PATH =
	"tests/application/expand_folder_query.test.ts";
const EXPAND_FOLDER_LIVE_SOURCE = `
import { mkdtemp } from "some-fs-module";
import path from "node:path";
import os from "node:os";

beforeEach(async () => {
	tmpDir = await mkdtemp(path.join(os.tmpdir(), "expand-test-"));
});

it("finds supported files recursively", async () => {
	const result = await query.execute({ dirPath: tmpDir });
	expect(result.ok).toBe(true);
});
`;

// A hypothetical future version of the same exempted file, mutated to now call the
// assertion -- the gap D-23 recorded would be closed, and the exemption entry itself
// becomes the stale artifact.
const EXPAND_FOLDER_NOW_ASSERTS_SOURCE = `
import { mkdtemp } from "some-fs-module";
import { snapshotDir, assertDirEffect } from "../helpers/dir_effect";
import path from "node:path";
import os from "node:os";

beforeEach(async () => {
	tmpDir = await mkdtemp(path.join(os.tmpdir(), "expand-test-"));
});

it("finds supported files recursively", async () => {
	const before = snapshotDir(tmpDir);
	const result = await query.execute({ dirPath: tmpDir });
	const after = snapshotDir(tmpDir);
	assertDirEffect(before, after, {});
	expect(result.ok).toBe(true);
});
`;

// A hypothetical future version that no longer writes to disk at all -- e.g. refactored to
// use an in-memory fake directory reader instead of a real mkdtemp'd fixture.
const EXPAND_FOLDER_NO_LONGER_WRITES_SOURCE = `
import { FakeDirReader } from "../fakes/fake_dir_reader";

beforeEach(() => {
	reader = new FakeDirReader(["photo.jpg", "readme.txt"]);
});

it("finds supported files recursively", async () => {
	const result = await query.execute({ dirPath: "/virtual" });
	expect(result.ok).toBe(true);
});
`;

describe("classifyTestFile", () => {
	test("accepts a collected spec using createFixtureDir that references assertDirEffect", () => {
		const result = classifyTestFile(
			COMPLIANT_SPEC,
			"tests/e2e/example.spec.ts",
		);

		expect(result.ok).toBe(true);
		expect(result.collected).toBe(true);
		expect(result.writesToDisk).toBe(true);
	});

	test("rejects a collected spec using createFixtureDir that never references assertDirEffect", () => {
		const result = classifyTestFile(
			NONCOMPLIANT_SPEC,
			"tests/e2e/example.spec.ts",
		);

		expect(result.ok).toBe(false);
		expect(result.reason).toContain("tests/e2e/example.spec.ts");
		expect(result.reason).toContain("createFixtureDir");
		expect(result.reason).toContain("assertDirEffect");
	});

	test("[widened-detector negative control] catches the manual os.tmpdir()+mkdir idiom that mkdtemp/createFixtureDir alone would miss (RESEARCH.md Pitfall 2)", () => {
		const result = classifyTestFile(
			MANUAL_TMPDIR_IDIOM_UNASSERTED_TEST,
			"tests/infrastructure/example.test.ts",
		);

		// This is the case that goes RED if the "tmpdir" detector alternative is ever
		// reverted: without it, this manual idiom is invisible and this assertion fails
		// because result.ok flips to true.
		expect(result.ok).toBe(false);
		expect(result.writesToDisk).toBe(true);
		expect(result.reason).toContain("tmpdir");
	});

	test("ignores a collected test that never touches either disk-write idiom", () => {
		const result = classifyTestFile(
			NO_DISK_WRITE_TEST,
			"tests/domain/example.test.ts",
		);

		expect(result.ok).toBe(true);
		expect(result.collected).toBe(true);
		expect(result.writesToDisk).toBe(false);
	});

	test("ignores a helper module regardless of contents -- it never matches any collected-test path pattern", () => {
		const result = classifyTestFile(
			NONCOMPLIANT_SPEC,
			"tests/e2e/helpers/fixture_copier.ts",
		);

		expect(result.ok).toBe(true);
		expect(result.collected).toBe(false);
	});

	test("reports the same violation for the smoke and Vitest collection conventions, not just Playwright specs", () => {
		expect(
			classifyTestFile(NONCOMPLIANT_SPEC, "tests/smoke/example.smoke.ts").ok,
		).toBe(false);
		expect(
			classifyTestFile(
				NONCOMPLIANT_SPEC,
				"tests/infrastructure/example.test.ts",
			).ok,
		).toBe(false);
	});
});

describe("classifyExemptionFreshness", () => {
	test("reports the real expand_folder_query.test.ts exemption as fresh (not stale)", () => {
		const result = classifyExemptionFreshness(
			EXPAND_FOLDER_EXEMPT_PATH,
			EXPAND_FOLDER_LIVE_SOURCE,
		);

		expect(result.stale).toBe(false);
	});

	test("[prune-check negative control A] flags the exemption stale once the file now references assertDirEffect", () => {
		const result = classifyExemptionFreshness(
			EXPAND_FOLDER_EXEMPT_PATH,
			EXPAND_FOLDER_NOW_ASSERTS_SOURCE,
		);

		// This is the case that goes RED if the prune-check branch is removed: the stale
		// exemption would silently keep amnestying a file that has already closed its gap.
		expect(result.stale).toBe(true);
		expect(result.reason).toContain("assertDirEffect");
	});

	test("[prune-check negative control B] flags the exemption stale once the file no longer writes to disk at all", () => {
		const result = classifyExemptionFreshness(
			EXPAND_FOLDER_EXEMPT_PATH,
			EXPAND_FOLDER_NO_LONGER_WRITES_SOURCE,
		);

		expect(result.stale).toBe(true);
		expect(result.reason).toContain("no longer writes to disk");
	});

	test("throws for a path that was never an EXEMPT entry -- staleness is only meaningful for a known exemption", () => {
		expect(() =>
			classifyExemptionFreshness("tests/e2e/settings.spec.ts", COMPLIANT_SPEC),
		).toThrow();
	});
});
