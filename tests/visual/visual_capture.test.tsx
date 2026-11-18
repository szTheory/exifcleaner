import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { expect, test } from "vitest";
import { commands, page } from "vitest/browser";
import preview from "../../.storybook/preview";
import contract from "../../.storybook/visual-baselines.json";
import * as appStories from "../../src/renderer/components/screens/App.stories";

setProjectAnnotations([preview]);

type VisualCase = (typeof contract.cases)[number];
type VisualEnvironment = {
	commit: string;
	ref: string;
	runId: string;
	runAttempt: string;
	image: string;
	runner: string;
	architecture: string;
	platform: string;
	node: string;
	browser: string;
	deviceScaleFactor: number;
	capturedAt: string;
};
type PngInfo = { sha256: string; width: number; height: number; bytes: number };
type BaselineInfo = { sha256: string; base64: string };
type PixelDiff = {
	width: number;
	height: number;
	sameSize: boolean;
	exactPixels: number;
	vitestPixels: number;
};
type VisualCommands = {
	visualEnv: (
		browser: string,
		deviceScaleFactor: number,
	) => Promise<VisualEnvironment>;
	visualWritePng: (name: string, base64: string) => Promise<PngInfo>;
	visualWriteManifest: (manifest: unknown) => Promise<void>;
	visualReadBaseline: (name: string) => Promise<BaselineInfo>;
};

const node = commands as unknown as VisualCommands;
// Phase 76 measured the Vitest tester iframe at a stable 0.9 screenshot scale in
// both the macOS host and the digest-pinned Linux container.
const SCREENSHOT_SCALE = 0.9;
const PINNED_IMAGE =
	"mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f";
const stories = composeStories(appStories);
const germanEmpty = composeStories({
	default: appStories.default,
	Empty: { ...appStories.Empty, play: undefined },
}).Empty;
const STORY_EXPORTS = {
	"screens-app--empty": stories.Empty,
	"screens-app--mid-batch": stories.MidBatch,
	"screens-app--all-done": stories.AllDone,
	"screens-app--large-batch": stories.LargeBatch,
	"screens-app--all-error": stories.AllError,
	"screens-app--empty-copy-mode": stories.EmptyCopyMode,
	"screens-app--drawer-open": stories.DrawerOpen,
	"screens-app--error-boundary-failure": stories.ErrorBoundaryFailure,
} as const;

type Mounted = {
	host: HTMLElement;
	style: HTMLStyleElement;
	frame: HTMLElement;
};

async function mount(item: VisualCase): Promise<Mounted> {
	const story =
		item.locale === "de"
			? germanEmpty
			: STORY_EXPORTS[item.story as keyof typeof STORY_EXPORTS];
	if (story === undefined)
		throw new Error(`unknown Storybook case ${item.story}`);
	if (story.id !== item.story) {
		throw new Error(
			`case ${item.story} resolved to unexpected story ${story.id}`,
		);
	}

	const host = document.createElement("div");
	host.id = "visual-host";
	document.body.appendChild(host);
	const style = document.createElement("style");
	style.textContent = `#visual-host > div { width: ${item.width}px !important; }`;
	document.head.appendChild(style);
	await story.run({
		canvasElement: host,
		globals: { ...story.globals, theme: item.theme, locale: item.locale },
	});
	await expect
		.poll(() => document.documentElement.getAttribute("data-theme"))
		.toBe(item.theme);
	await expect
		.poll(() => document.documentElement.getAttribute("lang"))
		.toBe(item.locale);
	if (item.locale === "de") {
		expect(host.querySelector("h1")?.textContent).toBe(
			"Dateien zum Bereinigen hinzufügen",
		);
	}

	const frame = host.firstElementChild;
	if (!(frame instanceof HTMLElement)) {
		host.remove();
		style.remove();
		throw new Error(`${item.story}: Storybook did not render a frame`);
	}
	expect(frame.getBoundingClientRect().width).toBe(item.width);
	return { host, style, frame };
}

function unmount(mounted: Mounted): void {
	mounted.host.remove();
	mounted.style.remove();
}

function frames(): Promise<void> {
	return new Promise((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
	);
}

async function screenshot(element: Element): Promise<string> {
	const result = await page.screenshot({ element, save: false });
	return typeof result === "string" ? result : result.base64;
}

async function stableScreenshot(
	element: Element,
): Promise<{ base64: string; attempts: number; stable: boolean }> {
	await document.fonts.ready;
	for (let i = 0; i < 100 && document.getAnimations().length > 0; i += 1) {
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	if (document.getAnimations().length > 0) {
		throw new Error("capture still has active animations after the wait limit");
	}
	await frames();
	let previous = await screenshot(element);
	for (let attempt = 2; attempt <= 9; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, 100));
		const current = await screenshot(element);
		if (current === previous) {
			return { base64: current, attempts: attempt, stable: true };
		}
		previous = current;
	}
	return { base64: previous, attempts: 9, stable: false };
}

async function decodePng(base64: string): Promise<ImageData> {
	const image = new Image();
	image.src = "data:image/png;base64," + base64;
	await image.decode();
	const canvas = document.createElement("canvas");
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (context === null) throw new Error("no 2d context");
	context.drawImage(image, 0, 0);
	return context.getImageData(0, 0, canvas.width, canvas.height);
}

function yiqDelta(
	a: Uint8ClampedArray,
	b: Uint8ClampedArray,
	index: number,
): number {
	const dr = (a[index] ?? 0) - (b[index] ?? 0);
	const dg = (a[index + 1] ?? 0) - (b[index + 1] ?? 0);
	const db = (a[index + 2] ?? 0) - (b[index + 2] ?? 0);
	const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
	const i = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
	const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
	return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
}

async function comparePng(
	aBase64: string,
	bBase64: string,
): Promise<PixelDiff> {
	const [a, b] = await Promise.all([decodePng(aBase64), decodePng(bBase64)]);
	if (a.width !== b.width || a.height !== b.height) {
		return {
			width: a.width,
			height: a.height,
			sameSize: false,
			exactPixels: Math.max(a.width * a.height, b.width * b.height),
			vitestPixels: Math.max(a.width * a.height, b.width * b.height),
		};
	}
	const threshold = 35215 * 0.1 * 0.1;
	let exactPixels = 0;
	let vitestPixels = 0;
	for (let index = 0; index < a.data.length; index += 4) {
		const differs =
			a.data[index] !== b.data[index] ||
			a.data[index + 1] !== b.data[index + 1] ||
			a.data[index + 2] !== b.data[index + 2] ||
			a.data[index + 3] !== b.data[index + 3];
		if (!differs) continue;
		exactPixels += 1;
		if (yiqDelta(a.data, b.data, index) > threshold) vitestPixels += 1;
	}
	return {
		width: a.width,
		height: a.height,
		sameSize: true,
		exactPixels,
		vitestPixels,
	};
}

function solidPng(color: string): string {
	const canvas = document.createElement("canvas");
	canvas.width = 4;
	canvas.height = 4;
	const context = canvas.getContext("2d");
	if (context === null) throw new Error("no 2d context");
	context.fillStyle = color;
	context.fillRect(0, 0, canvas.width, canvas.height);
	return canvas.toDataURL("image/png").slice("data:image/png;base64,".length);
}

function paddingPng(offset: number): string {
	const canvas = document.createElement("canvas");
	canvas.width = 32;
	canvas.height = 32;
	const context = canvas.getContext("2d");
	if (context === null) throw new Error("no 2d context");
	context.fillStyle = "white";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.fillStyle = "black";
	context.fillRect(4 + offset, 8, 12, 12);
	return canvas.toDataURL("image/png").slice("data:image/png;base64,".length);
}

test("pixel comparator accepts unchanged and one-hex-step images, rejects padding drift", async () => {
	const unchanged = solidPng("#808080");
	const same = await comparePng(unchanged, unchanged);
	expect(same.sameSize).toBe(true);
	expect(same.exactPixels).toBe(0);
	expect(same.vitestPixels).toBe(0);

	const oneHexStep = await comparePng(solidPng("#808080"), solidPng("#818080"));
	expect(oneHexStep.exactPixels).toBeGreaterThan(0);
	expect(oneHexStep.vitestPixels).toBe(0);

	const paddingPlant = await comparePng(paddingPng(0), paddingPng(1));
	expect(paddingPlant.sameSize).toBe(true);
	expect(paddingPlant.vitestPixels).toBeGreaterThan(0);
});

test("captures the exact declared Storybook image set", async () => {
	expect(contract.schemaVersion).toBe(1);
	expect(contract.maxImages).toBeLessThanOrEqual(40);
	expect(contract.cases).toHaveLength(25);
	const environment = await node.visualEnv(
		navigator.userAgent,
		window.devicePixelRatio,
	);
	const captures: Array<
		VisualCase &
			Pick<PngInfo, "sha256" | "bytes"> & {
				pixelWidth: number;
				pixelHeight: number;
				attempts: number;
				stable: boolean;
			}
	> = [];
	const capturedBase64 = new Map<string, string>();

	for (const item of contract.cases) {
		const mounted = await mount(item);
		try {
			const capture = await stableScreenshot(mounted.frame);
			capturedBase64.set(item.file, capture.base64);
			const png = await node.visualWritePng(item.file, capture.base64);
			expect(capture.stable, `${item.file} did not stabilize`).toBe(true);
			expect(png.width, `${item.file} pixel width`).toBe(
				Math.round(item.width * SCREENSHOT_SCALE),
			);
			expect(png.height, `${item.file} pixel height`).toBe(
				Math.round(item.height * SCREENSHOT_SCALE),
			);
			captures.push({
				...item,
				sha256: png.sha256,
				bytes: png.bytes,
				pixelWidth: png.width,
				pixelHeight: png.height,
				attempts: capture.attempts,
				stable: capture.stable,
			});
		} finally {
			unmount(mounted);
		}
	}

	expect(captures).toHaveLength(contract.cases.length);
	await node.visualWriteManifest({
		schemaVersion: 1,
		...environment,
		viewport: {
			width: 1280,
			height: 800,
			captureScale: SCREENSHOT_SCALE,
		},
		cases: captures,
	});

	if (environment.image !== PINNED_IMAGE) {
		console.warn(
			"Skipping baseline comparison outside the digest-pinned Playwright image",
		);
		return;
	}

	const mismatches: string[] = [];
	for (const item of contract.cases) {
		const captured = capturedBase64.get(item.file);
		if (captured === undefined) {
			mismatches.push(item.file + ": capture missing from comparison set");
			continue;
		}
		const baseline = await node.visualReadBaseline(item.file);
		expect(baseline.sha256).toBe(contract.baselines[item.file]?.sha256);
		const diff = await comparePng(baseline.base64, captured);
		if (!diff.sameSize || diff.vitestPixels !== 0) {
			mismatches.push(
				item.file +
					": " +
					diff.vitestPixels +
					" perceptual mismatched pixels (" +
					diff.exactPixels +
					" exact)",
			);
		}
	}
	expect(mismatches).toEqual([]);
});
