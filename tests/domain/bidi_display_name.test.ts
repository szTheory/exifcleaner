import { describe, it, expect } from "vitest";
import {
	displayName,
	displayNameSegments,
} from "../../src/domain/bidi_display_name";

// Every control is built from its code point, never typed as a raw character: a raw
// bidirectional control in a source file is the Trojan Source defect this module shows.
const NINE_CONTROLS = [
	0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
] as const;

function control(codePoint: number): string {
	return String.fromCodePoint(codePoint);
}

function tokenOf(codePoint: number): string {
	return `<U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}>`;
}

const BIDI_CONTROL_CLASS = /[\u{202A}-\u{202E}\u{2066}-\u{2069}]/u;

describe("displayName", () => {
	it.each(
		NINE_CONTROLS.map((codePoint) => ({
			codePoint,
			token: tokenOf(codePoint),
		})),
	)(
		"escapes the control shown as $token to its exact token",
		({ codePoint, token }) => {
			const escaped = displayName({ name: `a${control(codePoint)}b` });
			expect(escaped).toBe(`a${token}b`);
		},
	);

	it("pins the four-digit uppercase form for every code point", () => {
		const tokens = NINE_CONTROLS.map((codePoint) =>
			displayName({ name: control(codePoint) }),
		);
		expect(tokens).toEqual([
			"<U+202A>",
			"<U+202B>",
			"<U+202C>",
			"<U+202D>",
			"<U+202E>",
			"<U+2066>",
			"<U+2067>",
			"<U+2068>",
			"<U+2069>",
		]);
	});

	it("escapes a trailing pop and a name that is only controls (no pairing logic)", () => {
		expect(displayName({ name: `a${control(0x202c)}` })).toBe("a<U+202C>");
		expect(displayName({ name: `${control(0x2066)}${control(0x2069)}` })).toBe(
			"<U+2066><U+2069>",
		);
	});

	it("escapes the same control repeatedly across calls (no stateful regex)", () => {
		const name = `holiday${control(0x202e)}gnp.jpg`;
		const first = displayName({ name });
		const second = displayName({ name });
		const third = displayName({ name });
		expect(first).toBe("holiday<U+202E>gnp.jpg");
		expect(second).toBe(first);
		expect(third).toBe(first);
	});

	const IDENTITY_CASES: [string, string][] = [
		["a Hebrew word", "\u{5E9}\u{5DC}\u{5D5}\u{5DD}-final.jpg"],
		["an Arabic word", "\u{62A}\u{642}\u{631}\u{64A}\u{631}-photo.png"],
		["a left-to-right mark (U+200E)", `a${control(0x200e)}b.jpg`],
		["a right-to-left mark (U+200F)", `a${control(0x200f)}b.jpg`],
		["an Arabic letter mark (U+061C)", `a${control(0x061c)}b.jpg`],
		["a zero width joiner (U+200D)", `a${control(0x200d)}b.jpg`],
		["plain ASCII", "sample photo (1).jpg"],
		["the empty name", ""],
	];

	it.each(IDENTITY_CASES)("leaves %s byte-identical", (_label, name) => {
		expect(displayName({ name })).toBe(name);
	});

	it("is idempotent and its output holds no control", () => {
		const everything = `x${NINE_CONTROLS.map(control).join("y")}z`;
		const once = displayName({ name: everything });
		expect(displayName({ name: once })).toBe(once);
		expect(BIDI_CONTROL_CLASS.test(once)).toBe(false);
	});

	it("does not touch angle-bracket text that is not a control", () => {
		expect(displayName({ name: "a<U+202E>b" })).toBe("a<U+202E>b");
	});
});

describe("displayNameSegments", () => {
	it("keeps literal escape-token text as text", () => {
		expect(displayNameSegments({ name: "holiday<U+202E>gnp.jpg" })).toEqual([
			{ kind: "text", text: "holiday<U+202E>gnp.jpg" },
		]);
	});

	it("marks only real controls as escapes and leaves adjacent literal tokens alone", () => {
		expect(
			displayNameSegments({
				name: `literal<U+202E>${control(0x2066)}${control(0x2069)}tail`,
			}),
		).toEqual([
			{ kind: "text", text: "literal<U+202E>" },
			{ kind: "escape", text: "<U+2066>" },
			{ kind: "escape", text: "<U+2069>" },
			{ kind: "text", text: "tail" },
		]);
	});

	it("joins to the display name and preserves a control-free name byte-identically", () => {
		const name = `scan-${control(0x202d)}abc${control(0x202c)}.png`;
		const segments = displayNameSegments({ name });
		expect(segments.map((segment) => segment.text).join("")).toBe(
			displayName({ name }),
		);
		expect(displayNameSegments({ name: "sample.jpg" })).toEqual([
			{ kind: "text", text: "sample.jpg" },
		]);
		expect(displayNameSegments({ name: "" })).toEqual([]);
	});

	it("does not mark non-target controls or non-token angle-bracket text", () => {
		const name = `a<U+202F>${control(0x200f)}b<U+2065>`;
		expect(displayNameSegments({ name })).toEqual([
			{ kind: "text", text: name },
		]);
	});
});
