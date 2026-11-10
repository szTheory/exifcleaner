// 69-11 (OVR-03; D-14, D-15, D-15a, D-16, A6): the SAME fixture is overwritten in place through
// three routes and the observable file attributes are compared:
//   legacy          ExifToolAdapter.sanitize, outputMode "overwrite" (-overwrite_original), today's
//                   behaviour and the baseline users have
//   staged-native   OutputTransaction with commitPath = the source, the stage written by the
//                   native engine (HybridMetadataEngine, native copy admitted)
//   staged-exiftool the same transaction with ExifTool writing the stage (what runs when native
//                   declines; forced here by wiring the ExifToolAdapter directly, never by
//                   preserveTimestamps: hybrid_metadata_engine.ts admits native when
//                   !preserveTimestamps || format.preserves.timestamps, and every handler of
//                   exifcleaner-node declares timestamps true)
// Every case prints one `MEASURE: <platform> parity id=<case> legacy=... staged-native=...
// staged-exiftool=...` line (first Linux observation comes from the CI test job). Differences that
// are measured and not matched are asserted explicitly through KNOWN_DIFFERENCES, never skipped.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import {
	KNOWN_DIFFERENCES,
	NOTES_REQUIRED_FACTS,
	PARITY_SETTINGS,
	ROUTE_NAMES,
	buildParityStack,
	formatObservation,
	markerXattrName,
	observe,
	setMarkerXattr,
	sha256,
	type Observation,
	type ParityStack,
	type RouteName,
	type RouteOutcome,
} from "../helpers/overwrite_parity";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../e2e/fixtures");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

const posixUser = process.platform !== "win32" && process.getuid?.() !== 0;

type RouteRun = {
	readonly dir: string;
	readonly source: string;
	readonly before: Observation;
	readonly after: Observation | undefined;
	readonly outcome: RouteOutcome;
};

describe.skipIf(process.platform === "win32")(
	"overwrite attribute parity: legacy -overwrite_original versus the staged overwrite (69-11)",
	() => {
		const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const temporaryDirs: string[] = [];
		let stack: ParityStack;

		beforeAll(async () => {
			await exiftoolProcess.open();
			stack = buildParityStack(exiftoolProcess);
		});

		afterAll(async () => {
			await exiftoolProcess.close();
		});

		afterEach(() => {
			for (const dir of temporaryDirs.splice(0)) {
				// An unwritable directory case leaves 0555 behind on failure paths.
				try {
					fs.chmodSync(dir, 0o755);
				} catch {
					// already gone
				}
				fs.rmSync(dir, { recursive: true, force: true });
			}
		});

		function freshDir(
			fixture: string,
			prepare?: (ctx: { dir: string; source: string }) => void,
		): { dir: string; source: string } {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "overwrite-parity-"));
			temporaryDirs.push(dir);
			const source = path.join(dir, `photo${path.extname(fixture)}`);
			fs.copyFileSync(path.join(FIXTURES, fixture), source);
			fs.writeFileSync(path.join(dir, "sentinel.txt"), "must not be touched");
			prepare?.({ dir, source });
			return { dir, source };
		}

		async function runRoutes({
			id,
			fixture,
			routes = ROUTE_NAMES,
			settings = PARITY_SETTINGS,
			prepare,
			target = (ctx: { source: string }) => ctx.source,
		}: {
			id: string;
			fixture: string;
			routes?: readonly RouteName[];
			settings?: typeof PARITY_SETTINGS;
			prepare?: (ctx: { dir: string; source: string }) => void;
			target?: (ctx: { dir: string; source: string }) => string;
		}): Promise<Record<RouteName, RouteRun>> {
			const runs = {} as Record<RouteName, RouteRun>;
			for (const route of routes) {
				const ctx = freshDir(fixture, prepare);
				const operand = target(ctx);
				const before = observe(operand);
				const outcome = await stack.run(route, operand, settings);
				let after: Observation | undefined;
				try {
					after = observe(operand);
				} catch {
					after = undefined;
				}
				runs[route] = { dir: ctx.dir, source: operand, before, after, outcome };
			}
			const parts = routes.map((route) => {
				const run = runs[route];
				return `${route}=${run.outcome.ok ? "ok" : "failed"}:${run.after === undefined ? "missing" : formatObservation(run.after)}`;
			});
			console.log(
				`MEASURE: ${process.platform} parity id=${id} ${parts.join(" ")}`,
			);
			return runs;
		}

		// One assertion per route so a failure reads `staged-exiftool: expected '644' to be '640'`.
		function expectModeOnEveryRoute(
			runs: Record<RouteName, RouteRun>,
			expectedOctal: string,
		): void {
			for (const route of ROUTE_NAMES) {
				expect(runs[route].after?.mode, route).toBe(expectedOctal);
			}
		}

		it("route sanity: staged-native is written by native, staged-exiftool and legacy by ExifTool (non-vacuity of the three routes)", async () => {
			const expected: Record<RouteName, { native: number; exiftool: number }> =
				{
					legacy: { native: 0, exiftool: 1 },
					"staged-native": { native: 1, exiftool: 0 },
					"staged-exiftool": { native: 0, exiftool: 1 },
				};
			for (const route of ROUTE_NAMES) {
				const ctx = freshDir("sample.jpg");
				stack.resetWriterCalls();
				const outcome = await stack.run(route, ctx.source);
				expect(outcome.ok, `${route}: ${outcome.detail}`).toBe(true);
				expect(stack.writerCalls(), route).toEqual(expected[route]);
			}
		});

		it.skipIf(!posixUser)(
			"overwrite preserves 0640 mode vs -overwrite_original",
			async () => {
				const runs = await runRoutes({
					id: "mode-0640",
					fixture: "sample.jpg",
					prepare: ({ source }) => fs.chmodSync(source, 0o640),
				});
				for (const route of ROUTE_NAMES) {
					expect(
						runs[route].outcome.ok,
						`${route}: ${runs[route].outcome.detail}`,
					).toBe(true);
				}
				expectModeOnEveryRoute(runs, "640");
			},
		);

		it.skipIf(!posixUser)(
			"overwrite preserves a private 0600 mode on every route",
			async () => {
				const runs = await runRoutes({
					id: "mode-0600",
					fixture: "sample.jpg",
					prepare: ({ source }) => fs.chmodSync(source, 0o600),
				});
				expectModeOnEveryRoute(runs, "600");
			},
		);

		it.skipIf(!posixUser)(
			"overwrite preserves read-only 0444 in a writable directory: same outcome and mode on every route (the stage still commits)",
			async () => {
				const runs = await runRoutes({
					id: "mode-0444",
					fixture: "sample.jpg",
					prepare: ({ source }) => fs.chmodSync(source, 0o444),
				});
				const legacy = runs.legacy;
				expect(legacy.outcome.ok, legacy.outcome.detail).toBe(true);
				for (const route of ROUTE_NAMES) {
					expect(
						runs[route].outcome.ok,
						`${route}: ${runs[route].outcome.detail}`,
					).toBe(true);
				}
				expectModeOnEveryRoute(runs, "444");
				// The bytes really were rewritten (a no-op commit would also keep the mode).
				for (const route of ROUTE_NAMES) {
					expect(runs[route].after?.bytesSha256, route).not.toBe(
						runs[route].before.bytesSha256,
					);
				}
			},
		);

		it("overwrite changes the inode on every route (a new file replaces the old one)", async () => {
			const runs = await runRoutes({ id: "inode", fixture: "sample.jpg" });
			for (const route of ROUTE_NAMES) {
				expect(runs[route].after?.ino, route).not.toBe(runs[route].before.ino);
			}
		});

		it.skipIf(process.platform === "win32")(
			"overwrite breaks a hard link: the other link keeps the old bytes and metadata, on every route",
			async () => {
				const sibling = (dir: string) => path.join(dir, "other-link.jpg");
				const runs = await runRoutes({
					id: "hard-link",
					fixture: "sample.jpg",
					prepare: ({ dir, source }) => fs.linkSync(source, sibling(dir)),
				});
				for (const route of ROUTE_NAMES) {
					const run = runs[route];
					expect(run.outcome.ok, `${route}: ${run.outcome.detail}`).toBe(true);
					const other = observe(sibling(run.dir));
					// The other link still holds the original, uncleaned file.
					expect(other.bytesSha256, route).toBe(run.before.bytesSha256);
					expect(run.after?.bytesSha256, route).not.toBe(
						run.before.bytesSha256,
					);
					expect(other.ino, route).toBe(run.before.ino);
					expect(run.after?.ino, route).not.toBe(run.before.ino);
					// Each name now has its own inode.
					expect(run.after?.nlink, route).toBe(1);
					expect(other.nlink, route).toBe(1);
				}
			},
		);

		it("overwrite drops a user extended attribute on every route (xattrs are not carried)", async (testContext) => {
			const probe = freshDir("sample.jpg");
			if (!setMarkerXattr(probe.source)) {
				console.log(
					`MEASURE: ${process.platform} parity id=xattr skipped=no-user-xattr-support`,
				);
				testContext.skip();
				return;
			}
			const runs = await runRoutes({
				id: "xattr",
				fixture: "sample.jpg",
				prepare: ({ source }) => {
					expect(setMarkerXattr(source)).toBe(true);
				},
			});
			for (const route of ROUTE_NAMES) {
				const run = runs[route];
				expect(run.outcome.ok, `${route}: ${run.outcome.detail}`).toBe(true);
				// Non-vacuity: the marker was on the source before the overwrite.
				expect(run.before.xattrNames, route).toContain(markerXattrName());
				expect(run.after?.xattrNames ?? [], route).not.toContain(
					markerXattrName(),
				);
			}
		});

		it("overwrite replaces a symlinked path with a regular file, identically on every route", async () => {
			const runs = await runRoutes({
				id: "symlink",
				fixture: "sample.jpg",
				prepare: ({ dir, source }) => {
					const real = path.join(dir, "real-target.jpg");
					fs.renameSync(source, real);
					fs.symlinkSync("real-target.jpg", source);
				},
			});
			const legacyIsSymlink = runs.legacy.after?.isSymlink;
			for (const route of ROUTE_NAMES) {
				expect(runs[route].before.isSymlink, `${route} (non-vacuity)`).toBe(
					true,
				);
				expect(
					runs[route].outcome.ok,
					`${route}: ${runs[route].outcome.detail}`,
				).toBe(true);
				expect(runs[route].after?.isSymlink, route).toBe(legacyIsSymlink);
			}
			// The measured behaviour is the one the notes describe: the path becomes a regular
			// file and the old target is left alone (see NOTES_REQUIRED_FACTS "overwrite replaces
			// the file").
			expect(runs.legacy.after?.isSymlink).toBe(false);
			// The file the link pointed to is left alone: still there, bytes equal to the
			// link's pre-overwrite content.
			for (const route of ROUTE_NAMES) {
				const target = path.join(runs[route].dir, "real-target.jpg");
				expect(sha256(target), `${route} target untouched`).toBe(
					runs[route].before.bytesSha256,
				);
			}
		});

		it.skipIf(!posixUser)(
			"overwrite ends with the same uid and gid as the source (non-root; a secondary group makes it non-trivial)",
			async (testContext) => {
				const secondary = (process.getgroups?.() ?? []).find(
					(gid) => gid !== process.getegid?.(),
				);
				if (secondary === undefined) {
					console.log(
						`MEASURE: ${process.platform} parity id=ownership skipped=no-secondary-group`,
					);
					testContext.skip();
					return;
				}
				const runs = await runRoutes({
					id: "ownership",
					fixture: "sample.jpg",
					prepare: ({ source }) =>
						fs.chownSync(source, process.getuid!(), secondary),
				});
				for (const route of ROUTE_NAMES) {
					const run = runs[route];
					expect(run.outcome.ok, `${route}: ${run.outcome.detail}`).toBe(true);
					expect(run.before.gid, `${route} (non-vacuity)`).toBe(secondary);
					expect([run.after?.uid, run.after?.gid], route).toEqual([
						run.before.uid,
						run.before.gid,
					]);
				}
			},
		);

		it.skipIf(!posixUser)(
			"a directory where the stage cannot be created: every route fails, the source is untouched, the directory equals its pre-state",
			async () => {
				const failures: Record<string, RouteOutcome> = {};
				for (const route of ROUTE_NAMES) {
					const ctx = freshDir("sample.jpg");
					const shaBefore = sha256(ctx.source);
					fs.chmodSync(ctx.dir, 0o555);
					const before = snapshotDir(ctx.dir);
					const outcome = await stack.run(route, ctx.source);
					const after = snapshotDir(ctx.dir);
					fs.chmodSync(ctx.dir, 0o755);
					failures[route] = outcome;
					expect(outcome.ok, `${route}: ${outcome.detail}`).toBe(false);
					expect(sha256(ctx.source), route).toBe(shaBefore);
					assertDirEffect(before, after, {
						unchanged: ["photo.jpg", "sentinel.txt"],
					});
					expect(
						fs
							.readdirSync(ctx.dir)
							.filter(
								(n) =>
									n.includes("exifcleaner-stage") ||
									n.includes("_exiftool_tmp"),
							),
						route,
					).toEqual([]);
				}
				console.log(
					`MEASURE: ${process.platform} parity id=unwritable-dir ${ROUTE_NAMES.map((r) => `${r}=failed`).join(" ")}`,
				);
			},
		);

		describe("preserveTimestamps true: final mtime per route as measured", () => {
			const OLD_SECONDS = 978_307_200; // 2001-01-01T00:00:00Z

			it("legacy keeps the source mtime; each staged route keeps it or the difference is a named KNOWN_DIFFERENCES entry", async () => {
				const runs = await runRoutes({
					id: "timestamps",
					fixture: "sample.jpg",
					settings: { ...PARITY_SETTINGS, preserveTimestamps: true },
					prepare: ({ source }) =>
						fs.utimesSync(source, OLD_SECONDS, OLD_SECONDS),
				});
				for (const route of ROUTE_NAMES) {
					expect(
						runs[route].outcome.ok,
						`${route}: ${runs[route].outcome.detail}`,
					).toBe(true);
					expect(runs[route].before.mtimeMs, `${route} (non-vacuity)`).toBe(
						OLD_SECONDS * 1000,
					);
				}
				expect(runs.legacy.after?.mtimeMs).toBe(OLD_SECONDS * 1000);
				for (const route of ["staged-native", "staged-exiftool"] as const) {
					const kept = runs[route].after?.mtimeMs === OLD_SECONDS * 1000;
					const known = KNOWN_DIFFERENCES.some(
						(entry) => entry.id === `timestamps-${route}`,
					);
					// Either the route keeps the mtime (and is not listed) or it is listed (and
					// is measured not to keep it): never both, never neither.
					expect(kept, `${route} keeps mtime`).toBe(!known);
				}
			});
		});

		describe.skipIf(!posixUser)(
			"TIFF and media overwrite already pass commitPath: they inherit the attribute application",
			() => {
				it.each([
					["sample.tif", "tiff-0444"],
					["sample.mp4", "media-0444"],
				] as const)(
					"%s (0444) commits through the staged ExifTool route with its mode preserved, like legacy",
					async (fixture, id) => {
						const runs = await runRoutes({
							id,
							fixture,
							routes: ["legacy", "staged-exiftool"],
							prepare: ({ source }) => fs.chmodSync(source, 0o444),
						});
						expect(runs.legacy.outcome.ok, runs.legacy.outcome.detail).toBe(
							true,
						);
						const staged = runs["staged-exiftool"];
						expect(staged.outcome.ok, staged.outcome.detail).toBe(true);
						expect(staged.after?.mode).toBe("444");
						expect(runs.legacy.after?.mode).toBe("444");
					},
				);

				it("sample.tif (0640) keeps its mode through the staged ExifTool route", async () => {
					const runs = await runRoutes({
						id: "tiff-0640",
						fixture: "sample.tif",
						routes: ["legacy", "staged-exiftool"],
						prepare: ({ source }) => fs.chmodSync(source, 0o640),
					});
					expect(runs["staged-exiftool"].after?.mode).toBe("640");
					expect(runs.legacy.after?.mode).toBe("640");
				});
			},
		);

		it("every KNOWN_DIFFERENCES entry and every required notes fact is well-formed (ids unique, phrases non-empty)", () => {
			const ids = [...KNOWN_DIFFERENCES, ...NOTES_REQUIRED_FACTS].map(
				(entry) => entry.id,
			);
			expect(new Set(ids).size).toBe(ids.length);
			for (const entry of KNOWN_DIFFERENCES) {
				expect(entry.notesPhrase.trim().length).toBeGreaterThan(0);
				expect(entry.observation.trim().length).toBeGreaterThan(0);
			}
			for (const fact of NOTES_REQUIRED_FACTS) {
				expect(fact.phrase.trim().length).toBeGreaterThan(0);
			}
		});
	},
);
