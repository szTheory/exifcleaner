import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { describe, expect, test } from "vitest";
import { commands, page } from "vitest/browser";
import preview from "../.storybook/preview";
import * as appStories from "../src/renderer/components/screens/App.stories";

// PLN-01 spike (76-01), capture half. Throwaway: lives on spike/76-pln-01 only.
// Renders the real Screens/App stories through composeStory with the Storybook preview
// annotations (the same route .storybook/a11y_p72_recheck.test.tsx takes), waits for fonts,
// zero running animations and two byte-equal element screenshots (D-24), then writes the
// PNG, a manifest row and a glyph-coverage row per capture. Two plants (a 1 px padding
// shift and a one-hex-step colour change) are captured in the same job as their control.
setProjectAnnotations([preview]);

type Theme = "light" | "dark";
type Width = 580 | 960;

// Node-side commands from vitest.spike.config.ts.
type SpikeCommands = {
	spikeEnv: () => Promise<{
		commit: string;
		image: string;
		cpu: string;
		lane: string;
		runnerImage: string;
		runnerVersion: string;
		arch: string;
	}>;
	spikeWritePng: (name: string, base64: string) => Promise<string>;
	spikeWriteJson: (name: string, value: unknown) => Promise<void>;
	spikeManifestAppend: (row: Record<string, unknown>, name?: string) => Promise<number>;
};
const node = commands as unknown as SpikeCommands;

const SCREEN_STORIES = [
	"Empty",
	"MidBatch",
	"AllDone",
	"LargeBatch",
	"AllError",
	"EmptyCopyMode",
	"DrawerOpen",
	"ErrorBoundaryFailure",
] as const;
type ScreenStory = (typeof SCREEN_STORIES)[number];
const AT_960: readonly ScreenStory[] = [
	"Empty",
	"MidBatch",
	"AllDone",
	"LargeBatch",
];
const THEMES: readonly Theme[] = ["light", "dark"];

type Case = { name: ScreenStory; theme: Theme; width: Width };
const CASES: Case[] = [
	...SCREEN_STORIES.flatMap((name) =>
		THEMES.map((theme): Case => ({ name, theme, width: 580 })),
	),
	...AT_960.flatMap((name) =>
		THEMES.map((theme): Case => ({ name, theme, width: 960 })),
	),
];

const STORIES = composeStories(appStories);

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function frames(): Promise<void> {
	return new Promise((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
	);
}

async function shot(element: Element): Promise<string> {
	const result = await page.screenshot({ element, save: false });
	return typeof result === "string" ? result : result.base64;
}

// D-24: fonts ready, no running animation, two consecutive identical frames.
async function stableShot(
	element: Element,
): Promise<{ base64: string; attempts: number; stable: boolean }> {
	await document.fonts.ready;
	for (let i = 0; i < 100 && document.getAnimations().length > 0; i += 1) {
		await sleep(50);
	}
	await frames();
	let previous = await shot(element);
	for (let attempt = 2; attempt <= 9; attempt += 1) {
		await sleep(100);
		const next = await shot(element);
		if (next === previous) return { base64: next, attempts: attempt, stable: true };
		previous = next;
	}
	return { base64: previous, attempts: 9, stable: false };
}

type Mounted = { host: HTMLElement; frame: HTMLElement; style: HTMLStyleElement };

// The status bar's elapsed-seconds segment keeps ticking in a story whose last file never
// settles (MidBatch, LargeBatch), so two otherwise identical captures taken a second apart
// differ by a few digits. The primary 24 captures are left as the story leaves them and the
// segment text is recorded; the masked variant and the plants hide the segment (keeping its
// width) so what they compare is the renderer, not the clock.
const CLOCK = '[data-stat="elapsed"]';

function elapsedText(frame: HTMLElement): string | null {
	return frame.querySelector(CLOCK)?.textContent ?? null;
}

function maskClock(frame: HTMLElement): void {
	for (const element of frame.querySelectorAll<HTMLElement>(CLOCK)) {
		element.style.setProperty("display", "inline-block", "important");
		element.style.setProperty("min-width", "12ch", "important");
		element.style.setProperty("visibility", "hidden", "important");
	}
}

const TICKING: readonly ScreenStory[] = ["MidBatch", "LargeBatch"];

// Runs one App story in `theme` and sizes the WindowFrame to `width`. The 960 px frame is
// applied at run time by a stylesheet override (never by editing App.stories.tsx: the base
// gate admits only spike/ and the spike workflow).
async function mount({ name, theme, width }: Case): Promise<Mounted> {
	const story = STORIES[name];
	const host = document.createElement("div");
	host.id = "spike-host";
	document.body.appendChild(host);
	const style = document.createElement("style");
	style.textContent = `#spike-host > div { width: ${width}px !important; }`;
	document.head.appendChild(style);
	await story.run({
		canvasElement: host,
		globals: { ...story.globals, theme },
	});
	await expect
		.poll(() => document.documentElement.getAttribute("data-theme"))
		.toBe(theme);
	const frame = host.firstElementChild;
	if (!(frame instanceof HTMLElement)) throw new Error(`${name}: no frame element`);
	return { host, frame, style };
}

function unmount({ host, style }: Mounted): void {
	host.remove();
	style.remove();
}

// --- pixel comparison, in the browser (no ImageMagick, no dependency) -----------------

async function decode(base64: string): Promise<ImageData> {
	const image = new Image();
	image.src = `data:image/png;base64,${base64}`;
	await image.decode();
	const canvas = document.createElement("canvas");
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (context === null) throw new Error("no 2d context");
	context.drawImage(image, 0, 0);
	return context.getImageData(0, 0, canvas.width, canvas.height);
}

// pixelmatch's perceptual metric (YIQ delta against 35215 * threshold^2) without its
// anti-aliasing exclusion: the comparator Vitest's toMatchScreenshot uses by default has
// threshold 0.1 and zero allowed mismatched pixels, so this is the VIS-01 rule, modelled.
const PIXELMATCH_THRESHOLD = 0.1;

function yiqDelta(a: Uint8ClampedArray, b: Uint8ClampedArray, i: number): number {
	const dr = (a[i] ?? 0) - (b[i] ?? 0);
	const dg = (a[i + 1] ?? 0) - (b[i + 1] ?? 0);
	const db = (a[i + 2] ?? 0) - (b[i + 2] ?? 0);
	const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
	const iq = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
	const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
	return 0.5053 * y * y + 0.299 * iq * iq + 0.1957 * q * q;
}

type Diff = {
	width: number;
	height: number;
	sameSize: boolean;
	exactPixels: number;
	exactRatio: number;
	vitestPixels: number;
	vitestRatio: number;
};

async function diffRatio(aBase64: string, bBase64: string): Promise<Diff> {
	const [a, b] = await Promise.all([decode(aBase64), decode(bBase64)]);
	if (a.width !== b.width || a.height !== b.height) {
		const total = Math.max(a.width * a.height, b.width * b.height);
		return {
			width: a.width,
			height: a.height,
			sameSize: false,
			exactPixels: total,
			exactRatio: 1,
			vitestPixels: total,
			vitestRatio: 1,
		};
	}
	const total = a.width * a.height;
	const maxDelta = 35215 * PIXELMATCH_THRESHOLD * PIXELMATCH_THRESHOLD;
	let exact = 0;
	let vitest = 0;
	for (let i = 0; i < a.data.length; i += 4) {
		if (
			a.data[i] !== b.data[i] ||
			a.data[i + 1] !== b.data[i + 1] ||
			a.data[i + 2] !== b.data[i + 2] ||
			a.data[i + 3] !== b.data[i + 3]
		) {
			exact += 1;
			if (yiqDelta(a.data, b.data, i) > maxDelta) vitest += 1;
		}
	}
	return {
		width: a.width,
		height: a.height,
		sameSize: true,
		exactPixels: exact,
		exactRatio: exact / total,
		vitestPixels: vitest,
		vitestRatio: vitest / total,
	};
}

// --- glyph coverage (D-24): characters drawn with the missing-glyph box ---------------

function hashPixels(data: Uint8ClampedArray): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < data.length; i += 1) {
		h ^= data[i] ?? 0;
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16);
}

function drawHash(character: string, font: string): { hash: string; blank: boolean } {
	const canvas = document.createElement("canvas");
	canvas.width = 48;
	canvas.height = 48;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (context === null) throw new Error("no 2d context");
	context.font = `32px ${font}`;
	context.textBaseline = "top";
	context.fillStyle = "#000";
	context.fillText(character, 4, 4);
	const { data } = context.getImageData(0, 0, 48, 48);
	let blank = true;
	for (let i = 3; i < data.length; i += 4) {
		if ((data[i] ?? 0) !== 0) {
			blank = false;
			break;
		}
	}
	return { hash: hashPixels(data), blank };
}

type TofuRow = {
	story: string;
	theme: Theme;
	width: Width;
	font: string;
	fonts: string[];
	chars: number;
	refBlankFonts: string[];
	tofu: string[];
};

// An unassigned code point (U+10FFFF) drawn in the same font is the missing-glyph
// reference; a character with an equal pixel hash is rendered with that box.
function tofuRow(frame: HTMLElement, base: Omit<Case, "name"> & { story: string }): TofuRow {
	const byFont = new Map<string, Set<string>>();
	const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
		const parent = node.parentElement;
		if (parent === null || parent.closest("style, script") !== null) continue;
		if (parent.getClientRects().length === 0) continue;
		const font = getComputedStyle(parent).fontFamily;
		const set = byFont.get(font) ?? new Set<string>();
		for (const character of (node as Text).data) {
			if (!/^[\s\p{C}]$/u.test(character)) set.add(character);
		}
		byFont.set(font, set);
	}
	const tofu = new Set<string>();
	const refBlankFonts: string[] = [];
	let chars = 0;
	for (const [font, set] of byFont) {
		const reference = drawHash(String.fromCodePoint(0x10ffff), font);
		if (reference.blank) refBlankFonts.push(font);
		for (const character of set) {
			chars += 1;
			if (reference.blank) continue;
			if (drawHash(character, font).hash === reference.hash) {
				const code = character.codePointAt(0) ?? 0;
				tofu.add(`U+${code.toString(16).toUpperCase().padStart(4, "0")}`);
			}
		}
	}
	const fonts = [...byFont.keys()];
	return {
		story: base.story,
		theme: base.theme,
		width: base.width,
		font: fonts[0] ?? "",
		fonts,
		chars,
		refBlankFonts,
		tofu: [...tofu].sort(),
	};
}

const tofuRows: TofuRow[] = [];

async function recordTofu(row: TofuRow): Promise<void> {
	tofuRows.push(row);
	const total = tofuRows.reduce((sum, item) => sum + item.tofu.length, 0);
	await node.spikeWriteJson("tofu.json", { total, rows: tofuRows });
}

describe("glyph-coverage probe controls (D-24: the probe must be able to go red)", () => {
	test("an unassigned code point reads as tofu, a letter does not, and the reference is not blank", () => {
		const font = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
		const reference = drawHash(String.fromCodePoint(0x10ffff), font);
		const otherUnassigned = drawHash(String.fromCodePoint(0x10fffe), font);
		const letter = drawHash("A", font);
		expect(reference.blank).toBe(false);
		expect(otherUnassigned.hash).toBe(reference.hash);
		expect(letter.hash).not.toBe(reference.hash);
	});
});

describe("PLN-01 capture: 24 images", () => {
	for (const item of CASES) {
		test(`${item.name} ${item.theme} ${item.width}`, async () => {
			const env = await node.spikeEnv();
			const mounted = await mount(item);
			try {
				const story = STORIES[item.name];
				const elapsedBefore = elapsedText(mounted.frame);
				const { base64, attempts, stable } = await stableShot(mounted.frame);
				const elapsedAfter = elapsedText(mounted.frame);
				const file = `${story.id}.${item.theme}.${item.width}.png`;
				const sha256 = await node.spikeWritePng(file, base64);
				await node.spikeManifestAppend({
					story: story.id,
					theme: item.theme,
					width: item.width,
					sha256,
					commit: env.commit,
					image: env.image,
					cpu: env.cpu,
					lane: env.lane,
					runnerImage: env.runnerImage,
					file,
					attempts,
					stable,
					elapsedBefore,
					elapsedAfter,
				});
				// Clock-masked variant of the two stories whose footer clock keeps running.
				if (TICKING.includes(item.name) && elapsedBefore !== null) {
					maskClock(mounted.frame);
					const masked = await stableShot(mounted.frame);
					const maskedFile = `masked.${file}`;
					const maskedSha = await node.spikeWritePng(maskedFile, masked.base64);
					await node.spikeManifestAppend(
						{
							story: story.id,
							theme: item.theme,
							width: item.width,
							sha256: maskedSha,
							commit: env.commit,
							image: env.image,
							cpu: env.cpu,
							lane: env.lane,
							file: maskedFile,
							attempts: masked.attempts,
							stable: masked.stable,
						},
						"manifest-masked.json",
					);
				}
				await recordTofu(
					tofuRow(mounted.frame, {
						story: story.id,
						theme: item.theme,
						width: item.width,
					}),
				);
				expect(stable, `${file} never produced two identical frames`).toBe(true);
			} finally {
				unmount(mounted);
			}
		});
	}
});

describe("PLN-01 plants (D-24: MidBatch, against the same job's control)", () => {
	test("a 1 px padding change and a one-hex-step colour change against MidBatch light 580", async () => {
		const env = await node.spikeEnv();
		const mounted = await mount({ name: "MidBatch", theme: "light", width: 580 });
		try {
			// The footer clock keeps ticking in MidBatch: hide it so the control, the repeat and
			// both plants differ only by what each plant changes.
			maskClock(mounted.frame);
			const control = await stableShot(mounted.frame);
			const controlSha = await node.spikeWritePng(
				"plant-control.png",
				control.base64,
			);
			const repeat = await stableShot(mounted.frame);
			const controlRepeat = await diffRatio(control.base64, repeat.base64);

			// Plant 1: +1 px of left padding on every `.file-table__row` (min-height 44 px
			// absorbs a vertical change, so the shift is horizontal: each cell moves 1 px).
			const rows = Array.from(
				mounted.frame.querySelectorAll<HTMLElement>(".file-table__row"),
			);
			expect(rows.length).toBeGreaterThan(0);
			const before = rows.map((row) => row.style.paddingLeft);
			for (const row of rows) {
				const current = Number.parseFloat(getComputedStyle(row).paddingLeft);
				row.style.setProperty("padding-left", `${current + 1}px`, "important");
			}
			const padded = await stableShot(mounted.frame);
			const paddingSha = await node.spikeWritePng("plant-padding.png", padded.base64);
			const padding = await diffRatio(control.base64, padded.base64);
			rows.forEach((row, index) => {
				row.style.paddingLeft = before[index] ?? "";
			});

			// Plant 2: `--ec-color-bg` one hex step (#f5f6f8 -> #f5f6f9).
			const root = document.documentElement;
			const original = getComputedStyle(root).getPropertyValue("--ec-color-bg").trim();
			expect(original.toLowerCase()).toBe("#f5f6f8");
			root.style.setProperty("--ec-color-bg", "#f5f6f9");
			const hexed = await stableShot(mounted.frame);
			const hexSha = await node.spikeWritePng("plant-one-hex.png", hexed.base64);
			const oneHex = await diffRatio(control.base64, hexed.base64);
			root.style.removeProperty("--ec-color-bg");

			const restored = await stableShot(mounted.frame);
			const restoredDiff = await diffRatio(control.base64, restored.base64);

			await node.spikeWriteJson("plants.json", {
				story: "screens-app--mid-batch",
				theme: "light",
				width: 580,
				lane: env.lane,
				comparator: {
					strict: "any differing channel counts (byte equality of the decoded pixels)",
					vitest: `pixelmatch YIQ delta > 35215 x ${PIXELMATCH_THRESHOLD}^2, zero allowed mismatched pixels, anti-aliasing exclusion not modelled`,
				},
				control: { sha256: controlSha, attempts: control.attempts, stable: control.stable },
				control_repeat: controlRepeat,
				padding: { sha256: paddingSha, ...padding, stable: padded.stable },
				one_hex: { sha256: hexSha, ...oneHex, stable: hexed.stable, from: "#f5f6f8", to: "#f5f6f9" },
				restored: restoredDiff,
				padding_red_strict: padding.exactPixels > 0,
				padding_red_vitest: padding.vitestPixels > 0,
				one_hex_red_strict: oneHex.exactPixels > 0,
				one_hex_red_vitest: oneHex.vitestPixels > 0,
			});
			// The control must be clean before a plant can mean anything.
			expect(controlRepeat.exactPixels).toBe(0);
		} finally {
			unmount(mounted);
		}
	});
});
