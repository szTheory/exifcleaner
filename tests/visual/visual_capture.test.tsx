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
type VisualCommands = {
	visualEnv: (
		browser: string,
		deviceScaleFactor: number,
	) => Promise<VisualEnvironment>;
	visualWritePng: (name: string, base64: string) => Promise<PngInfo>;
	visualWriteManifest: (manifest: unknown) => Promise<void>;
};

const node = commands as unknown as VisualCommands;
// Phase 76 measured the Vitest tester iframe at a stable 0.9 screenshot scale in
// both the macOS host and the digest-pinned Linux container.
const SCREENSHOT_SCALE = 0.9;
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

	for (const item of contract.cases) {
		const mounted = await mount(item);
		try {
			const capture = await stableScreenshot(mounted.frame);
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
});
