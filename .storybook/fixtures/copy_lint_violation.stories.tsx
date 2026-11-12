import type { Meta, StoryObj } from "@storybook/react-vite";

// Deliberately violating and deliberately clean copy stories. They live outside
// every stories glob (main.ts reads src/renderer only), so they never appear in
// the catalog; .storybook/copy_lint_gate.test.tsx composes them directly to
// prove the rendered-text copy lint can fail, and that its two excuses
// (parameters.copyLint.fixtureText and a baselined template) do not over-reach.
const meta = {
	title: "Fixtures/CopyViolation",
} satisfies Meta;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

// A banned word in the text and two more in the aria-label.
export const Planted: Story = {
	render: () => (
		<button type="button" aria-label="Easy scrub">
			Just clean it
		</button>
	),
};

export const Clean: Story = {
	render: () => <p>Drop a file to remove its metadata.</p>,
};

// The hyphen is a non-word character, so \bjust\b does hit this file name; the
// declared fixtureText is what makes the story pass, visibly.
export const FixtureText: Story = {
	parameters: { copyLint: { fixtureText: ["just-married.jpg"] } },
	render: () => <p>just-married.jpg</p>,
};

// Non-vacuity companion of FixtureText: the same text without the excuse.
export const FixtureTextUnexcused: Story = {
	render: () => <p>just-married.jpg</p>,
};

// The excuse covers the file name and nothing else.
export const FixtureTextLeak: Story = {
	parameters: { copyLint: { fixtureText: ["just-married.jpg"] } },
	render: () => (
		<>
			<p>just-married.jpg</p>
			<p>Just clean it</p>
		</>
	),
};

// There is no off switch: the hook reads only fixtureText, so this key changes
// nothing and the story must still fail.
export const DisableIgnored: Story = {
	parameters: { copyLint: { disable: true } },
	render: () => <p>Just clean it</p>,
};

// Only English is linted.
export const NonEnglish: Story = {
	globals: { locale: "ar" },
	render: () => <p>just</p>,
};

// A story that renders no text passes.
export const Empty: Story = {
	render: () => <div />,
};
