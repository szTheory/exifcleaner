import {
	composeStories,
	composeStory,
	setProjectAnnotations,
} from "@storybook/react-vite";
import * as a11yAnnotations from "@storybook/addon-a11y/preview";
import { afterAll, afterEach, expect, test } from "vitest";
import * as appStories from "../src/renderer/components/screens/App.stories";
import * as settingsStories from "../src/renderer/components/settings/SettingsDrawer.stories";
import * as dropZoneStories from "../src/renderer/components/ui/DropZone.stories";
import * as emptyStateStories from "../src/renderer/components/ui/EmptyState.stories";
import * as errorBoundaryStories from "../src/renderer/components/ui/ErrorBoundary.stories";
import * as statusBarStories from "../src/renderer/components/ui/StatusBar.stories";
import * as toastStories from "../src/renderer/components/ui/Toast.stories";
import {
	contrastRatio,
	parseColour,
} from "../tests/renderer/contrast/wcag.mjs";
import preview from "./preview";
import pendingData from "./phase79_pending.json";

setProjectAnnotations([a11yAnnotations, preview]);

const { MidBatch, AllDone } = composeStories(appStories);
const { DragOver } = composeStories(dropZoneStories);
const { LongMessage: ToastLongMessage } = composeStories(toastStories);
const { TurkishLongStatus } = composeStories(statusBarStories);
const { FallbackLongMessage } = composeStories(errorBoundaryStories);
const FrenchSettings = composeStory(
	{ ...settingsStories.AllTogglesOn, play: async () => {} },
	settingsStories.default,
);
const EmptyStateWithSymbol = composeStory(
	{ ...emptyStateStories.CopyModeOn, play: async () => {} },
	emptyStateStories.default,
);

type Theme = "light" | "dark";
type Observation = {
	case: string;
	story: string;
	selector: string;
	theme: Theme;
	locale: string;
	platform: string;
	actual: string;
	expected: string;
};
type PendingObservation = Observation & { reason: string };
type RunnableStory = {
	run: (context: {
		canvasElement: HTMLElement;
		globals: Record<string, unknown>;
	}) => Promise<unknown>;
	globals?: Record<string, unknown>;
};

const pending = pendingData.pending as PendingObservation[];
const mounted: HTMLElement[] = [];
const platform = navigator.platform;
const unpending: Observation[] = [];
const consumedPending = new Set<PendingObservation>();
const IMAGE_EXPECTED =
	"two theme-specific 64x64 images, empty alt, loaded, visible variant selected, token-matched ground";

afterEach(() => {
	for (const host of mounted.splice(0)) host.remove();
});

afterAll(() => {
	expect(unpending).toEqual([]);
	expect(pending.filter((row) => !consumedPending.has(row))).toEqual([]);
});

function releaseHost(host: HTMLElement): void {
	host.remove();
	const index = mounted.indexOf(host);
	if (index !== -1) mounted.splice(index, 1);
}

function exactPendingMatch(
	observation: Observation,
): PendingObservation | undefined {
	return pending.find(
		(row) =>
			row.case === observation.case &&
			row.story === observation.story &&
			row.selector === observation.selector &&
			row.theme === observation.theme &&
			row.locale === observation.locale &&
			row.platform === observation.platform &&
			row.actual === observation.actual &&
			row.expected === observation.expected,
	);
}

function recordObservation(observation: Observation, passed: boolean): void {
	if (passed) return;
	const match = exactPendingMatch(observation);
	if (match === undefined) unpending.push(observation);
	else consumedPending.add(match);
}

function validatePendingSchema(): void {
	expect(pendingData.schemaVersion).toBe(1);
	for (const row of pending) {
		expect(Object.keys(row).sort()).toEqual(
			[
				"actual",
				"case",
				"expected",
				"locale",
				"platform",
				"reason",
				"selector",
				"story",
				"theme",
			].sort(),
		);
		for (const value of [
			row.case,
			row.story,
			row.selector,
			row.locale,
			row.platform,
			row.actual,
			row.expected,
			row.reason,
		]) {
			expect(value.trim()).not.toBe("");
			expect(value).not.toContain("*");
		}
		expect(["light", "dark"]).toContain(row.theme);
	}
}

async function renderStory(
	story: unknown,
	theme: Theme,
	locale = "en",
): Promise<HTMLElement> {
	const host = document.createElement("div");
	host.style.position = "relative";
	host.style.width = "580px";
	host.style.height = "337px";
	document.body.append(host);
	mounted.push(host);
	const runnable = story as RunnableStory;
	await runnable.run({
		canvasElement: host,
		globals: { ...runnable.globals, theme, locale },
	});
	return host;
}

function tokenColor(host: HTMLElement, token: string): string {
	const probe = document.createElement("span");
	probe.style.color = `var(${token})`;
	probe.setAttribute("aria-hidden", "true");
	host.append(probe);
	try {
		return getComputedStyle(probe).color;
	} finally {
		probe.remove();
	}
}

function imageState(
	host: HTMLElement,
	theme: Theme,
): { actual: string; passes: boolean } {
	const icons = [...host.querySelectorAll<HTMLElement>(".empty-state__icon")];
	if (icons.length !== 2) {
		const icon = icons[0];
		if (icon instanceof SVGElement) {
			const style = getComputedStyle(icon);
			return {
				actual: `placeholder-svg:${style.width}x${style.height}`,
				passes: false,
			};
		}
		return { actual: `icon-count:${icons.length}`, passes: false };
	}
	const light = icons.find((icon) =>
		icon.classList.contains("empty-state__icon--light"),
	);
	const dark = icons.find((icon) =>
		icon.classList.contains("empty-state__icon--dark"),
	);
	if (
		!(light instanceof HTMLImageElement) ||
		!(dark instanceof HTMLImageElement)
	) {
		return { actual: "theme-variant-nodes-invalid", passes: false };
	}
	const lightStyle = getComputedStyle(light);
	const darkStyle = getComputedStyle(dark);
	const visibleMatchesTheme =
		(theme === "light" &&
			lightStyle.display !== "none" &&
			darkStyle.display === "none") ||
		(theme === "dark" &&
			darkStyle.display !== "none" &&
			lightStyle.display === "none");
	const ground = getComputedStyle(document.body).backgroundColor;
	const groundMatchesToken = ground === tokenColor(host, "--ec-color-bg");
	const valid =
		light.alt === "" &&
		dark.alt === "" &&
		lightStyle.width === "64px" &&
		lightStyle.height === "64px" &&
		darkStyle.width === "64px" &&
		darkStyle.height === "64px" &&
		light.naturalWidth > 0 &&
		light.naturalHeight > 0 &&
		dark.naturalWidth > 0 &&
		dark.naturalHeight > 0 &&
		visibleMatchesTheme &&
		groundMatchesToken;
	const actual = valid
		? IMAGE_EXPECTED
		: `light:${lightStyle.width}x${lightStyle.height}:${light.naturalWidth}x${light.naturalHeight}:${light.alt}:display-${lightStyle.display};dark:${darkStyle.width}x${darkStyle.height}:${dark.naturalWidth}x${dark.naturalHeight}:${dark.alt}:display-${darkStyle.display};ground:${ground}`;
	return { actual, passes: valid };
}

function parsedColor(
	value: string,
): NonNullable<ReturnType<typeof parseColour>> {
	const parsed = parseColour(value);
	if (parsed !== null) return parsed;
	if (!CSS.supports("color", value))
		throw new Error(`unparseable rendered color: ${value}`);
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (context === null)
		throw new Error("canvas color conversion is unavailable");
	context.fillStyle = value;
	context.fillRect(0, 0, 1, 1);
	const pixel = context.getImageData(0, 0, 1, 1).data;
	return {
		r: pixel[0] ?? 0,
		g: pixel[1] ?? 0,
		b: pixel[2] ?? 0,
		a: (pixel[3] ?? 0) / 255,
	};
}

function nearestOpaqueBackground(element: HTMLElement): string {
	let current: HTMLElement | null = element;
	while (current !== null) {
		const color = getComputedStyle(current).backgroundColor;
		const parsed = parseColour(color);
		if (parsed !== null && parsed.a > 0) return color;
		current = current.parentElement;
	}
	return "transparent";
}

function dropContrast(host: HTMLElement): {
	zone: HTMLElement;
	actual: string;
	passes: boolean;
	interiorRatio: number;
	outerRatio: number;
} {
	const zone = host.querySelector<HTMLElement>(".drop-zone--active");
	if (zone === null)
		throw new Error("DragOver story did not activate the drop zone");
	const style = getComputedStyle(zone);
	const border = style.borderTopColor;
	const interior = style.backgroundColor;
	const outer = nearestOpaqueBackground(zone.parentElement ?? zone);
	const interiorRatio = contrastRatio(
		parsedColor(border),
		parsedColor(interior),
	);
	const outerRatio = contrastRatio(parsedColor(border), parsedColor(outer));
	return {
		zone,
		actual: `interior:${interiorRatio.toFixed(4)} outer:${outerRatio.toFixed(4)}`,
		passes: interiorRatio >= 3 && outerRatio >= 3,
		interiorRatio,
		outerRatio,
	};
}

function rowsFitCompactFrame(app: HTMLElement): {
	passes: boolean;
	actual: string;
} {
	const rows = [
		...app.querySelectorAll<HTMLElement>(".file-table__body .file-table__row"),
	];
	const appBox = app.getBoundingClientRect();
	const outside = rows
		.map((row, index) => ({ row, index, box: row.getBoundingClientRect() }))
		.filter(({ box }) => box.top < appBox.top || box.bottom > appBox.bottom);
	return {
		passes: rows.length > 0 && outside.length === 0,
		actual:
			outside.length === 0
				? `${rows.length} rows inside 580x337`
				: `${outside.map(({ index, box }) => `row${index + 1}-bottom:${Math.round(box.bottom - appBox.top)}`).join(",")};frame-bottom:337`,
	};
}

test("pending exceptions are exact rendered observations", () => {
	validatePendingSchema();
});

test("empty state uses a loaded, theme-matched decorative symbol; planted missing images fail", async () => {
	validatePendingSchema();
	for (const theme of ["light", "dark"] as const) {
		const host = await renderStory(EmptyStateWithSymbol, theme);
		const observation: Observation = {
			case: "empty-symbol",
			story: "ui-emptystate--copy-mode-on",
			selector: ".empty-state__icon",
			theme,
			locale: "en",
			platform: "any",
			actual: imageState(host, theme).actual,
			expected: IMAGE_EXPECTED,
		};
		const state = imageState(host, theme);
		recordObservation(observation, state.passes);
		releaseHost(host);
	}

	const planted = document.createElement("div");
	planted.innerHTML =
		'<img class="empty-state__icon empty-state__icon--light" alt=""><img class="empty-state__icon empty-state__icon--dark" alt="">';
	document.body.append(planted);
	mounted.push(planted);
	for (const theme of ["light", "dark"] as const) {
		expect(imageState(planted, theme).passes).toBe(false);
	}
	releaseHost(planted);
});

test("active drop boundary meets 3:1 against both rendered neighboring surfaces; planted low contrast fails", async () => {
	for (const theme of ["light", "dark"] as const) {
		const host = await renderStory(DragOver, theme);
		const measured = dropContrast(host);
		recordObservation(
			{
				case: "drop-boundary-contrast",
				story: "ui-dropzone--drag-over",
				selector: ".drop-zone--active",
				theme,
				locale: "en",
				platform,
				actual: measured.actual,
				expected: "both adjacent surfaces >= 3:1",
			},
			measured.passes,
		);
		const planted = measured.zone.cloneNode(true) as HTMLElement;
		planted.style.borderColor = getComputedStyle(measured.zone).backgroundColor;
		host.append(planted);
		const plantedRatio = contrastRatio(
			parsedColor(getComputedStyle(planted).borderTopColor),
			parsedColor(getComputedStyle(planted).backgroundColor),
		);
		expect(plantedRatio).toBeLessThan(3);
		releaseHost(host);
	}
});

test("a 580x337 application frame contains its active rows and rejects planted overflow", async () => {
	for (const theme of ["light", "dark"] as const) {
		const host = await renderStory(MidBatch, theme);
		const app = host.querySelector<HTMLElement>(".app");
		if (app === null)
			throw new Error("App story did not render its app surface");
		app.style.width = "580px";
		app.style.height = "337px";
		const measured = rowsFitCompactFrame(app);
		recordObservation(
			{
				case: "compact-file-rows",
				story: "screens-app--mid-batch",
				selector: ".file-table__body .file-table__row",
				theme,
				locale: "en",
				platform,
				actual: measured.actual,
				expected: "all rendered rows inside 580x337",
			},
			measured.passes,
		);
		const row = app.querySelector<HTMLElement>(
			".file-table__body .file-table__row:last-child",
		);
		if (row === null)
			throw new Error("App story has no row for the overflow control");
		row.style.transform = "translateY(1000px)";
		expect(rowsFitCompactFrame(app).passes).toBe(false);
		releaseHost(host);
	}
});

test("French settings text remains inside the 580px drawer in both themes", async () => {
	for (const theme of ["light", "dark"] as const) {
		const host = await renderStory(FrenchSettings, theme, "fr");
		const drawer = host.querySelector<HTMLElement>(".settings-drawer");
		if (drawer === null)
			throw new Error("French settings drawer did not render");
		const drawerBox = drawer.getBoundingClientRect();
		const textNodes = [
			...drawer.querySelectorAll<HTMLElement>(
				".toggle-switch__label, .toggle-switch__description",
			),
		];
		const overflowing = textNodes.filter((node) => {
			const box = node.getBoundingClientRect();
			return (
				node.scrollWidth > node.clientWidth ||
				box.left < drawerBox.left ||
				box.right > drawerBox.right
			);
		});
		const observation: Observation = {
			case: "settings-long-text",
			story: "settings-settingsdrawer--all-toggles-on",
			selector: ".toggle-switch__label, .toggle-switch__description",
			theme,
			locale: "fr",
			platform,
			actual:
				overflowing.length === 0
					? "all localized switch text inside 320px drawer"
					: `${overflowing.length} localized strings overflow`,
			expected: "all localized switch text inside 320px drawer",
		};
		recordObservation(observation, overflowing.length === 0);
		releaseHost(host);
	}
});

test("populated rows replace the empty screen without a broom", async () => {
	for (const theme of ["light", "dark"] as const) {
		const host = await renderStory(AllDone, theme);
		expect(host.querySelector(".empty-state")).toBeNull();
		expect(host.querySelectorAll(".empty-state__icon")).toHaveLength(0);
		expect(
			host.querySelectorAll(".file-table__body .file-table__row"),
		).toHaveLength(3);
		releaseHost(host);
	}
});

test("long toast, status, and error messages preserve their current action and fit boundaries", async () => {
	for (const theme of ["light", "dark"] as const) {
		const toastHost = await renderStory(ToastLongMessage, theme, "da");
		const toast = toastHost.querySelector<HTMLElement>(".toast");
		const toastFrame = toast?.parentElement;
		if (
			toast === null ||
			toastFrame === null ||
			toast === undefined ||
			toastFrame === undefined
		)
			throw new Error("long toast story did not render its frame");
		const toastBox = toast.getBoundingClientRect();
		const frameBox = toastFrame.getBoundingClientRect();
		const toastFits =
			toastBox.left >= frameBox.left &&
			toastBox.right <= frameBox.right &&
			toast.scrollWidth <= toast.clientWidth;
		recordObservation(
			{
				case: "toast-long-message",
				story: "ui-toast--long-message",
				selector: ".toast",
				theme,
				locale: "da",
				platform,
				actual: toastFits
					? "wrapped inside 580px frame"
					: `left:${Math.round(toastBox.left - frameBox.left)} right:${Math.round(toastBox.right - frameBox.left)} width:${toast.scrollWidth}/${toast.clientWidth}`,
				expected: "wrapped inside 580px frame",
			},
			toastFits,
		);
		releaseHost(toastHost);

		const statusHost = await renderStory(TurkishLongStatus, theme, "tr");
		const status = statusHost.querySelector<HTMLElement>(".status-bar");
		const clear = statusHost.querySelector<HTMLElement>(".status-bar__button");
		const summary = statusHost.querySelector<HTMLElement>(
			".status-bar__summary",
		);
		if (status === null || clear === null || summary === null)
			throw new Error(
				"long status story did not render its summary and Clear action",
			);
		const statusBox = status.getBoundingClientRect();
		const clearBox = clear.getBoundingClientRect();
		const statusPasses =
			clearBox.left >= statusBox.left &&
			clearBox.right <= statusBox.right &&
			summary.getBoundingClientRect().right <= clearBox.left &&
			clear.scrollWidth <= clear.clientWidth;
		recordObservation(
			{
				case: "status-long-message",
				story: "ui-statusbar--turkish-long-status",
				selector: ".status-bar__summary, .status-bar__button",
				theme,
				locale: "tr",
				platform,
				actual: statusPasses
					? "long summary and Clear action within bar"
					: `summary-right:${Math.round(summary.getBoundingClientRect().right - statusBox.left)} clear:${Math.round(clearBox.left - statusBox.left)}-${Math.round(clearBox.right - statusBox.left)} width:${Math.round(statusBox.width)}`,
				expected: "long summary and Clear action within bar",
			},
			statusPasses,
		);
		releaseHost(statusHost);

		const errorHost = await renderStory(FallbackLongMessage, theme);
		const errorSurface =
			errorHost.querySelector<HTMLElement>(".error-boundary");
		if (errorSurface === null)
			throw new Error("long error story did not render its alert surface");
		errorSurface.style.minHeight = "337px";
		const detail = errorHost.querySelector<HTMLElement>(
			".error-boundary__detail",
		);
		const retry = errorHost.querySelector<HTMLElement>(
			".error-boundary__button",
		);
		if (detail === null || retry === null)
			throw new Error(
				"long error story did not render detail and recovery action",
			);
		const detailBox = detail.getBoundingClientRect();
		const errorBox = errorHost.getBoundingClientRect();
		const errorPasses =
			detail.scrollWidth <= detail.clientWidth &&
			detailBox.left >= errorBox.left &&
			detailBox.right <= errorBox.right &&
			retry.getBoundingClientRect().bottom <= errorBox.bottom;
		recordObservation(
			{
				case: "error-long-message",
				story: "ui-errorboundary--fallback-long-message",
				selector: ".error-boundary__detail, .error-boundary__button",
				theme,
				locale: "en",
				platform,
				actual: errorPasses
					? "wrapped detail and recovery action within frame"
					: `detail:${detail.scrollWidth}/${detail.clientWidth};left:${Math.round(detailBox.left - errorBox.left)};right:${Math.round(detailBox.right - errorBox.left)};retry-bottom:${Math.round(retry.getBoundingClientRect().bottom - errorBox.top)}`,
				expected: "wrapped detail and recovery action within frame",
			},
			errorPasses,
		);
		releaseHost(errorHost);
	}
});
