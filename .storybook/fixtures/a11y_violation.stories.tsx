import type { Meta, StoryObj } from "@storybook/react-vite";

// A deliberately inaccessible story: a 10 px button with no accessible name.
// It lives outside every stories glob (main.ts reads src/renderer only), so it
// never appears in the catalog; .storybook/a11y_gate.test.tsx composes it
// directly to prove the accessibility gate can fail.
const meta = {
	title: "Fixtures/A11yViolation",
	render: () => <button type="button" style={{ width: 10, height: 10 }} />,
} satisfies Meta;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

export const Violating: StoryObj<typeof meta> = {};
