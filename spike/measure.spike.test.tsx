import { composeStories, composeStory, setProjectAnnotations } from "@storybook/react-vite";
import { describe, expect, test } from "vitest";
import { commands } from "vitest/browser";
import preview from "../.storybook/preview";
import ar from "../.resources/locales/ar.json";
import en from "../.resources/locales/en.json";
import fa from "../.resources/locales/fa.json";
import { SegmentedControl } from "../src/renderer/components/settings/SegmentedControl";
import * as appStories from "../src/renderer/components/screens/App.stories";

// PLN-01 spike (76-01), measurement half (S2 and S4). Throwaway: spike/76-pln-01 only.
// It changes no CSS and no product file: S4 measures today's defect, S2 today's layout at
// 960 px. Both run in the same provider factory as the captures (D-24).
setProjectAnnotations([preview]);

type SpikeCommands = {
	spikeEnv: () => Promise<{ lane: string; cpu: string; image: string; commit: string }>;
	spikeWriteJson: (name: string, value: unknown) => Promise<void>;
};
const node = commands as unknown as SpikeCommands;

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------- S2: 960 px fit ------

const APP = composeStories(appStories);
const S2_STORIES = ["Empty", "MidBatch", "AllDone", "LargeBatch"] as const;
const S2_WIDTHS = [580, 960] as const;

// The surfaces of the plan-count rule: data surfaces (file list, row, badge, expansion,
// columns) feed Phase 78 (n78); chrome or intake surfaces (drawer, drop zone, empty state,
// toast, status bar, error boundary) feed Phase 79 (n79).
const DATA = /file-table|file-list|folder-row|type-pill|status-icon|metadata|expansion/;
const CHROME =
	/drawer|settings|drop-zone|empty-state|toast|status-bar|error-boundary|segmented|toggle|language|app__/;

function simpleSelector(element: Element): string {
	const tag = element.tagName.toLowerCase();
	const classes = Array.from(element.classList).join(".");
	return classes === "" ? tag : `${tag}.${classes}`;
}

function chain(element: Element, root: Element): string {
	const parts: string[] = [];
	for (let node: Element | null = element; node !== null; node = node.parentElement) {
		parts.unshift(simpleSelector(node));
		if (node === root || parts.length >= 4) break;
	}
	return parts.join(" > ");
}

function surfaceOf(element: Element, root: Element): "data" | "chrome" | "other" {
	for (let node: Element | null = element; node !== null; node = node.parentElement) {
		const classes = Array.from(node.classList).join(" ");
		if (DATA.test(classes)) return "data";
		if (CHROME.test(classes)) return "chrome";
		if (node === root) break;
	}
	return "other";
}

type Overflower = {
	selector: string;
	kind: "scroll" | "rect";
	worst_px: number;
	elements: number;
	clips: boolean;
	surface: "data" | "chrome" | "other";
	example: string;
};

function measureFrame(frame: HTMLElement): {
	max_overflow_px: number;
	max_overflow_selector: string;
	min_slack_px: number;
	min_slack_selector: string;
	rect_overflow_px: number;
	rect_overflow_selector: string;
	elements_scanned: number;
	overflowers: Overflower[];
} {
	const frameRect = frame.getBoundingClientRect();
	const all = [frame, ...Array.from(frame.querySelectorAll("*"))];
	let maxOver = 0;
	let maxOverSelector = "";
	let minSlack = Number.POSITIVE_INFINITY;
	let minSlackSelector = "";
	let rectMax = 0;
	let rectSelector = "";
	const grouped = new Map<string, Overflower>();
	function note(
		element: Element,
		kind: "scroll" | "rect",
		amount: number,
		clips: boolean,
	): void {
		const selector = simpleSelector(element);
		const key = `${kind}|${selector}`;
		const existing = grouped.get(key);
		if (existing === undefined) {
			grouped.set(key, {
				selector,
				kind,
				worst_px: round(amount),
				elements: 1,
				clips,
				surface: surfaceOf(element, frame),
				example: chain(element, frame),
			});
		} else {
			existing.elements += 1;
			if (amount > existing.worst_px) {
				existing.worst_px = round(amount);
				existing.example = chain(element, frame);
			}
			existing.clips = existing.clips || clips;
		}
	}
	for (const element of all) {
		const style = getComputedStyle(element);
		const clipping = ["hidden", "auto", "scroll", "clip"].includes(style.overflowX);
		const over = element.scrollWidth - element.clientWidth;
		if (element.clientWidth > 0) {
			if (over > maxOver) {
				maxOver = over;
				maxOverSelector = chain(element, frame);
			}
			if (clipping) {
				const slack = element.clientWidth - element.scrollWidth;
				if (slack < minSlack) {
					minSlack = slack;
					minSlackSelector = chain(element, frame);
				}
			}
			if (over > 0) note(element, "scroll", over, clipping);
		}
		const rect = element.getBoundingClientRect();
		if (rect.width > 0) {
			const out = Math.max(rect.right - frameRect.right, frameRect.left - rect.left, 0);
			if (out > 0.5) {
				note(element, "rect", out, false);
				if (out > rectMax) {
					rectMax = out;
					rectSelector = chain(element, frame);
				}
			}
		}
	}
	return {
		max_overflow_px: maxOver,
		max_overflow_selector: maxOverSelector,
		min_slack_px: Number.isFinite(minSlack) ? minSlack : 0,
		min_slack_selector: minSlackSelector,
		rect_overflow_px: round(rectMax),
		rect_overflow_selector: rectSelector,
		elements_scanned: all.length,
		overflowers: [...grouped.values()].sort(
			(a, b) => b.worst_px - a.worst_px || a.selector.localeCompare(b.selector),
		),
	};
}

describe("S2: 960 px fit (light theme)", () => {
	const rows: Array<Record<string, unknown>> = [];
	for (const name of S2_STORIES) {
		for (const width of S2_WIDTHS) {
			test(`${name} ${width}`, async () => {
				const story = APP[name];
				const host = document.createElement("div");
				host.id = "spike-host";
				document.body.appendChild(host);
				const style = document.createElement("style");
				style.textContent = `#spike-host > div { width: ${width}px !important; }`;
				document.head.appendChild(style);
				try {
					await story.run({ canvasElement: host, globals: { ...story.globals, theme: "light" } });
					await document.fonts.ready;
					const frame = host.firstElementChild;
					if (!(frame instanceof HTMLElement)) throw new Error("no frame");
					expect(Math.round(frame.getBoundingClientRect().width)).toBe(width);
					const measured = measureFrame(frame);
					rows.push({ story: story.id, theme: "light", width, ...measured });
					const env = await node.spikeEnv();
					await node.spikeWriteJson("s2.json", {
						lane: env.lane,
						cpu: env.cpu,
						image: env.image,
						commit: env.commit,
						note: "max_overflow = max(scrollWidth - clientWidth) over the frame root and all descendants; min_slack = min(clientWidth - scrollWidth) over clipping elements; rect_overflow = how far any element box pokes past the frame edge",
						rows,
					});
				} finally {
					host.remove();
					style.remove();
				}
			});
		}
	}
});

// ----------------------------------------------- S4: segmented indicator under RTL ------

type Labels = { themeLight: string; themeAuto: string; themeDark: string; appearance: string };
const LOCALES: ReadonlyArray<{ locale: "en" | "ar" | "fa"; dir: "ltr" | "rtl"; labels: Labels }> = [
	{ locale: "en", dir: "ltr", labels: en },
	{ locale: "ar", dir: "rtl", labels: ar },
	{ locale: "fa", dir: "rtl", labels: fa },
];
const VALUES = ["light", "system", "dark"] as const;

function Dot(): React.JSX.Element {
	return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" />;
}

describe("S4: indicator left minus active segment left, indexes 0 1 2", () => {
	const results: Record<string, unknown> = {};
	for (const { locale, dir, labels } of LOCALES) {
		test(`${locale}`, async () => {
			const options = [
				{ value: "light" as const, label: labels.themeLight, icon: <Dot /> },
				{ value: "system" as const, label: labels.themeAuto, icon: <Dot /> },
				{ value: "dark" as const, label: labels.themeDark, icon: <Dot /> },
			];
			const story = composeStory(
				{
					render: () => (
						<div data-spike="seg" style={{ width: "300px" }}>
							{VALUES.map((value) => (
								<div key={value} data-value={value} style={{ marginBottom: "8px" }}>
									<SegmentedControl
										options={options}
										value={value}
										onChange={() => undefined}
										label={labels.appearance}
									/>
								</div>
							))}
						</div>
					),
					globals: { locale, theme: "light" },
				},
				{ title: "Spike/SegmentedRtl", component: SegmentedControl },
				undefined,
				"Probe",
			);
			const host = document.createElement("div");
			document.body.appendChild(host);
			try {
				await story.run({ canvasElement: host });
				// Vacuity guard (D-24): the document really is in the expected direction.
				await expect.poll(() => document.documentElement.dir).toBe(dir);
				await expect.poll(() => document.documentElement.lang).toBe(locale);
				await document.fonts.ready;
				const deltas: number[] = [];
				const widthDiffs: number[] = [];
				for (const value of VALUES) {
					const wrapper = host.querySelector(`[data-value="${value}"]`);
					const indicator = wrapper?.querySelector(".segmented-control__indicator");
					const active = wrapper?.querySelector('[role="radio"][aria-checked="true"]');
					if (indicator == null || active == null) throw new Error(`no ${value} control`);
					const i = indicator.getBoundingClientRect();
					const a = active.getBoundingClientRect();
					deltas.push(round(i.left - a.left));
					widthDiffs.push(round(i.width - a.width));
				}
				const env = await node.spikeEnv();
				results[locale] = { dir: document.documentElement.dir, deltas, widthDiffs };
				await node.spikeWriteJson("s4.json", {
					lane: env.lane,
					cpu: env.cpu,
					image: env.image,
					commit: env.commit,
					control_width_px: 300,
					note: "delta = indicator.left - active segment .left in px for active indexes 0 (light), 1 (system), 2 (dark); widthDiff = indicator.width - segment.width",
					results,
				});
			} finally {
				host.remove();
			}
		});
	}
});
