// Pure fixtures for the Phase 77 final proof. These tests never launch a browser;
// browser records are exercised through the injectable runner used by the CLI.
// @ts-expect-error the implementation is JavaScript and its contract is pinned here.
const proof = await import("../../scripts/palette_77_proof.mjs");
const {
	APPROVED_INDICATOR_DARK_MIX,
	APPROVED_OFF_TRACK_MIX,
	mixSrgb,
	validateIndicatorBoundaries,
	validateIndicatorRoleMix,
	validateDropNegativeControls,
	validateForcedAccentControl,
	validatePlatformRecord,
	validatePrerequisites,
	validateReconciliationSet,
	validateResolverNegativeControls,
	validateSealedSourceProof,
	validateSourceDigestBindings,
	validateSourceDigestMap,
} = proof;
import {
	contrastRatio,
	parseColour,
} from "../../tests/renderer/contrast/wcag.mjs";
import { describe, expect, test } from "vitest";

const RESIDUAL = "a11y-p73|file-list-filetable--arabic-batch|color-contrast";

function painted(r: number, g: number, b: number) {
	return {
		raw: `rgb(${r}, ${g}, ${b})`,
		rgb: { r, g, b, a: 255 },
	};
}

function indicatorObservation(theme: "light" | "dark") {
	const accent = painted(0, 122, 255);
	const canvasText =
		theme === "light" ? painted(0, 0, 0) : painted(255, 255, 255);
	const mix = theme === "light" ? painted(0, 110, 230) : painted(26, 135, 255);
	return {
		accent,
		canvasText,
		mixProbe: mix,
		roleProbe: theme === "light" ? accent : mix,
	};
}

function mixRecord(theme: "light" | "dark") {
	const canvasText =
		theme === "light" ? painted(0, 0, 0) : painted(255, 255, 255);
	const track = painted(
		theme === "light" ? 115 : 141,
		theme === "light" ? 115 : 141,
		theme === "light" ? 115 : 141,
	);
	const ground =
		theme === "light" ? painted(255, 255, 255) : painted(10, 46, 43);
	const raised =
		theme === "light" ? painted(238, 246, 245) : painted(18, 64, 60);
	const white = painted(255, 255, 255);
	const ratio = (foreground: typeof track, background: typeof ground) =>
		contrastRatio(parseColour(foreground.raw)!, parseColour(background.raw)!);
	return {
		theme,
		forcedColors: false,
		colorScheme: theme,
		dataTheme: theme,
		productionExpression: APPROVED_OFF_TRACK_MIX,
		constituents: { GrayText: painted(128, 128, 128), CanvasText: canvasText },
		mixProbe: track,
		actualTrack: track,
		ground,
		raised,
		thumb: white,
		cleanWhitePrimitive: "#FFFFFF",
		cleanWhiteProbe: white,
		thumbIdentity: true,
		nearWhiteThumbPlant: {
			paint: "rgb(254, 254, 254)",
			contrastRatio: 4.7,
			contrastPasses: true,
			identityRejected: true,
			restoredIdentity: true,
		},
		ratios: {
			trackToGround: ratio(track, ground),
			trackToRaised: ratio(track, raised),
			thumbToTrack: ratio(white, track),
		},
		negativeControls: {
			lowContrastRejected: true,
			missingProbeRejected: true,
			wrongWeightRejected: true,
			restoredGreen: true,
		},
	};
}

function validPlatformRecord() {
	return {
		browser: { userAgent: "Fixture HeadlessChrome", platform: "FixtureOS" },
		approvedExpressions: {
			offTrack: APPROVED_OFF_TRACK_MIX,
			platformIndicatorDark:
				"color-mix(in srgb, var(--ec-color-accent) 90%, CanvasText 10%)",
			weights: [0.9, 0.1],
		},
		normalObservations: [mixRecord("light"), mixRecord("dark")],
		forcedObservations: [
			{
				theme: "light",
				forcedColors: true,
				dataTheme: "light",
				geometryPreserved: true,
				selectedRowRemoval: {
					rejectedWithoutStylesheet: true,
					passedAfterRestore: true,
				},
			},
			{
				theme: "dark",
				forcedColors: true,
				dataTheme: "dark",
				geometryPreserved: true,
				selectedRowRemoval: {
					rejectedWithoutStylesheet: true,
					passedAfterRestore: true,
				},
			},
		],
		originalFindingFingerprints: Array.from(
			{ length: 7 },
			(_, index) => `original-${index}`,
		),
		currentPairFingerprints: Array.from({ length: 100 }, (_, index) => ({
			fingerprint: `current-${index}`,
		})),
		proposedPromiseIds: Array.from(
			{ length: 27 },
			(_, index) => `promise-${index}`,
		),
		resolverNegativeControls: { light: true, dark: true },
	};
}

describe("Phase 77 proof fixtures", () => {
	test("accepts exact system-mix and opaque pinned-white observations", () => {
		expect(validatePlatformRecord(validPlatformRecord())).toEqual([]);
	});

	test("rejects a non-white thumb even when its contrast passes", () => {
		const record = validPlatformRecord();
		record.normalObservations[0]!.thumb = painted(254, 254, 254);
		expect(validatePlatformRecord(record).join("\n")).toMatch(
			/Clean White|thumb identity/i,
		);
	});

	test("rejects a stale or inconsistent system mix", () => {
		const record = validPlatformRecord();
		record.normalObservations[1]!.actualTrack = painted(143, 141, 141);
		expect(validatePlatformRecord(record).join("\n")).toMatch(/mix|track/i);
	});

	test("computes the exact dark 90/10 indicator mix and keeps light raw", () => {
		expect(APPROVED_INDICATOR_DARK_MIX).toBe(
			"color-mix(in srgb, var(--ec-color-accent) 90%, CanvasText 10%)",
		);
		expect(
			mixSrgb({ r: 0, g: 122, b: 255 }, { r: 255, g: 255, b: 255 }),
		).toEqual({
			r: 26,
			g: 135,
			b: 255,
			a: 1,
		});
		expect(
			validateIndicatorRoleMix(indicatorObservation("dark"), "dark"),
		).toEqual([]);
		expect(
			validateIndicatorRoleMix(indicatorObservation("light"), "light"),
		).toEqual([]);
		const wrongWeight = indicatorObservation("dark");
		wrongWeight.mixProbe = wrongWeight.accent;
		expect(validateIndicatorRoleMix(wrongWeight, "dark").join("\n")).toMatch(
			/90\/10/i,
		);
		const wrongConstituent = indicatorObservation("dark");
		wrongConstituent.canvasText = painted(0, 0, 0);
		expect(
			validateIndicatorRoleMix(wrongConstituent, "dark").join("\n"),
		).toMatch(/90\/10/i);
		const wrongRole = indicatorObservation("dark");
		wrongRole.roleProbe = wrongRole.accent;
		expect(validateIndicatorRoleMix(wrongRole, "dark").join("\n")).toMatch(
			/dark role/i,
		);
	});

	test("requires all eight unique boundary paints and their recomputed ratios", () => {
		const positions = [
			"top-inner",
			"top-outer",
			"bottom-inner",
			"bottom-outer",
			"left-inner",
			"left-outer",
			"right-inner",
			"right-outer",
		];
		const roleProbe = painted(0, 122, 255);
		const paint = painted(255, 255, 255);
		const ratio = contrastRatio(
			parseColour(roleProbe.raw)!,
			parseColour(paint.raw)!,
		);
		const boundaries = positions.map((position) => ({ position, paint }));
		const ratios = Object.fromEntries(
			positions.map((position) => [position, ratio]),
		);
		expect(
			validateIndicatorBoundaries({ boundaries, ratios, roleProbe }),
		).toEqual([]);
		expect(
			validateIndicatorBoundaries({
				boundaries: boundaries.slice(1),
				ratios: Object.fromEntries(
					positions.slice(1).map((position) => [position, ratio]),
				),
				roleProbe,
			}).join("\n"),
		).toMatch(/incomplete/i);
		const duplicate = [...boundaries];
		duplicate[7] = { position: "right-inner", paint };
		expect(
			validateIndicatorBoundaries({
				boundaries: duplicate,
				ratios,
				roleProbe,
			}).join("\n"),
		).toMatch(/duplicated/i);
	});

	test("applies dark-only rejection controls to the dark indicator and accent plant to drop", () => {
		const controls = {
			rawDarkAccentRejected: false,
			omittedSideRejected: true,
			wrongWeightRejected: false,
			unrelatedRoleRejected: false,
			geometryMutationRejected: true,
			surfaceMutationRejected: true,
			restoredGreen: true,
		};
		expect(validateDropNegativeControls("light", controls)).toEqual([]);
		expect(
			validateDropNegativeControls("dark", {
				...controls,
				rawDarkAccentRejected: true,
				wrongWeightRejected: true,
				unrelatedRoleRejected: true,
			}),
		).toEqual([]);
		expect(
			validateDropNegativeControls("light", {
				...controls,
				rawDarkAccentRejected: true,
			}).join("\n"),
		).toMatch(/wrong theme result/i);
		expect(
			validateResolverNegativeControls({ light: true, dark: true }),
		).toEqual([]);
		expect(
			validateResolverNegativeControls({ light: true, dark: false }).join("\n"),
		).toMatch(/dark/i);
		expect(validateForcedAccentControl({ kind: "segmented-focus" })).toEqual(
			[],
		);
		expect(
			validateForcedAccentControl({
				kind: "active-drop-border",
				rawAccentPlant: { rejectedBySystemAdjustment: true, restored: true },
			}),
		).toEqual([]);
		expect(
			validateForcedAccentControl({ kind: "active-drop-border" }).join("\n"),
		).toMatch(/removal\/restoration/i);
	});

	test("requires the exact original fingerprint set and preserved residual", () => {
		const original = Array.from(
			{ length: 208 },
			(_, index) => `candidate-${index}`,
		);
		original[207] = RESIDUAL;
		const cleared = original.slice(0, 207);
		expect(
			validateReconciliationSet({
				originalFingerprints: original,
				clearedFingerprints: cleared,
				residualFingerprints: [RESIDUAL],
			}),
		).toEqual([]);
		expect(
			validateReconciliationSet({
				originalFingerprints: original,
				clearedFingerprints: original,
				residualFingerprints: [],
			}),
		).not.toEqual([]);
	});

	test("rejects missing, duplicate, or stale source digest inputs", () => {
		const valid = {
			sourceProof: {
				inputs: [
					{ path: "a.css", sha256: "a".repeat(64) },
					{ path: "b.css", sha256: "b".repeat(64) },
				],
			},
			sourceDigests: { "a.css": "a".repeat(64), "b.css": "b".repeat(64) },
		};
		expect(
			validateSourceDigestBindings(valid, {
				"a.css": "a".repeat(64),
				"b.css": "b".repeat(64),
			}),
		).toEqual([]);
		const duplicate = structuredClone(valid);
		duplicate.sourceProof.inputs[1]!.path = "a.css";
		expect(
			validateSourceDigestBindings(duplicate, {
				"a.css": "a".repeat(64),
				"b.css": "b".repeat(64),
			}).join("\n"),
		).toMatch(/duplicate/i);
		const stale = validateSourceDigestMap(
			{ sourceDigests: { "a.css": "a".repeat(64), "b.css": "b".repeat(64) } },
			{ "a.css": "a".repeat(64), "b.css": "c".repeat(64) },
			["a.css", "b.css"],
		);
		expect(stale.join("\n")).toMatch(/stale/i);
		expect(
			validateSourceDigestMap(
				{ sourceDigests: { "a.css": "a".repeat(64) } },
				{ "a.css": "a".repeat(64), "b.css": "b".repeat(64) },
				["a.css", "b.css"],
			).join("\n"),
		).toMatch(/incomplete/i);
	});

	test("requires all thirteen unique prerequisite branches with matching evidence", () => {
		const branches = [
			"gsd/77-test-contracts",
			"gsd/77-test-twins",
			"gsd/77-gap-contract",
			"gsd/77-final-contracts",
			"gsd/77-contract-fixture-fix",
			"gsd/77-semantic-fixture-fix",
			"gsd/77-declared-backdrops",
			"gsd/77-hover-contract-states",
			"gsd/77-hover-fixture-isolation",
			"gsd/77-drift-hop-fixture",
			"gsd/77-source-fixture-metadata",
			"gsd/77-selection-route-contract",
			"gsd/77-literal-ratchet-contract",
		];
		const entries = branches.map((branch) => ({
			branch,
			head: "h",
			merge: "m",
			ci: { head: "h", conclusion: "success" },
			storybook: { head: "h", conclusion: "success", seconds: 200 },
		}));
		expect(validatePrerequisites(entries)).toEqual([]);
		expect(validatePrerequisites([...entries, entries[0]]).join("\n")).toMatch(
			/duplicate/i,
		);
		expect(validatePrerequisites(entries.slice(0, -1)).join("\n")).toMatch(
			/missing|exactly thirteen/i,
		);
	});

	test("does not accept pending source proof as a completed final proof", () => {
		expect(() =>
			validateSealedSourceProof({
				status: "pending-final-literal-baseline",
				sealed: false,
			}),
		).toThrow(/pending|sealed/i);
		expect(() =>
			validateSealedSourceProof({
				status: "passed",
				sealed: true,
				invariants: [{ passed: true }],
			}),
		).not.toThrow();
	});
});
