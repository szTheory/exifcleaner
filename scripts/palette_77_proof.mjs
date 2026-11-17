// Final, source-bound Phase 77 palette proof.
//
// --write runs the existing live browser gates, validates their current source
// inventories, and writes the canonical measurement. --check repeats those
// live gates and verifies the committed sourceProof without changing tracked
// files. All child processes receive argument arrays; paths are never sent
// through a shell.

import { spawnSync, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	brandRatioProblems,
	evaluate,
	g1Problems,
	g2Report,
	pairsShapeProblems,
	proposedConsistencyProblems,
	proposedResults,
	THEMES,
} from "../tests/renderer/contrast/contrast_model.mjs";
import { contrastRatio } from "../tests/renderer/contrast/wcag.mjs";
import { cssDeclarations } from "../.storybook/catalog/css_scan.mjs";
import {
	scanColourLiterals,
	colourLiteralsInSource,
	ratchetProblems,
} from "./colour_literal_ratchet.mjs";
import { readMergeBase } from "../.storybook/catalog/merge_base.mjs";
import {
	SHRINK_ONLY_REGISTRY,
	shrinkOnlyProblems,
} from "./shrink_only_check.mjs";

export const APPROVED_OFF_TRACK_MIX =
	"color-mix(in srgb, GrayText 90%, CanvasText 10%)";
export const APPROVED_INDICATOR_DARK_MIX =
	"color-mix(in srgb, var(--ec-color-accent) 90%, CanvasText 10%)";
export const MEASUREMENT_PATH = "docs/evidence/palette-77-measurement.json";
export const RECONCILIATION_PATH =
	"node_modules/.cache/palette77-reconciliation.json";
export const AXE_REPORT_PATH =
	"node_modules/.cache/palette77-reconciliation-axe.json";
export const PLATFORM_RECORD_PATH =
	"node_modules/.cache/palette77-platform.json";
export const INDICATOR_RECORD_PATH =
	"node_modules/.cache/palette77-indicators.json";
export const PLATFORM_GATE_TIMEOUT_MS = 240_000;

export const PREREQUISITE_BRANCHES = Object.freeze([
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
]);

export const INDICATOR_EVIDENCE_INPUTS = Object.freeze([
	"src/renderer/components/settings/ToggleSwitch.stories.tsx",
	"src/renderer/components/settings/ToggleSwitch.tsx",
	"src/renderer/styles/toggle_switch.css",
	"src/renderer/components/settings/SegmentedControl.stories.tsx",
	"src/renderer/components/settings/SegmentedControl.tsx",
	"src/renderer/styles/segmented_control.css",
	"src/renderer/components/ui/DropZone.stories.tsx",
	"src/renderer/components/ui/DropZone.tsx",
	"src/renderer/styles/drop_zone.css",
	"src/renderer/styles/tokens.css",
	".storybook/platform_indicators.test.tsx",
	".storybook/forced_colors.test.tsx",
	"vitest.storybook.config.ts",
	".storybook/preview.tsx",
	"src/renderer/index.tsx",
	"src/renderer/styles/forced_colors.css",
	"tests/renderer/contrast/contrast_model.mjs",
	"tests/renderer/contrast/contrast_pairs.json",
	"tests/renderer/contrast/wcag.mjs",
	"src/domain/accent_color.ts",
]);

export const PLATFORM_EVIDENCE_INPUTS = Object.freeze([
	".storybook/forced_colors.test.tsx",
	".storybook/preview.tsx",
	"src/renderer/index.tsx",
	"src/renderer/styles/forced_colors.css",
	"src/renderer/styles/toggle_switch.css",
	"src/renderer/styles/tokens.css",
	"tests/renderer/contrast/contrast_model.mjs",
	"tests/renderer/contrast/contrast_pairs.json",
	"vitest.storybook.config.ts",
]);

export const INDICATOR_BOUNDARY_POSITIONS = Object.freeze([
	"top-inner",
	"top-outer",
	"bottom-inner",
	"bottom-outer",
	"left-inner",
	"left-outer",
	"right-inner",
	"right-outer",
]);

const EXPECTED_RESIDUAL =
	"a11y-p73|file-list-filetable--arabic-batch|color-contrast";
const THEMES_SET = new Set(THEMES);
const HASH = /^[0-9a-f]{64}$/;
const STYLE_DIR = "src/renderer/styles";
const ALLOWED_INDICATOR_CONSUMERS = new Set([
	"src/renderer/styles/segmented_control.css",
	"src/renderer/styles/drop_zone.css",
]);
const PROTECTED_PATHS = Object.freeze([
	"tests/renderer/gates/token_drift.test.ts",
	"tests/renderer/gates/window_background.test.ts",
	"tests/renderer/contrast/contrast.test.ts",
	".storybook/type_pill_contract.test.tsx",
	"src/renderer/components/ui/StatusIcon.stories.tsx",
	"src/renderer/components/ui/TypePill.stories.tsx",
]);

function sha256(value) {
	return crypto.createHash("sha256").update(value).digest("hex");
}

function readText(root, relativePath) {
	return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(root, relativePath) {
	return JSON.parse(readText(root, relativePath));
}

function gitText(root, args) {
	return execFileSync("git", args, {
		cwd: root,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectDigestMap(value) {
	if (!isRecord(value)) return null;
	return value;
}

function byteRgb(value, label, problems) {
	if (!isRecord(value) || !isRecord(value.rgb)) {
		problems.push(`${label} has no RGB channels`);
		return null;
	}
	const rgb = value.rgb;
	for (const channel of ["r", "g", "b", "a"]) {
		if (
			!Number.isInteger(rgb[channel]) ||
			rgb[channel] < 0 ||
			rgb[channel] > 255
		) {
			problems.push(`${label} has malformed ${channel} channel`);
			return null;
		}
	}
	if (rgb.a !== 255) problems.push(`${label} is not opaque`);
	if (typeof value.raw !== "string")
		problems.push(`${label} has no raw browser value`);
	return { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 };
}

function sameRgb(first, second, tolerance = 0) {
	return (
		first !== null &&
		second !== null &&
		Math.abs(first.r - second.r) <= tolerance &&
		Math.abs(first.g - second.g) <= tolerance &&
		Math.abs(first.b - second.b) <= tolerance
	);
}

export function mixSrgb(first, second, firstWeight = 0.9) {
	const secondWeight = 1 - firstWeight;
	const channel = (a, b) =>
		Math.round(a * firstWeight + b * secondWeight + 1e-9);
	return {
		r: channel(first.r, second.r),
		g: channel(first.g, second.g),
		b: channel(first.b, second.b),
		a: 1,
	};
}

function recordRatio(foreground, background) {
	return contrastRatio(foreground, background);
}

export function validateReconciliationSet({
	originalFingerprints,
	clearedFingerprints,
	residualFingerprints,
}) {
	const problems = [];
	const arrays = [
		originalFingerprints,
		clearedFingerprints,
		residualFingerprints,
	];
	if (arrays.some((items) => !Array.isArray(items))) {
		return ["reconciliation fingerprint lists must be arrays"];
	}
	const [original, cleared, residual] = arrays;
	if (original.length !== 208)
		problems.push("original color denominator is not 208");
	for (const [label, items] of [
		["original", original],
		["cleared", cleared],
		["residual", residual],
	]) {
		if (new Set(items).size !== items.length)
			problems.push(`${label} fingerprints contain duplicates`);
	}
	if (cleared.length !== 207)
		problems.push("expected exactly 207 cleared color fingerprints");
	if (residual.length !== 1 || residual[0] !== EXPECTED_RESIDUAL) {
		problems.push(
			"the exact Linux-only Arabic batch fingerprint must remain residual",
		);
	}
	const originalSet = new Set(original);
	const clearedSet = new Set(cleared);
	for (const fingerprint of cleared) {
		if (!originalSet.has(fingerprint))
			problems.push(`cleared fingerprint is not original: ${fingerprint}`);
	}
	for (const fingerprint of residual) {
		if (!originalSet.has(fingerprint))
			problems.push(`residual fingerprint is not original: ${fingerprint}`);
		if (clearedSet.has(fingerprint))
			problems.push(`fingerprint is both cleared and residual: ${fingerprint}`);
	}
	if (originalSet.size !== clearedSet.size + residual.length) {
		problems.push(
			"cleared and residual fingerprints do not account for the original set",
		);
	}
	for (const fingerprint of originalSet) {
		if (!clearedSet.has(fingerprint) && !residual.includes(fingerprint)) {
			problems.push(`original fingerprint has no disposition: ${fingerprint}`);
		}
	}
	return problems;
}

export function validateSourceDigestBindings(
	record,
	currentDigests,
	expectedPaths,
) {
	const problems = [];
	if (!isRecord(record) || !isRecord(currentDigests))
		return ["source digest record is malformed"];
	const proofInputs = record.sourceProof?.inputs;
	const digests = objectDigestMap(record.sourceDigests);
	if (!Array.isArray(proofInputs) || digests === null)
		return ["source proof inputs or digest map are missing"];
	const seen = new Set();
	const proofMap = new Map();
	for (const input of proofInputs) {
		if (
			!isRecord(input) ||
			typeof input.path !== "string" ||
			typeof input.sha256 !== "string"
		) {
			problems.push("source proof has a malformed input");
			continue;
		}
		if (seen.has(input.path))
			problems.push(`duplicate source proof path: ${input.path}`);
		seen.add(input.path);
		proofMap.set(input.path, input.sha256);
		if (!HASH.test(input.sha256))
			problems.push(`invalid source digest: ${input.path}`);
		if (digests[input.path] !== input.sha256)
			problems.push(`source digest map disagrees: ${input.path}`);
		if (currentDigests[input.path] !== input.sha256)
			problems.push(`source digest is stale or missing: ${input.path}`);
	}
	for (const inputPath of Object.keys(digests)) {
		if (!seen.has(inputPath))
			problems.push(`digest map has an unbound path: ${inputPath}`);
	}
	if (expectedPaths !== undefined) {
		const expected = [...expectedPaths].sort();
		const actual = [...seen].sort();
		if (JSON.stringify(actual) !== JSON.stringify(expected))
			problems.push(
				"source path inventory is incomplete or contains extra paths",
			);
	}
	return problems;
}

export function validateSourceDigestMap(record, currentDigests, expectedPaths) {
	const problems = [];
	const digests = objectDigestMap(record?.sourceDigests);
	if (digests === null || !isRecord(currentDigests))
		return ["source digest map is malformed"];
	const actualPaths = Object.keys(digests).sort();
	const expected = [...expectedPaths].sort();
	if (JSON.stringify(actualPaths) !== JSON.stringify(expected))
		problems.push(
			"source digest inventory is incomplete or contains extra paths",
		);
	for (const [relativePath, digest] of Object.entries(digests)) {
		if (typeof digest !== "string" || !HASH.test(digest)) {
			problems.push(`invalid source digest: ${relativePath}`);
			continue;
		}
		if (currentDigests[relativePath] !== digest)
			problems.push(`source digest is stale or missing: ${relativePath}`);
	}
	return problems;
}

export function validatePrerequisites(prerequisites) {
	if (!Array.isArray(prerequisites)) return ["prerequisites must be an array"];
	const problems = [];
	const byBranch = new Map();
	for (const item of prerequisites) {
		if (!isRecord(item) || typeof item.branch !== "string") {
			problems.push("prerequisite entry is malformed");
			continue;
		}
		if (byBranch.has(item.branch))
			problems.push(`duplicate prerequisite branch: ${item.branch}`);
		byBranch.set(item.branch, item);
	}
	if (prerequisites.length !== PREREQUISITE_BRANCHES.length)
		problems.push("exactly thirteen prerequisites are required");
	for (const branch of PREREQUISITE_BRANCHES) {
		const item = byBranch.get(branch);
		if (item === undefined) {
			problems.push(`missing prerequisite branch: ${branch}`);
			continue;
		}
		if (!item.head || !item.merge)
			problems.push(`missing head or merge identity: ${branch}`);
		if (item.ci?.conclusion !== "success" || item.ci?.head !== item.head)
			problems.push(`CI head or conclusion mismatch: ${branch}`);
		if (
			item.storybook?.conclusion !== "success" ||
			item.storybook?.head !== item.head ||
			!Number.isFinite(item.storybook?.seconds) ||
			item.storybook.seconds >= 400
		) {
			problems.push(
				`Storybook head, conclusion, or runtime mismatch: ${branch}`,
			);
		}
	}
	for (const branch of byBranch.keys())
		if (!PREREQUISITE_BRANCHES.includes(branch))
			problems.push(`unexpected prerequisite branch: ${branch}`);
	return problems;
}

export function validateSealedSourceProof(sourceProof) {
	if (
		!isRecord(sourceProof) ||
		sourceProof.status !== "passed" ||
		sourceProof.sealed !== true
	) {
		throw new Error(
			"source proof is pending or unsealed; final completion is not accepted",
		);
	}
	if (
		sourceProof.invariants?.length === 0 ||
		!Array.isArray(sourceProof.invariants)
	) {
		throw new Error("sealed source proof has no verified invariants");
	}
	if (sourceProof.invariants.some((item) => item?.passed !== true)) {
		throw new Error("sealed source proof contains a failed invariant");
	}
	return true;
}

export function validatePlatformRecord(record) {
	const problems = [];
	if (!isRecord(record) || !isRecord(record.browser))
		return ["platform browser record is missing"];
	if (
		typeof record.browser.userAgent !== "string" ||
		!record.browser.userAgent.includes("HeadlessChrome")
	)
		problems.push("platform browser identity is not Chromium headless");
	if (
		typeof record.browser.platform !== "string" ||
		record.browser.platform.length === 0
	)
		problems.push("platform identity is missing");
	if (record.approvedExpressions?.offTrack !== APPROVED_OFF_TRACK_MIX)
		problems.push("off-track expression is not the approved 90/10 sRGB mix");
	if (
		record.approvedExpressions?.platformIndicatorDark !==
		APPROVED_INDICATOR_DARK_MIX
	)
		problems.push(
			"dark platform-indicator expression is not the approved 90/10 sRGB mix",
		);
	if (
		JSON.stringify(record.approvedExpressions?.weights) !==
		JSON.stringify([0.9, 0.1])
	)
		problems.push("system mix weights are not exactly 90/10");
	if (
		!Array.isArray(record.normalObservations) ||
		record.normalObservations.length !== 2
	)
		problems.push(
			"platform proof must contain light and dark normal-color observations",
		);
	const observedThemes = new Set();
	for (const observation of record.normalObservations ?? []) {
		const theme = observation?.theme;
		if (!THEMES_SET.has(theme)) {
			problems.push("normal-color observation has an unknown theme");
			continue;
		}
		if (observedThemes.has(theme))
			problems.push(`duplicate normal-color theme: ${theme}`);
		observedThemes.add(theme);
		if (
			observation.forcedColors !== false ||
			observation.colorScheme !== theme ||
			observation.dataTheme !== theme
		)
			problems.push(
				`${theme} normal-color media/theme identity is inconsistent`,
			);
		if (observation.productionExpression !== APPROVED_OFF_TRACK_MIX)
			problems.push(
				`${theme} track does not use the approved off-track expression`,
			);
		const gray = byteRgb(
			observation.constituents?.GrayText,
			`${theme} GrayText`,
			problems,
		);
		const canvas = byteRgb(
			observation.constituents?.CanvasText,
			`${theme} CanvasText`,
			problems,
		);
		const probe = byteRgb(observation.mixProbe, `${theme} mix probe`, problems);
		const actual = byteRgb(
			observation.actualTrack,
			`${theme} live track`,
			problems,
		);
		if (gray && canvas && probe && actual) {
			const expected = mixSrgb(gray, canvas, 0.9);
			if (!sameRgb(probe, expected, 1))
				problems.push(`${theme} probe is not the computed sRGB 90/10 result`);
			if (!sameRgb(actual, probe, 0))
				problems.push(
					`${theme} live off-track value differs from its independent mix probe`,
				);
		}
		const ground = byteRgb(observation.ground, `${theme} ground`, problems);
		const raised = byteRgb(
			observation.raised,
			`${theme} raised surface`,
			problems,
		);
		const thumb = byteRgb(observation.thumb, `${theme} thumb`, problems);
		const whiteProbe = byteRgb(
			observation.cleanWhiteProbe,
			`${theme} pinned Clean White probe`,
			problems,
		);
		if (thumb && !sameRgb(thumb, { r: 255, g: 255, b: 255 }, 0))
			problems.push(`${theme} thumb identity is not exact Clean White`);
		if (whiteProbe && !sameRgb(whiteProbe, { r: 255, g: 255, b: 255 }, 0))
			problems.push(`${theme} Clean White probe is not opaque white`);
		if (
			observation.cleanWhitePrimitive?.toUpperCase() !== "#FFFFFF" ||
			observation.thumbIdentity !== true
		)
			problems.push(
				`${theme} thumb identity does not match the pinned Clean White primitive`,
			);
		const nearWhite = observation.nearWhiteThumbPlant;
		if (
			nearWhite?.paint !== "rgb(254, 254, 254)" ||
			nearWhite.contrastPasses !== true ||
			nearWhite.identityRejected !== true ||
			nearWhite.restoredIdentity !== true
		)
			problems.push(
				`${theme} near-white thumb rejection/restoration control failed`,
			);
		if (probe && ground && raised && thumb) {
			const ratios = {
				trackToGround: recordRatio(probe, ground),
				trackToRaised: recordRatio(probe, raised),
				thumbToTrack: recordRatio(thumb, probe),
			};
			for (const [name, ratio] of Object.entries(ratios)) {
				if (ratio < 3) problems.push(`${theme} ${name} is below 3:1`);
				if (Math.abs((observation.ratios?.[name] ?? NaN) - ratio) > 1e-9)
					problems.push(
						`${theme} ${name} ratio does not match the recorded colors`,
					);
			}
		}
		for (const [name, passed] of Object.entries(
			observation.negativeControls ?? {},
		))
			if (passed !== true)
				problems.push(`${theme} platform negative control failed: ${name}`);
	}
	if (observedThemes.size !== 2)
		problems.push("both normal-color themes are not represented");
	if (
		!Array.isArray(record.forcedObservations) ||
		record.forcedObservations.length !== 2
	)
		problems.push("forced-colors proof must contain both themes");
	const forcedThemes = new Set();
	for (const observation of record.forcedObservations ?? []) {
		if (
			!THEMES_SET.has(observation?.theme) ||
			forcedThemes.has(observation?.theme)
		)
			problems.push("forced-colors themes are missing, invalid, or duplicated");
		forcedThemes.add(observation?.theme);
		if (
			observation?.forcedColors !== true ||
			observation?.dataTheme !== observation?.theme ||
			observation?.geometryPreserved !== true
		)
			problems.push(
				"forced-colors media, theme, or geometry observation failed",
			);
		if (
			observation?.selectedRowRemoval?.rejectedWithoutStylesheet !== true ||
			observation?.selectedRowRemoval?.passedAfterRestore !== true
		)
			problems.push("forced-colors removal control is not red/green");
	}
	if (forcedThemes.size !== 2)
		problems.push("both forced-colors themes are not represented");
	if (
		!Array.isArray(record.originalFindingFingerprints) ||
		record.originalFindingFingerprints.length !== 7 ||
		new Set(record.originalFindingFingerprints).size !== 7
	)
		problems.push("off-track fingerprints are incomplete or duplicated");
	if (
		!Array.isArray(record.currentPairFingerprints) ||
		record.currentPairFingerprints.length !== 100 ||
		new Set(record.currentPairFingerprints.map((row) => row.fingerprint))
			.size !== 100
	)
		problems.push(
			"platform static fingerprint inventory is not the exact 100-row set",
		);
	if (
		!Array.isArray(record.proposedPromiseIds) ||
		record.proposedPromiseIds.length !== 27 ||
		new Set(record.proposedPromiseIds).size !== 27
	)
		problems.push(
			"the 27 proposed palette promises are incomplete or duplicated",
		);
	problems.push(
		...validateResolverNegativeControls(record.resolverNegativeControls),
	);
	return problems;
}

export function validateIndicatorRoleMix(
	observation,
	theme,
	label = "indicator",
) {
	const problems = [];
	const accent = byteRgb(observation?.accent, `${label} accent`, problems);
	const canvasText = byteRgb(
		observation?.canvasText,
		`${label} CanvasText`,
		problems,
	);
	const mixProbe = byteRgb(
		observation?.mixProbe,
		`${label} mix probe`,
		problems,
	);
	const roleProbe = byteRgb(
		observation?.roleProbe,
		`${label} role probe`,
		problems,
	);
	if (accent && canvasText && mixProbe) {
		const expectedMix = mixSrgb(accent, canvasText, 0.9);
		if (!sameRgb(mixProbe, expectedMix, 1))
			problems.push(
				`${label} probe does not match the independently computed 90/10 mix`,
			);
		if (theme === "dark" && roleProbe && !sameRgb(roleProbe, expectedMix, 0))
			problems.push(`${label} dark role does not equal the exact 90/10 mix`);
		if (theme === "light" && roleProbe && !sameRgb(roleProbe, accent, 0))
			problems.push(`${label} light role is not the raw system accent`);
	}
	return problems;
}

export function validateIndicatorBoundaries({
	boundaries,
	ratios,
	roleProbe,
	label = "indicator",
}) {
	const problems = [];
	if (!Array.isArray(boundaries) || boundaries.length !== 8) {
		problems.push(`${label} boundaries are incomplete`);
		return problems;
	}
	const positions = boundaries.map((boundary) => boundary?.position);
	if (
		new Set(positions).size !== INDICATOR_BOUNDARY_POSITIONS.length ||
		INDICATOR_BOUNDARY_POSITIONS.some(
			(position) => !positions.includes(position),
		)
	)
		problems.push(`${label} boundaries are missing or duplicated`);
	const ratioKeys = isRecord(ratios) ? Object.keys(ratios).sort() : [];
	if (
		JSON.stringify(ratioKeys) !==
		JSON.stringify([...INDICATOR_BOUNDARY_POSITIONS].sort())
	)
		problems.push(`${label} boundary ratio inventory is incomplete`);
	const foreground = byteRgb(roleProbe, `${label} role probe`, problems);
	for (const boundary of boundaries) {
		const paint = byteRgb(
			boundary?.paint,
			`${label} ${boundary?.position ?? "unknown"}`,
			problems,
		);
		if (!foreground || !paint) continue;
		const actualRatio = recordRatio(foreground, paint);
		if (actualRatio < 3)
			problems.push(`${label} ${boundary.position} is below 3:1`);
		if (
			typeof ratios?.[boundary.position] !== "number" ||
			Math.abs(ratios[boundary.position] - actualRatio) > 1e-9
		)
			problems.push(`${label} ${boundary.position} ratio is missing or stale`);
	}
	return problems;
}

const DARK_ONLY_DROP_CONTROLS = new Set([
	"rawDarkAccentRejected",
	"wrongWeightRejected",
	"unrelatedRoleRejected",
]);
const DROP_NEGATIVE_CONTROL_NAMES = Object.freeze([
	"rawDarkAccentRejected",
	"omittedSideRejected",
	"wrongWeightRejected",
	"unrelatedRoleRejected",
	"geometryMutationRejected",
	"surfaceMutationRejected",
	"restoredGreen",
]);

export function validateDropNegativeControls(theme, controls) {
	const problems = [];
	if (!THEMES_SET.has(theme) || !isRecord(controls))
		return ["drop-border negative controls are malformed"];
	if (
		JSON.stringify(Object.keys(controls).sort()) !==
		JSON.stringify([...DROP_NEGATIVE_CONTROL_NAMES].sort())
	)
		problems.push(`${theme} drop negative-control inventory is incomplete`);
	for (const name of DROP_NEGATIVE_CONTROL_NAMES) {
		const expected = theme === "dark" || !DARK_ONLY_DROP_CONTROLS.has(name);
		if (controls[name] !== expected)
			problems.push(
				`${theme} drop negative control has the wrong theme result: ${name}`,
			);
	}
	return problems;
}

export function validateResolverNegativeControls(controls) {
	const problems = [];
	if (!isRecord(controls)) return ["resolver negative controls are malformed"];
	if (
		JSON.stringify(Object.keys(controls).sort()) !==
		JSON.stringify([...THEMES].sort())
	)
		problems.push("resolver negative-control theme inventory is incomplete");
	for (const theme of THEMES)
		if (controls[theme] !== true)
			problems.push(`resolver negative controls failed for ${theme}`);
	return problems;
}

export function validateForcedAccentControl(observation) {
	if (observation?.kind !== "active-drop-border") return [];
	if (
		observation.rawAccentPlant?.rejectedBySystemAdjustment === true &&
		observation.rawAccentPlant?.restored === true
	)
		return [];
	return ["forced-colors raw-accent removal/restoration control failed"];
}

function validateIndicatorRecord(record, currentDigests) {
	const problems = [];
	if (
		!isRecord(record) ||
		record.schemaVersion !== 1 ||
		!isRecord(record.browser)
	)
		return ["indicator evidence record is malformed"];
	problems.push(
		...validateSourceDigestBindings(
			record,
			currentDigests,
			INDICATOR_EVIDENCE_INPUTS,
		),
	);
	if (
		record.browser.platform !== "MacIntel" ||
		!record.browser.userAgent?.includes("HeadlessChrome")
	)
		problems.push(
			"indicator browser identity is not the current macOS headless Chromium run",
		);
	for (const name of ["focus", "toggleOn", "drop", "forcedColors"])
		if (!Array.isArray(record.gates?.[name]))
			problems.push(`indicator gate ${name} is missing`);
	if (
		record.gates?.focus?.length !== 2 ||
		record.gates?.toggleOn?.length !== 2 ||
		record.gates?.drop?.length !== 2 ||
		record.gates?.forcedColors?.length !== 4
	)
		problems.push("indicator gate theme/state coverage is incomplete");
	for (const observation of record.gates?.focus ?? []) {
		if (
			!THEMES_SET.has(observation.theme) ||
			observation.dataTheme !== observation.theme ||
			observation.colorScheme !== observation.theme ||
			observation.forcedColors !== false
		)
			problems.push("focus gate theme/media state is inconsistent");
		const dark = observation.theme === "dark";
		const expression = dark
			? APPROVED_INDICATOR_DARK_MIX
			: "var(--ec-color-accent)";
		if (observation.productionExpression !== expression)
			problems.push(`${observation.theme} focus expression is not approved`);
		problems.push(
			...validateIndicatorRoleMix(
				observation,
				observation.theme,
				`${observation.theme} focus`,
			),
		);
		const role = byteRgb(
			observation.roleProbe,
			`${observation.theme} focus role probe`,
			problems,
		);
		const actuals = observation.segments ?? [];
		if (
			actuals.length !== 3 ||
			![0, 1, 2].every((index) =>
				actuals.some((segment) => segment.index === index),
			)
		)
			problems.push(
				`${observation.theme} focus first/middle/last segments are incomplete`,
			);
		for (const segment of actuals) {
			const actual = byteRgb(
				segment.actual,
				`${observation.theme} focus segment ${segment.index}`,
				problems,
			);
			if (role && actual && !sameRgb(actual, role, 0))
				problems.push(
					`${observation.theme} focus segment differs from its production role`,
				);
			problems.push(
				...validateIndicatorBoundaries({
					boundaries: segment.boundaries,
					ratios: segment.ratios,
					roleProbe: observation.roleProbe,
					label: `${observation.theme} focus segment ${segment.index}`,
				}),
			);
		}
	}
	for (const observation of record.gates?.drop ?? []) {
		if (
			!THEMES_SET.has(observation.theme) ||
			observation.dataTheme !== observation.theme ||
			observation.colorScheme !== observation.theme ||
			observation.forcedColors !== false ||
			observation.active !== true
		)
			problems.push("drop-border theme/media/state is inconsistent");
		const expression =
			observation.theme === "dark"
				? APPROVED_INDICATOR_DARK_MIX
				: "var(--ec-color-accent)";
		if (observation.productionExpression !== expression)
			problems.push(
				`${observation.theme} drop-border expression is not approved`,
			);
		problems.push(
			...validateIndicatorRoleMix(
				observation,
				observation.theme,
				`${observation.theme} drop`,
			),
		);
		const role = byteRgb(
			observation.roleProbe,
			`${observation.theme} drop role probe`,
			problems,
		);
		problems.push(
			...validateIndicatorBoundaries({
				boundaries: observation.boundaries,
				ratios: observation.ratios,
				roleProbe: observation.roleProbe,
				label: `${observation.theme} drop border`,
			}),
		);
		problems.push(
			...validateDropNegativeControls(
				observation.theme,
				observation.negativeControls,
			),
		);
	}
	for (const observation of record.gates?.toggleOn ?? []) {
		if (
			!THEMES_SET.has(observation.theme) ||
			observation.dataTheme !== observation.theme ||
			observation.colorScheme !== observation.theme ||
			observation.forcedColors !== false ||
			observation.checked !== "true"
		)
			problems.push("toggle-on gate changed theme, media, or checked state");
		const accent = byteRgb(
			observation.accent,
			`${observation.theme} toggle accent`,
			problems,
		);
		const track = byteRgb(
			observation.track,
			`${observation.theme} toggle-on track`,
			problems,
		);
		if (accent && track && !sameRgb(accent, track, 0))
			problems.push(`${observation.theme} toggle-on track is not raw accent`);
	}
	for (const observation of record.gates?.forcedColors ?? []) {
		if (
			!THEMES_SET.has(observation.theme) ||
			observation.forcedColors !== true ||
			observation.kind === undefined
		)
			problems.push("forced-colors indicator observation is incomplete");
		problems.push(...validateForcedAccentControl(observation));
	}
	const staticRows = record.staticContrast?.results;
	if (
		record.staticContrast?.count !== 100 ||
		record.staticContrast?.passing !== 100 ||
		record.staticContrast?.unresolved !== 0 ||
		!Array.isArray(staticRows) ||
		staticRows.length !== 100
	)
		problems.push("indicator static contrast is not the 100-row all-pass set");
	if (
		record.staticContrast?.proposedCount !== 27 ||
		record.staticContrast?.proposedPassing !== 27 ||
		record.staticContrast?.proposedCounterparts?.length !== 27
	)
		problems.push("indicator promise counterpart inventory is incomplete");
	for (const row of staticRows ?? [])
		if (row.pass !== true || row.ratio < row.threshold)
			problems.push(`static contrast row fails: ${row.fingerprint}`);
	for (const [name, passed] of Object.entries(record.negativeControls ?? {}))
		if (passed !== true)
			problems.push(`indicator negative control failed: ${name}`);
	if (record.negativeControls?.allVisualPlantsRestored !== true)
		problems.push("indicator visual fixture plant was not restored");
	return problems;
}

function sourceSnapshot(root, paths) {
	const inputs = [...new Set(paths)].sort();
	const digests = {};
	for (const relativePath of inputs)
		digests[relativePath] = sha256(
			fs.readFileSync(path.join(root, relativePath)),
		);
	return {
		inputs: inputs.map((relativePath) => ({
			path: relativePath,
			sha256: digests[relativePath],
		})),
		digests,
	};
}

function runGate(root, args, runner, timeout) {
	const result = runner("yarn", args, {
		cwd: root,
		encoding: "utf8",
		timeout,
		maxBuffer: 16 * 1024 * 1024,
		env: {
			...process.env,
			ASDF_NODEJS_VERSION: "22.14.0",
			CI: "true",
			STORYBOOK_DISABLE_TELEMETRY: "true",
		},
	});
	if (result.error) throw result.error;
	if (result.status !== 0)
		throw new Error(
			`browser gate failed (${result.status}): ${result.stdout ?? ""}\n${result.stderr ?? ""}`,
		);
}

export function collectBrowserRecords({
	root,
	runner = spawnSync,
	fsApi = fs,
	now = Date.now,
}) {
	const platformPath = path.join(root, PLATFORM_RECORD_PATH);
	const indicatorPath = path.join(root, INDICATOR_RECORD_PATH);
	fsApi.rmSync(platformPath, { force: true });
	fsApi.rmSync(indicatorPath, { force: true });
	const startPlatform = now();
	runGate(
		root,
		[
			"-s",
			"vitest",
			"run",
			"--config",
			"vitest.storybook.config.ts",
			"--project",
			"storybook-forced-colors",
			".storybook/forced_colors.test.tsx",
		],
		runner,
		PLATFORM_GATE_TIMEOUT_MS,
	);
	const platform = JSON.parse(fsApi.readFileSync(platformPath, "utf8"));
	if (!platform.normalObservations || now() < startPlatform)
		throw new Error("forced-colors gate did not write a fresh platform record");
	const startIndicators = now();
	runGate(
		root,
		[
			"-s",
			"vitest",
			"run",
			"--config",
			"vitest.storybook.config.ts",
			"--project",
			"storybook-platform-indicators",
			".storybook/platform_indicators.test.tsx",
		],
		runner,
		PLATFORM_GATE_TIMEOUT_MS,
	);
	const indicators = JSON.parse(fsApi.readFileSync(indicatorPath, "utf8"));
	if (!indicators.gates || now() < startIndicators)
		throw new Error("indicator gate did not write a fresh indicator record");
	return {
		platform,
		indicators,
		platformSha256: sha256(fsApi.readFileSync(platformPath)),
		indicatorsSha256: sha256(fsApi.readFileSync(indicatorPath)),
	};
}

function exactTokenDeclarations(tokensCss, name) {
	return cssDeclarations(tokensCss).filter((item) => item.property === name);
}

function readBrandColors(root) {
	const brand = readJson(
		root,
		".brand-cache/unpacked/exifcleaner-brand/tokens.json",
	);
	const colors = new Set();
	const primitiveProperties = new Set();
	for (const theme of ["light", "dark"]) {
		for (const [name, token] of Object.entries(brand.color?.[theme] ?? {})) {
			const hex = token?.$value?.hex;
			if (typeof hex === "string") {
				colors.add(hex.toLowerCase());
				primitiveProperties.add(`--ec-brand-${name}`);
			}
		}
	}
	return { brand, colors, primitiveProperties };
}

function validateSourcePolicies(
	root,
	pairDoc,
	results,
	platformRecord,
	indicatorRecord,
) {
	const problems = [];
	const tokensCss = readText(root, "src/renderer/styles/tokens.css");
	const toggleCss = readText(root, "src/renderer/styles/toggle_switch.css");
	const segmentedCss = readText(
		root,
		"src/renderer/styles/segmented_control.css",
	);
	const dropCss = readText(root, "src/renderer/styles/drop_zone.css");
	const indicatorConsumers = [
		["src/renderer/styles/segmented_control.css", segmentedCss],
		["src/renderer/styles/drop_zone.css", dropCss],
	];
	for (const [file, source] of indicatorConsumers) {
		const matches =
			source.match(/var\(\s*--ec-color-platform-indicator\s*\)/g) ?? [];
		if (matches.length !== 1)
			problems.push(
				`${file} must contain exactly one approved platform-indicator consumer`,
			);
	}
	const allStyles = fs
		.readdirSync(path.join(root, STYLE_DIR))
		.filter((name) => name.endsWith(".css"));
	for (const name of allStyles) {
		const relative = `${STYLE_DIR}/${name}`;
		const text = readText(root, relative);
		if (
			!ALLOWED_INDICATOR_CONSUMERS.has(relative) &&
			/var\(\s*--ec-color-platform-indicator\s*\)/.test(text)
		)
			problems.push(
				`platform-indicator has an unapproved consumer in ${relative}`,
			);
	}
	const indicatorLight = exactTokenDeclarations(
		tokensCss,
		"--ec-color-platform-indicator",
	).filter((d) => d.selectors.join(" ") === ":root");
	const indicatorDark = exactTokenDeclarations(
		tokensCss,
		"--ec-color-platform-indicator",
	).filter((d) => d.selectors.join(" ") === '[data-theme="dark"]');
	if (
		indicatorLight.length !== 1 ||
		indicatorLight[0]?.value !== "var(--ec-color-accent)"
	)
		problems.push("light indicator must remain raw system accent");
	if (
		indicatorDark.length !== 1 ||
		indicatorDark[0]?.value !== APPROVED_INDICATOR_DARK_MIX
	)
		problems.push("dark indicator must use the exact approved 90/10 mix");
	const offTrackDeclarations = exactTokenDeclarations(
		tokensCss,
		"--ec-toggle-off-track",
	);
	if (
		offTrackDeclarations.length !== 2 ||
		offTrackDeclarations.some((d) => d.value !== APPROVED_OFF_TRACK_MIX)
	)
		problems.push(
			"both off-track declarations must use the approved 90/10 mix",
		);
	if (
		(
			toggleCss.match(/background\s*:\s*var\(\s*--ec-toggle-off-track\s*\)/g) ??
			[]
		).length !== 1
	)
		problems.push(
			"off-track mix is not connected only to the toggle off-track role",
		);
	if (
		!/\.segmented-control__segment:focus-visible\s*\{[^}]*outline\s*:\s*2px solid var\(--ec-color-platform-indicator\)/s.test(
			segmentedCss,
		)
	)
		problems.push("segmented focus indicator consumer is missing");
	if (
		!/\.drop-zone--active\s*\{[^}]*border\s*:\s*2px dashed var\(--ec-color-platform-indicator\)/s.test(
			dropCss,
		)
	)
		problems.push("active drop-zone indicator consumer is missing");
	const { brand, colors, primitiveProperties } = readBrandColors(root);
	const cleanWhite = brand.color?.light?.["clean-white"]?.$value?.hex;
	const darkCleanWhite = brand.color?.dark?.["clean-white"]?.$value?.hex;
	const darkDeepTeal = brand.color?.dark?.["deep-teal"]?.$value?.hex;
	if (
		cleanWhite?.toUpperCase() !== "#FFFFFF" ||
		darkCleanWhite?.toUpperCase() !== "#FFFFFF" ||
		darkDeepTeal?.toUpperCase() !== "#0A2E2B"
	)
		problems.push("pinned Clean White or Deep Teal value is not exact");
	const tokens = cssDeclarations(tokensCss);
	for (const color of colors) {
		const occurrences = tokens.filter((declaration) =>
			declaration.value.toLowerCase().includes(color),
		);
		if (
			occurrences.some(
				(declaration) => !primitiveProperties.has(declaration.property),
			)
		)
			problems.push(
				`brand literal ${color} appears outside a primitive declaration`,
			);
	}
	const allSources = [];
	function walk(directory) {
		for (const entry of fs
			.readdirSync(directory, { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name))) {
			const absolute = path.join(directory, entry.name);
			if (entry.isDirectory()) walk(absolute);
			else if (
				/\.(?:ts|tsx|css|mjs)$/.test(entry.name) &&
				!/\.stories\.tsx?$/.test(entry.name) &&
				!absolute.split(path.sep).includes("story_support")
			)
				allSources.push(absolute);
		}
	}
	walk(path.join(root, "src"));
	for (const absolute of allSources) {
		const relative = path.relative(root, absolute).split(path.sep).join("/");
		if (relative === "src/renderer/styles/tokens.css") continue;
		const literals = colourLiteralsInSource({
			file: relative,
			text: fs.readFileSync(absolute, "utf8"),
		});
		if (relative === "src/main/window/window_background.ts") {
			for (const [literal, expectedCount] of [
				[cleanWhite.toLowerCase(), 1],
				[darkDeepTeal.toLowerCase(), 1],
			]) {
				const count = literals.filter(
					(candidate) => candidate === literal,
				).length;
				if (count !== expectedCount)
					problems.push(
						`window background must retain exactly ${expectedCount} ${literal} pinned value`,
					);
			}
			for (const color of colors)
				if (
					literals.includes(color) &&
					![cleanWhite.toLowerCase(), darkDeepTeal.toLowerCase()].includes(
						color,
					)
				)
					problems.push(`unapproved brand literal ${color} in ${relative}`);
			continue;
		}
		for (const color of colors)
			if (literals.includes(color))
				problems.push(`brand literal ${color} leaks into ${relative}`);
	}
	const accentSites = {};
	for (const absolute of allSources) {
		const relative = path.relative(root, absolute).split(path.sep).join("/");
		const count = (fs.readFileSync(absolute, "utf8").match(/#007aff/gi) ?? [])
			.length;
		if (count > 0) accentSites[relative] = count;
	}
	const actualAccentSites = Object.fromEntries(
		Object.entries(accentSites).sort(([a], [b]) => a.localeCompare(b)),
	);
	if (
		JSON.stringify(actualAccentSites) !==
		JSON.stringify({
			"src/domain/accent_color.ts": 1,
			"src/renderer/styles/tokens.css": 2,
		})
	)
		problems.push(
			"system-accent literal is not limited to its three approved declarations",
		);
	for (const declaration of cssDeclarations(
		allSources.map((file) => fs.readFileSync(file, "utf8")).join("\n"),
	)) {
		if (
			declaration.property === "cursor" &&
			declaration.value.trim() !== "default"
		)
			problems.push(`unexpected CSS cursor value: ${declaration.value}`);
	}
	const copyCursor =
		readText(
			root,
			"src/renderer/components/file-list/ErrorExpansion.tsx",
		).match(/cursor:\s*["']copy["']/g) ?? [];
	if (copyCursor.length !== 1)
		problems.push(
			"ErrorExpansion copy affordance lost its explicit copy cursor",
		);
	if (
		pairDoc.pairs.length !== 37 ||
		results.length !== 100 ||
		results.some((row) => !row.pass)
	)
		problems.push(
			"actual static pair matrix is not the 37-pair/100-row all-pass set",
		);
	if (
		proposedResults(pairDoc).length < 27 ||
		proposedResults(pairDoc).some((row) => !row.pass)
	)
		problems.push("proposed palette promise results are incomplete or failing");
	if (brandRatioProblems(pairDoc).length)
		problems.push("brand contrast promises do not match pinned brand ratios");
	if (
		platformRecord?.normalObservations?.length !== 2 ||
		indicatorRecord?.gates?.focus?.length !== 2 ||
		indicatorRecord?.gates?.drop?.length !== 2
	)
		problems.push("fresh live platform or indicator records are missing");
	return problems;
}

function actualStylesheets(root) {
	const directory = path.join(root, STYLE_DIR);
	return Object.fromEntries(
		fs
			.readdirSync(directory)
			.filter((name) => name.endsWith(".css"))
			.sort()
			.map((name) => [name, readText(root, `${STYLE_DIR}/${name}`)]),
	);
}

export function validatePrerequisiteAncestry(
	root,
	prerequisites,
	effectiveBase,
) {
	const problems = validatePrerequisites(prerequisites);
	if (!effectiveBase)
		return [...problems, "effective implementation base is missing"];
	for (const item of prerequisites ?? []) {
		for (const identity of [item.head, item.merge]) {
			if (!identity) continue;
			try {
				gitText(root, ["merge-base", "--is-ancestor", identity, "HEAD"]);
			} catch {
				problems.push(
					`prerequisite ${item.branch} identity is not an ancestor: ${identity}`,
				);
			}
		}
	}
	try {
		gitText(root, ["merge-base", "--is-ancestor", effectiveBase, "HEAD"]);
	} catch {
		problems.push("effective implementation base is not an ancestor of HEAD");
	}
	return problems;
}

function validateProtectedBlobs(root, effectiveBase) {
	const problems = [];
	const master = gitText(root, ["rev-parse", "origin/master"]).trim();
	for (const relativePath of PROTECTED_PATHS) {
		const masterBlob = gitText(root, [
			"rev-parse",
			`${master}:${relativePath}`,
		]).trim();
		const currentBlob = gitText(root, [
			"hash-object",
			"--",
			relativePath,
		]).trim();
		if (masterBlob !== currentBlob)
			problems.push(
				`protected prerequisite blob differs from master: ${relativePath}`,
			);
	}
	if (!effectiveBase)
		problems.push("effective base missing while checking protected blobs");
	return { problems, master, paths: PROTECTED_PATHS };
}

function validateTrackedSource(root, measurement, options) {
	const problems = [];
	const baseRef =
		options.base ?? measurement.implementation?.effectiveImplementationBase;
	const v50Ref = options.v50 ?? measurement.implementation?.v50Close;
	if (!baseRef)
		return {
			problems: ["implementation base is not recorded"],
			baseRef,
			v50Ref,
		};
	const forbidden =
		/(^|\/)(?:package\.json|yarn\.lock|package-lock\.json|pnpm-lock\.yaml)$|^(?:src\/.*(?:ipc|preload|processing|engine|native)|src\/main\/window_setup\.ts)$/i;
	let changedPaths = [];
	try {
		const tracked = gitText(root, ["diff", "--name-only", baseRef])
			.trim()
			.split("\n")
			.filter(Boolean);
		const untracked = gitText(root, [
			"ls-files",
			"--others",
			"--exclude-standard",
		])
			.trim()
			.split("\n")
			.filter(Boolean);
		changedPaths = [...new Set([...tracked, ...untracked])].sort();
	} catch (error) {
		problems.push(
			`cannot read current implementation-tree diff: ${String(error)}`,
		);
	}
	for (const changed of changedPaths)
		if (forbidden.test(changed))
			problems.push(`forbidden palette diff path: ${changed}`);
	const electronVersion = readJson(root, "package.json").version;
	if (electronVersion !== "4.8.0")
		problems.push(`Electron package version changed to ${electronVersion}`);
	const rootPackage = path.resolve(root, "..");
	try {
		const workspaceDiff = gitText(rootPackage, [
			"diff",
			"--name-only",
			baseRef,
			"--",
			".planning",
		]);
		if (workspaceDiff.trim())
			problems.push(
				"workspace planning files appear in the Electron implementation diff",
			);
	} catch {
		// The workspace and Electron repository have distinct histories; the exact
		// implementation PR diff is checked by its final verifier.
	}
	if (v50Ref) {
		try {
			gitText(root, ["merge-base", "--is-ancestor", v50Ref, "HEAD"]);
		} catch {
			problems.push(
				"v5.0 close is not an ancestor of the palette implementation",
			);
		}
	}
	return { problems, baseRef, v50Ref, changedPaths };
}

function validateMeasurementAndReconciliation(
	root,
	measurement,
	reconciliation,
	currentResults,
) {
	const problems = [];
	const original = measurement.originalSet?.fingerprints;
	const cleared = reconciliation.clearedFingerprints;
	const residual = reconciliation.residualFingerprints;
	if (measurement.originalSet?.count !== 208)
		problems.push("canonical measurement denominator is not exactly 208");
	const originalKinds = (original ?? []).reduce((counts, fingerprint) => {
		const kind = fingerprint.split("|", 1)[0];
		counts[kind] = (counts[kind] ?? 0) + 1;
		return counts;
	}, {});
	if (
		originalKinds["a11y-p72"] !== 71 ||
		originalKinds["a11y-p73"] !== 71 ||
		originalKinds["contrast-gap"] !== 66
	)
		problems.push("original 208-row color denominator changed composition");
	problems.push(
		...validateReconciliationSet({
			originalFingerprints: original,
			clearedFingerprints: cleared,
			residualFingerprints: residual,
		}),
	);
	const findings = readJson(root, "docs/evidence/known-findings.json");
	const currentFp = findings.entries.map((entry) => entry.fingerprint);
	if (!currentFp.includes(EXPECTED_RESIDUAL))
		problems.push(
			"the exact cross-platform residual is missing from the findings register",
		);
	if (
		currentFp.includes(
			"token-map-gap|ui-emptystate--copy-mode-on|empty-state-secondary-hardcoded",
		)
	)
		problems.push("the fixed EmptyState token-map gap remains listed");
	if (findings.entries.length !== 158)
		problems.push(
			"the final findings register does not contain the 158 expected current entries",
		);
	for (const fingerprint of cleared)
		if (currentFp.includes(fingerprint))
			problems.push(`fixed fingerprint is still listed: ${fingerprint}`);
	if (
		measurement.contrast?.currentStatic?.count !== 100 ||
		measurement.contrast.currentStatic.passing !== 100
	)
		problems.push(
			"canonical measurement does not contain 100 passing static results",
		);
	if (currentResults.length !== 100 || currentResults.some((row) => !row.pass))
		problems.push("live static evaluation is not 100/100 passing");
	if (
		!Array.isArray(reconciliation.contrast?.ledger) ||
		reconciliation.contrast.ledger.length !== 66
	)
		problems.push("the exact historical contrast ledger is incomplete");
	for (const entry of reconciliation.contrast?.ledger ?? []) {
		if (
			entry.currentCounterparts.length === 0 &&
			!entry.fingerprint.includes("selection-on-accent")
		)
			problems.push(`unproved source absence: ${entry.fingerprint}`);
		for (const counterpart of entry.currentCounterparts) {
			const actual = currentResults.find(
				(row) => row.fingerprint === counterpart.fingerprint,
			);
			if (!actual || !actual.pass)
				problems.push(
					`missing or failing actual contrast counterpart for ${entry.fingerprint}`,
				);
		}
	}
	const empty = measurement.emptyStateTokenMapCorrection;
	if (
		empty?.findingRemoved !== true ||
		empty?.storyReplay?.light?.passed !== 12 ||
		empty?.storyReplay?.dark?.passed !== 12 ||
		empty.storyReplay.light.failed !== 0 ||
		empty.storyReplay.dark.failed !== 0
	)
		problems.push("both-theme EmptyState token-map proof is incomplete");
	if (reconciliation.tokenMapGap?.colorContrastViolations !== 0)
		problems.push("EmptyState replay contains a color-contrast violation");
	const currentRows = new Set(currentFp);
	if (
		!currentRows.has(
			"token-map-gap|file-list-filerow--copy-mode-disclosure|line-height-token-undefined",
		)
	)
		problems.push("the unrelated line-height token-map residual was removed");
	return problems;
}

function validateAxeColorObservations({
	report,
	reportSha256,
	reconciliation,
	originalFingerprints,
	canonicalObservations,
}) {
	const problems = [];
	if (!isRecord(report) || !Array.isArray(report.observations))
		return ["fresh rule-enabled axe color report is missing or malformed"];
	if (
		report.schemaVersion !== 1 ||
		report.head !== reconciliation.axeColor?.head ||
		report.candidates !== 142 ||
		report.observations.length !== 284 ||
		reconciliation.axeColor?.candidateCount !== 142 ||
		reconciliation.axeColor?.observationCount !== 284 ||
		reconciliation.axeColor?.reportSha256 !== reportSha256
	)
		problems.push(
			"fresh axe report does not match its recorded head, count, or digest",
		);
	if (
		!Array.isArray(canonicalObservations) ||
		JSON.stringify(canonicalObservations) !==
			JSON.stringify(report.observations)
	)
		problems.push(
			"canonical measurement does not preserve the exact 284 axe observations",
		);
	const expected = (originalFingerprints ?? []).filter((fingerprint) =>
		/^a11y-p7[23]\|/.test(fingerprint),
	);
	if (expected.length !== 142 || new Set(expected).size !== 142)
		problems.push(
			"the original rendered axe fingerprint set is not 142 unique rows",
		);
	const expectedSet = new Set(expected);
	const seen = new Map();
	const storyFiles = new Set();
	for (const observation of report.observations) {
		if (
			!isRecord(observation) ||
			typeof observation.fingerprint !== "string" ||
			!expectedSet.has(observation.fingerprint) ||
			observation.rule !== "color-contrast" ||
			observation.result !== "pass" ||
			typeof observation.story !== "string" ||
			typeof observation.storyFile !== "string" ||
			observation.platform !== "MacIntel" ||
			!observation.browser?.includes("HeadlessChrome")
		) {
			problems.push(
				"axe observation is not a matching passing story/theme result",
			);
			continue;
		}
		const themes = seen.get(observation.fingerprint) ?? new Set();
		if (themes.has(observation.theme))
			problems.push(
				`duplicate axe theme observation: ${observation.fingerprint}`,
			);
		if (!THEMES_SET.has(observation.theme))
			problems.push(`unknown axe observation theme: ${observation.theme}`);
		themes.add(observation.theme);
		seen.set(observation.fingerprint, themes);
		storyFiles.add(observation.storyFile);
	}
	if (
		seen.size !== 142 ||
		[...seen.values()].some((themes) => themes.size !== 2)
	)
		problems.push(
			"axe report does not cover all 142 original stories in both themes",
		);
	if (
		storyFiles.size !== 15 ||
		storyFiles.size !== reconciliation.axeColor?.storyFiles
	)
		problems.push("axe report does not cover the recorded fifteen story files");
	const expectedCleared = expected.filter(
		(fingerprint) => fingerprint !== EXPECTED_RESIDUAL,
	);
	const recordedCleared = reconciliation.axeColor?.clearedFingerprints;
	if (
		!Array.isArray(recordedCleared) ||
		JSON.stringify([...recordedCleared].sort()) !==
			JSON.stringify([...expectedCleared].sort())
	)
		problems.push(
			"axe deletion list is not exactly the 141 proven non-residual rows",
		);
	return problems;
}

function currentMeasurementInputs(root, reconciliation) {
	const paths = [
		...Object.keys(reconciliation.sourceDigests ?? {}),
		RECONCILIATION_PATH,
		...PLATFORM_EVIDENCE_INPUTS,
		...INDICATOR_EVIDENCE_INPUTS,
		"scripts/palette_77_proof.mjs",
		"tests/scripts/palette_77_proof.test.ts",
		"scripts/colour_literal_ratchet.mjs",
		"scripts/shrink_only_check.mjs",
		"scripts/shrink_only_check.d.mts",
		"tests/renderer/gates/shrink_only.test.ts",
		"tests/renderer/gates/colour_literal.test.ts",
		"tests/renderer/gates/window_background.test.ts",
		"src/main/window/window_background.ts",
		"src/renderer/styles/metadata_expansion.css",
		".storybook/config.test.ts",
		".storybook/catalog/brand_quote_check.test.ts",
		".storybook/catalog/token_map.test.ts",
		".storybook/a11y_p72_recheck.test.tsx",
		".storybook/catalog/css_scan.mjs",
		".storybook/catalog/merge_base.mjs",
		".storybook/catalog/TOKEN-MAP.md",
		".storybook/catalog/FINDINGS.md",
		".storybook/catalog/token_map.json",
		".storybook/catalog/ui-spec.json",
		"brand.pin.json",
		".brand-cache/unpacked/exifcleaner-brand/tokens.json",
		"docs/evidence/known-findings.json",
		"docs/evidence/colour-literals.json",
		"storybook-static/index.json",
		"package.json",
		"../.planning/phases/77-palette-and-tokens/77-CONTEXT.md",
		"../.planning/phases/77-palette-and-tokens/77-UI-SPEC.md",
	];
	return sourceSnapshot(root, paths);
}

function canonicalMeasurementDigest(measurement) {
	const copy = structuredClone(measurement);
	delete copy.sourceProof;
	return sha256(JSON.stringify(copy));
}

function validateMeasurementSourceDigests(root, reconciliation) {
	const problems = [];
	for (const [relativePath, expected] of Object.entries(
		reconciliation.sourceDigests ?? {},
	)) {
		if (!fs.existsSync(path.join(root, relativePath))) {
			problems.push(`source input is missing: ${relativePath}`);
			continue;
		}
		const actual = sha256(fs.readFileSync(path.join(root, relativePath)));
		if (actual !== expected)
			problems.push(`reconciliation source digest is stale: ${relativePath}`);
	}
	return problems;
}

function validateEmptyStateReplayReports(root, reconciliation) {
	const problems = [];
	for (const theme of THEMES) {
		const evidence = reconciliation.tokenMapGap?.storyReplay?.[theme];
		if (!evidence?.reportPath || !evidence?.reportSha256) {
			problems.push(`EmptyState ${theme} replay report metadata is missing`);
			continue;
		}
		const absolutePath = path.join(root, evidence.reportPath);
		if (!fs.existsSync(absolutePath)) {
			problems.push(`EmptyState ${theme} replay report is missing`);
			continue;
		}
		const bytes = fs.readFileSync(absolutePath);
		if (sha256(bytes) !== evidence.reportSha256) {
			problems.push(`EmptyState ${theme} replay report digest is stale`);
			continue;
		}
		const report = JSON.parse(bytes.toString("utf8"));
		if (
			report.success !== true ||
			report.numTotalTests !== 12 ||
			report.numPassedTests !== 12 ||
			report.numFailedTests !== 0 ||
			report.testResults?.length !== 1 ||
			report.testResults[0]?.status !== "passed"
		)
			problems.push(`EmptyState ${theme} replay is not the fresh 12/12 pass`);
	}
	return problems;
}

function validateReconciliationReportBinding(
	root,
	measurement,
	reconciliation,
) {
	const problems = [];
	const binding = measurement.registerReconciliation?.reconciliationReport;
	if (!binding || binding.path !== RECONCILIATION_PATH) {
		problems.push(
			"canonical measurement is not bound to the reconciliation report",
		);
		return problems;
	}
	const bytes = fs.readFileSync(path.join(root, RECONCILIATION_PATH));
	if (binding.sha256 !== sha256(bytes))
		problems.push("canonical reconciliation report digest is stale");
	const refreshes = reconciliation.task2SourceDigestRefresh ?? [];
	if (!Array.isArray(refreshes)) {
		problems.push("reconciliation source-digest refresh history is malformed");
		return problems;
	}
	for (const refresh of refreshes) {
		if (
			!refresh?.path ||
			!HASH.test(refresh.previousSha256 ?? "") ||
			!HASH.test(refresh.currentSha256 ?? "") ||
			!isRecord(reconciliation.sourceDigests) ||
			reconciliation.sourceDigests[refresh.path] !== refresh.currentSha256
		)
			problems.push(
				"reconciliation source-digest refresh history is inconsistent",
			);
	}
	return problems;
}

function resolvePrerequisites(root, measurement) {
	const workspace = path.resolve(root, "..");
	const evidencePath = path.join(
		workspace,
		".planning/phases/77-palette-and-tokens/77-EVIDENCE.json",
	);
	if (fs.existsSync(evidencePath)) {
		const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
		return evidence.prerequisites;
	}
	return measurement.prerequisites;
}

function literalProof(root, baseRef) {
	const baseline = readJson(root, "docs/evidence/colour-literals.json");
	const scan = scanColourLiterals({ root });
	const problems = ratchetProblems({ scan, baseline });
	let shrinkProblems = [];
	try {
		const { base } = readMergeBase("docs/evidence/colour-literals.json", {
			ref: baseRef,
			cwd: root,
		});
		if (base?.rows) {
			const entry = SHRINK_ONLY_REGISTRY.find(
				(candidate) => candidate.id === "GAT-03 baseline",
			);
			if (!entry)
				throw new Error("GAT-03 shrink-only registry entry is missing");
			shrinkProblems = shrinkOnlyProblems({
				entry,
				head: baseline,
				base,
			}).map((problem) => problem.message);
		}
	} catch (error) {
		shrinkProblems.push(String(error));
	}
	return {
		ok: problems.length === 0 && shrinkProblems.length === 0,
		problems,
		shrinkProblems,
		scan,
		baselineSha256: sha256(
			readText(root, "docs/evidence/colour-literals.json"),
		),
	};
}

function buildCanonicalMeasurement({
	root,
	measurement,
	reconciliation,
	records,
	axeReport,
	axeReportSha256,
	inputs,
	baseRef,
	v50Ref,
	prerequisites,
}) {
	const copy = structuredClone(measurement);
	copy.recordedAt = new Date().toISOString();
	copy.implementation.measurementHead = gitText(root, [
		"rev-parse",
		"HEAD",
	]).trim();
	copy.originalSet.count = 208;
	copy.originalSet.fingerprints =
		reconciliation.originalSet?.fingerprints ?? copy.originalSet.fingerprints;
	copy.clearedFingerprints = reconciliation.clearedFingerprints;
	copy.residualFingerprints = reconciliation.residualFingerprints;
	copy.remainingFingerprints = reconciliation.residualFingerprints;
	copy.axeColor = {
		...copy.axeColor,
		engine: "axe-core 4.14.0",
		browser: records.platform.browser.userAgent,
		platform: records.platform.browser.platform,
		baselineEnabled: true,
		stories: reconciliation.axeColor.candidateCount,
		storyFiles: reconciliation.axeColor.storyFiles,
		observations: axeReport.observations,
		freshReconciliationReport: {
			path: AXE_REPORT_PATH,
			sha256: axeReportSha256,
			head: axeReport.head,
			observations: axeReport.observations.length,
		},
	};
	copy.contrast = {
		...copy.contrast,
		ledger: reconciliation.contrast.ledger.map((entry) => {
			const old = copy.contrast.ledger.find(
				(candidate) => candidate.fingerprint === entry.fingerprint,
			);
			return {
				...old,
				disposition: "cleared",
				currentCounterparts: entry.currentCounterparts,
				evidenceType: entry.evidenceType,
				explanation: entry.explanation,
				currentSourceEvidence: entry.priorSourceEvidence,
			};
		}),
		currentStatic: {
			count: reconciliation.contrast.resultCount,
			passing: reconciliation.contrast.passing,
			unresolved: reconciliation.contrast.failed,
			results: reconciliation.contrast.results,
			proposedCount: reconciliation.indicatorColors?.proposedCount ?? 27,
			proposedPassing: reconciliation.indicatorColors?.proposedPassing ?? 27,
			indicatorGateSha256: records.indicatorsSha256,
		},
		residuals: [],
	};
	copy.platformColors = {
		sourceRecord: PLATFORM_RECORD_PATH,
		browser: records.platform.browser,
		approvedExpressions: records.platform.approvedExpressions,
		normalObservations: records.platform.normalObservations,
		forcedObservations: records.platform.forcedObservations,
		sourceDigests: records.platform.sourceDigests,
		sourceRecordSha256: records.platformSha256,
	};
	copy.indicatorColors = {
		sourceRecord: INDICATOR_RECORD_PATH,
		browser: records.indicators.browser,
		sourceProof: records.indicators.sourceProof,
		sourceDigests: records.indicators.sourceDigests,
		gates: records.indicators.gates,
		staticContrast: records.indicators.staticContrast,
		negativeControls: records.indicators.negativeControls,
		recordSha256: records.indicatorsSha256,
	};
	copy.forcedColors = {
		mediaActive: true,
		observations: records.platform.forcedObservations,
		sourceDigests: records.platform.sourceDigests,
		removalRestoration: records.platform.forcedRowRemovalRestoration,
	};
	copy.emptyStateTokenMapCorrection.storyReplay = {
		light: {
			stories: 12,
			passed: 12,
			failed: 0,
			violations: 0,
			project: "storybook-light",
			reportPath: "node_modules/.cache/palette77-emptystate-light-fresh.json",
			reportSha256: reconciliation.tokenMapGap.storyReplay.light.reportSha256,
		},
		dark: {
			stories: 12,
			passed: 12,
			failed: 0,
			violations: 0,
			project: "storybook-dark",
			reportPath: "node_modules/.cache/palette77-emptystate-dark-fresh.json",
			reportSha256: reconciliation.tokenMapGap.storyReplay.dark.reportSha256,
		},
	};
	copy.emptyStateTokenMapCorrection.findingRemoved = true;
	copy.spikeComparison = {
		spikeCleared: 67,
		denominator: 208,
		actualClearedAfterEvidence: 207,
		actualFloorPercent: 99,
		actualPercent: 99.52,
		cutDecisionPhase: 78,
		residualFingerprints: reconciliation.residualFingerprints,
	};
	copy.evidenceSourceDigestsAtCollection = inputs.digests;
	copy.registerReconciliation = {
		status: "proven-color-rows-removed-with-cross-platform-residual",
		removedFingerprintCount: reconciliation.removedFingerprints.length,
		removedColorFindingCount: 207,
		removedSeparateTokenMapGapCount: 1,
		removedFingerprints: reconciliation.removedFingerprints,
		remainingFindingEntryCount: reconciliation.currentRegister.entries,
		remainingColorFindingCount: 1,
		remainingColorFingerprints: reconciliation.residualFingerprints,
		remainingTokenMapGapFingerprints: readJson(
			root,
			"docs/evidence/known-findings.json",
		)
			.entries.filter((entry) => entry.kind === "token-map-gap")
			.map((entry) => entry.fingerprint),
		preservedNonColorFingerprints: readJson(
			root,
			"docs/evidence/known-findings.json",
		)
			.entries.filter(
				(entry) =>
					!entry.kind.startsWith("a11y-") && entry.kind !== "contrast-gap",
			)
			.map((entry) => entry.fingerprint),
		knownFindingsSha256After: sha256(
			readText(root, "docs/evidence/known-findings.json"),
		),
		reconciliationReport: {
			path: RECONCILIATION_PATH,
			sha256: sha256(fs.readFileSync(path.join(root, RECONCILIATION_PATH))),
			task2SourceDigestRefresh: reconciliation.task2SourceDigestRefresh ?? [],
		},
	};
	copy.postReconciliationSourceDigests = {
		"docs/evidence/known-findings.json": sha256(
			readText(root, "docs/evidence/known-findings.json"),
		),
		".storybook/catalog/token_map.json": sha256(
			readText(root, ".storybook/catalog/token_map.json"),
		),
		".storybook/catalog/FINDINGS.md": sha256(
			readText(root, ".storybook/catalog/FINDINGS.md"),
		),
		"tests/renderer/contrast/contrast_pairs.json": sha256(
			readText(root, "tests/renderer/contrast/contrast_pairs.json"),
		),
		"tests/renderer/contrast/contrast_model.mjs": sha256(
			readText(root, "tests/renderer/contrast/contrast_model.mjs"),
		),
		"src/renderer/styles/tokens.css": sha256(
			readText(root, "src/renderer/styles/tokens.css"),
		),
		"storybook-static/index.json": sha256(
			readText(root, "storybook-static/index.json"),
		),
	};
	copy.sourceProof = {
		status: "pending-final-literal-baseline",
		sealed: false,
		base: baseRef,
		v50Close: v50Ref,
		measurementDigest: "pending",
		inputs: inputs.inputs,
		invariants: [],
		prerequisites: prerequisites ?? [],
		pendingReason:
			"The final source literal baseline and complete workspace merge evidence are written in Phase 77 plan 05-03.",
	};
	copy.externalLockedSpecDigests = {
		".planning/phases/77-palette-and-tokens/77-CONTEXT.md":
			inputs.digests["../.planning/phases/77-palette-and-tokens/77-CONTEXT.md"],
		".planning/phases/77-palette-and-tokens/77-UI-SPEC.md":
			inputs.digests["../.planning/phases/77-palette-and-tokens/77-UI-SPEC.md"],
	};
	return copy;
}

function validateCompleteTree({
	root,
	measurement,
	reconciliation,
	records,
	baseRef,
	v50Ref,
	prerequisites,
	allowPendingPrerequisites = false,
}) {
	const problems = [];
	const pairDoc = readJson(root, "tests/renderer/contrast/contrast_pairs.json");
	const tokensCss = readText(root, "src/renderer/styles/tokens.css");
	const results = evaluate(pairDoc, tokensCss);
	problems.push(...pairsShapeProblems(pairDoc));
	problems.push(...g1Problems(tokensCss, pairDoc));
	const sheets = actualStylesheets(root);
	const tokenMap = readJson(root, ".storybook/catalog/token_map.json");
	const g2 = g2Report(sheets, pairDoc, tokensCss, tokenMap);
	problems.push(
		...g2.problems.map((problem) => `${problem.code}: ${problem.message}`),
	);
	if (g2.classified < 100 || g2.background < 25)
		problems.push("G2 anti-vacuity totals are below the established minimum");
	problems.push(
		...proposedConsistencyProblems(pairDoc, {
			uiSpec: readJson(root, ".storybook/catalog/ui-spec.json"),
			tokenMap,
			pin: readJson(root, "brand.pin.json").commit,
		}),
	);
	problems.push(...validatePlatformRecord(records.platform));
	const platformDigests = sourceSnapshot(root, PLATFORM_EVIDENCE_INPUTS);
	problems.push(
		...validateSourceDigestMap(
			records.platform,
			platformDigests.digests,
			PLATFORM_EVIDENCE_INPUTS,
		),
	);
	const allIndicatorPaths = Object.keys(records.indicators.sourceDigests ?? {});
	const current = sourceSnapshot(root, allIndicatorPaths);
	problems.push(
		...validateIndicatorRecord(records.indicators, current.digests),
	);
	problems.push(
		...validateSourcePolicies(
			root,
			pairDoc,
			results,
			records.platform,
			records.indicators,
		),
	);
	problems.push(
		...validateMeasurementAndReconciliation(
			root,
			measurement,
			reconciliation,
			results,
		),
	);
	problems.push(
		...validateAxeColorObservations({
			report: records.axeReport,
			reportSha256: records.axeReportSha256,
			reconciliation,
			originalFingerprints: measurement.originalSet?.fingerprints,
			canonicalObservations: measurement.axeColor?.observations,
		}),
	);
	problems.push(...validateEmptyStateReplayReports(root, reconciliation));
	problems.push(
		...validateReconciliationReportBinding(root, measurement, reconciliation),
	);
	problems.push(...validateMeasurementSourceDigests(root, reconciliation));
	const track = validateTrackedSource(root, measurement, {
		base: baseRef,
		v50: v50Ref,
	});
	problems.push(...track.problems);
	const protectedBlobs = validateProtectedBlobs(root, track.baseRef);
	problems.push(...protectedBlobs.problems);
	if (!(
		allowPendingPrerequisites &&
		(!Array.isArray(prerequisites) || prerequisites.length === 0)
	))
		problems.push(
			...validatePrerequisiteAncestry(
				root,
				prerequisites,
				measurement.implementation?.effectiveImplementationBase,
			),
		);
	return { problems, results, g2, current, track, protectedBlobs };
}

function parseArgs(argv) {
	const options = { mode: null, base: undefined, v50: undefined };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--write" || argument === "--check") {
			if (options.mode !== null)
				throw new Error("pass exactly one of --write or --check");
			options.mode = argument.slice(2);
		} else if (argument === "--base" || argument === "--v50") {
			const value = argv[index + 1];
			if (!value || value.startsWith("--"))
				throw new Error(`${argument} requires a git ref`);
			options[argument.slice(2)] = value;
			index += 1;
		} else throw new Error(`unknown argument: ${argument}`);
	}
	if (!options.mode) throw new Error("pass --write or --check");
	return options;
}

function liveEvidenceProjection(measurement) {
	return {
		platform: {
			browser: measurement.platformColors?.browser,
			approvedExpressions: measurement.platformColors?.approvedExpressions,
			normalObservations: measurement.platformColors?.normalObservations,
			forcedObservations: measurement.platformColors?.forcedObservations,
			sourceDigests: measurement.platformColors?.sourceDigests,
		},
		indicators: {
			browser: measurement.indicatorColors?.browser,
			sourceProof: measurement.indicatorColors?.sourceProof,
			sourceDigests: measurement.indicatorColors?.sourceDigests,
			gates: measurement.indicatorColors?.gates,
			staticContrast: measurement.indicatorColors?.staticContrast,
			negativeControls: measurement.indicatorColors?.negativeControls,
		},
	};
}

export function validateFinalLiteralBaseline(root, baseRef) {
	return literalProof(root, baseRef);
}

export function main(argv = process.argv.slice(2), dependencies = {}) {
	const root =
		dependencies.root ??
		path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	const runner = dependencies.runner ?? spawnSync;
	try {
		const options = parseArgs(argv);
		const initialMeasurement = readJson(root, MEASUREMENT_PATH);
		const reconciliation = readJson(root, RECONCILIATION_PATH);
		const baseRef =
			options.base ??
			initialMeasurement.implementation?.effectiveImplementationBase;
		const v50Ref = options.v50 ?? initialMeasurement.implementation?.v50Close;
		if (!baseRef || !v50Ref)
			throw new Error(
				"the implementation base and v5.0 close must be recorded",
			);
		const records = collectBrowserRecords({
			root,
			runner,
			fsApi: dependencies.fsApi ?? fs,
			now: dependencies.now ?? Date.now,
		});
		const axeReportBytes = fs.readFileSync(path.join(root, AXE_REPORT_PATH));
		const axeReport = JSON.parse(axeReportBytes.toString("utf8"));
		records.axeReport = axeReport;
		records.axeReportSha256 = sha256(axeReportBytes);
		const inputs = currentMeasurementInputs(root, reconciliation);
		const prerequisites = resolvePrerequisites(root, initialMeasurement);
		const freshMeasurement = buildCanonicalMeasurement({
			root,
			measurement: initialMeasurement,
			reconciliation,
			records,
			axeReport,
			axeReportSha256: records.axeReportSha256,
			inputs,
			baseRef,
			v50Ref,
			prerequisites,
		});
		const validation = validateCompleteTree({
			root,
			measurement: freshMeasurement,
			reconciliation,
			records,
			baseRef,
			v50Ref,
			prerequisites,
			allowPendingPrerequisites: options.mode === "write",
		});
		if (validation.problems.length)
			throw new Error(
				validation.problems
					.map((problem) => {
						if (typeof problem === "string") return problem;
						return `${problem?.code ?? "validation"}: ${problem?.message ?? JSON.stringify(problem)}`;
					})
					.join("\n"),
			);
		const literal = literalProof(root, baseRef);
		if (options.mode === "check") {
			validateSealedSourceProof(initialMeasurement.sourceProof);
			if (
				JSON.stringify(liveEvidenceProjection(initialMeasurement)) !==
				JSON.stringify(liveEvidenceProjection(freshMeasurement))
			)
				throw new Error(
					"fresh browser observations differ from the sealed measurement",
				);
			if (!literal.ok)
				throw new Error(
					`final literal baseline is stale: ${[...literal.problems, ...literal.shrinkProblems].join("; ")}`,
				);
			const expectedMeasurementDigest =
				canonicalMeasurementDigest(initialMeasurement);
			if (
				initialMeasurement.sourceProof.measurementDigest !==
				expectedMeasurementDigest
			)
				throw new Error(
					"canonical measurement digest changed after sourceProof was sealed",
				);
			if (
				initialMeasurement.sourceProof.literalBaselineSha256 !==
				literal.baselineSha256
			)
				throw new Error("final literal baseline digest is stale");
			if (
				JSON.stringify(initialMeasurement.sourceProof.inputs) !==
				JSON.stringify(inputs.inputs)
			)
				throw new Error(
					"canonical sourceProof inputs differ from current reconciliation inputs",
				);
			console.log(
				"✓ PHASE 77 SOURCE PROOF CHECKED — fresh browser evidence and canonical source hashes match",
			);
			return 0;
		}
		const fullEvidencePresent =
			Array.isArray(prerequisites) &&
			validatePrerequisites(prerequisites).length === 0;
		if (!literal.ok || !fullEvidencePresent) {
			freshMeasurement.sourceProof.pendingReason = !literal.ok
				? "The final source literal baseline is not yet current."
				: "The final workspace evidence for all thirteen prerequisite merges is not yet complete.";
			fs.writeFileSync(
				path.join(root, MEASUREMENT_PATH),
				`${JSON.stringify(freshMeasurement, null, 2)}\n`,
			);
			console.log(
				"Phase 77 canonical measurement refreshed; sourceProof remains pending and does not pass the final gate.",
			);
			return 0;
		}
		const invariants = [
			"original-color-fingerprints-and-exact-residuals",
			"source-backed-100-row-contrast-matrix-and-g1-g2",
			"actual-source-axe-color-observations-in-both-themes",
			"fresh-system-mix-platform-observations-and-exact-white-thumb",
			"fresh-segmented-focus-and-drop-indicator-observations",
			"forced-colors-removal-and-restoration-controls",
			"brand-token-and-accent-site-ownership",
			"protected-prerequisite-blobs-and-merge-ancestry",
			"literal-baseline-and-shrink-only-ratchet",
		].map((name) => ({ name, passed: true }));
		freshMeasurement.sourceProof = {
			status: "passed",
			sealed: true,
			base: baseRef,
			v50Close: v50Ref,
			measurementDigest: canonicalMeasurementDigest(freshMeasurement),
			literalBaselineSha256: literal.baselineSha256,
			inputs: inputs.inputs,
			prerequisites,
			protectedBlobs: validation.protectedBlobs,
			invariants,
		};
		validateSealedSourceProof(freshMeasurement.sourceProof);
		fs.writeFileSync(
			path.join(root, MEASUREMENT_PATH),
			`${JSON.stringify(freshMeasurement, null, 2)}\n`,
		);
		console.log(
			"✓ PHASE 77 SOURCE PROOF WRITTEN — canonical measurement is sealed for the current source tree",
		);
		return 0;
	} catch (error) {
		console.error(
			`✗ PHASE 77 SOURCE PROOF FAILED — ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	process.exitCode = main();
}
