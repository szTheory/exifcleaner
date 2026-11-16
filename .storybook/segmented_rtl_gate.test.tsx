import { composeStory, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, describe, expect, test } from "vitest";
import fa from "../.resources/locales/fa.json";
import { SegmentedControl } from "../src/renderer/components/settings/SegmentedControl";
import meta from "../src/renderer/components/settings/SegmentedControl.stories";
import preview from "./preview";

// RTL-01 / W-4: the persistent Persian half of the segmented-indicator relation. A story
// holds one locale, so `SegmentedControl.stories.tsx` Arabic holds the `ar` relation and
// this browser-project test holds `fa`, without adding a story id (an added id cannot
// pass the sealed a11y baseline kinds, RESEARCH R1). It runs in the Storybook job (path
// filter `src/renderer/**` and `.storybook/**`).
//
// The indicator must sit on the active segment, left edge and width within 1 px, at
// active index 0, 1 and 2. Under a right-to-left layout index 1 is correct by coincidence
// (PLN-01 S4 measured -197.34, -0.02 and +197.31 px before the fix), so the proof lives
// at 0 and 2. The test sets `dir=rtl` and `lang=fa` itself and asserts it before it
// measures, so it can never pass vacuously against a left-to-right document, whatever
// the locale provider does.
setProjectAnnotations([preview]);

type Mode = "light" | "system" | "dark";
const MODES: readonly Mode[] = ["light", "system", "dark"];

const sourceOptions = meta.args.options;
const options = sourceOptions.map((option, index) => ({
	...option,
	label: [fa.themeLight, fa.themeAuto, fa.themeDark][index] ?? option.label,
}));

function noop(): void {}

// The story's own component annotations (the real component and the preview providers)
// with a scene of three controls, one per active index, in a 300 px column like the
// PLN-01 measurement.
const FaScene = composeStory(
	{
		globals: { locale: "fa" },
		render: () => (
			<div style={{ display: "grid", gap: "8px", width: "300px" }}>
				{MODES.map((mode) => (
					<SegmentedControl
						key={mode}
						options={options}
						value={mode}
						onChange={noop}
						label={fa.appearance}
					/>
				))}
			</div>
		),
	},
	meta,
);

const previousDir = document.documentElement.dir;
const previousLang = document.documentElement.lang;
const mounted: HTMLElement[] = [];

afterEach(() => {
	for (const element of mounted.splice(0)) element.remove();
	document.documentElement.dir = previousDir;
	document.documentElement.lang = previousLang;
});

type Row = { index: number; leftDelta: number; widthDelta: number };

function measure(group: HTMLElement): Row {
	const radios = Array.from(
		group.querySelectorAll<HTMLElement>('[role="radio"]'),
	);
	const index = radios.findIndex(
		(radio) => radio.getAttribute("aria-checked") === "true",
	);
	const active = radios[index];
	const indicator = group.querySelector(".segmented-control__indicator");
	if (active === undefined || indicator === null) {
		throw new Error("no active segment or no indicator");
	}
	const segment = active.getBoundingClientRect();
	const box = indicator.getBoundingClientRect();
	return {
		index,
		leftDelta: box.left - segment.left,
		widthDelta: box.width - segment.width,
	};
}

describe("segmented indicator under fa (RTL-01)", () => {
	test("the indicator sits on the active segment at index 0, 1 and 2", async () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		mounted.push(host);
		await FaScene.run({
			canvasElement: host,
			globals: { ...FaScene.globals, locale: "fa" },
		});

		document.documentElement.dir = "rtl";
		document.documentElement.lang = "fa";
		// The vacuity guard: nothing below is a proof unless the document is right-to-left.
		expect(document.documentElement.dir).toBe("rtl");

		const groups = Array.from(
			host.querySelectorAll<HTMLElement>('[role="radiogroup"]'),
		);
		expect(groups).toHaveLength(3);
		const rows = groups.map(measure);
		expect(rows.map((row) => row.index)).toEqual([0, 1, 2]);
		// Printed so the post-fix numbers can be recorded next to PLN-01 S4.
		console.info(
			`segmented_rtl_gate fa deltas (px, indicator minus active segment): ${rows
				.map(
					(row) =>
						`index ${row.index} left ${row.leftDelta.toFixed(2)} width ${row.widthDelta.toFixed(2)}`,
				)
				.join("; ")}`,
		);
		const violations = rows.flatMap((row) =>
			Math.abs(row.leftDelta) <= 1 && Math.abs(row.widthDelta) <= 1
				? []
				: [
						`fa index ${row.index}: indicator minus active segment: left ${row.leftDelta.toFixed(2)} px, width ${row.widthDelta.toFixed(2)} px`,
					],
		);
		expect(violations).toEqual([]);
	});
});
