import type { Meta, StoryObj } from "@storybook/react-vite";

// Planted stories for the a11y-p72 re-check controls (72-05, D-21). They exist only
// for .storybook/a11y_p72_recheck.test.tsx; they live outside every stories glob
// (main.ts reads src/renderer only), so they never appear in the catalog.
//
//   Passing        a high-contrast button with an accessible name: re-enabling
//                  color-contrast on it passes, so a baseline entry planted for it
//                  must be reported as `fixed, remove the entry`.
//   FreshViolation a button with no accessible name beside low-contrast text, with
//                  color-contrast switched off the way a baselined story would:
//                  the gate must still reject it, with button-name.
const meta = {
	title: "Fixtures/A11yRecheck",
} satisfies Meta;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

export const Passing: StoryObj<typeof meta> = {
	render: () => (
		<button
			type="button"
			style={{ color: "#000000", background: "#ffffff", fontSize: 16 }}
		>
			Save
		</button>
	),
};

export const FreshViolation: StoryObj<typeof meta> = {
	parameters: {
		a11y: { options: { rules: { "color-contrast": { enabled: false } } } },
	},
	render: () => (
		<div style={{ background: "#ffffff" }}>
			<button type="button" style={{ width: 10, height: 10 }} />
			<p style={{ color: "#dddddd", fontSize: 16 }}>Faint text</p>
		</div>
	),
};
