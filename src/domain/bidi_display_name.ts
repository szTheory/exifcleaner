// Pure domain logic -- zero dependencies, zero I/O.
// Display-only escape for bidirectional formatting controls in file and folder names
// (Trojan Source class: a right-to-left override makes a JPG read as a PNG).
//
// The nine controls are U+202A to U+202E (embeddings, pop, overrides) and U+2066 to U+2069
// (isolates). LRM, RLM, ALM and ZWJ are not marked, and neither are ZWSP, U+2028, U+2029,
// U+FEFF or tag characters: none has a measured reordering defect (dormant seed).
//
// The escape is stateless and idempotent: it never pairs controls (a trailing U+202C is
// shown too), and its output holds no control, so a second pass changes nothing. Callers
// apply it only at view boundaries; the raw name stays in state, sorting, paths and IPC.

// Non-global: `.test` on a global regex is stateful through `lastIndex`.
const BIDI_CONTROL = /[\u{202A}-\u{202E}\u{2066}-\u{2069}]/u;
// Global: used only through `.replace`, which resets `lastIndex` itself.
const BIDI_CONTROLS = /[\u{202A}-\u{202E}\u{2066}-\u{2069}]/gu;
// The exact token grammar `displayName` emits, so `splitEscapedName` cannot match any
// other angle-bracket text in a name.
const ESCAPE_TOKEN = /<U\+(?:202[A-E]|206[6-9])>/g;

function tokenFor(control: string): string {
	const codePoint = control.codePointAt(0) ?? 0;
	return `<U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}>`;
}

export function displayName({ name }: { name: string }): string {
	if (!BIDI_CONTROL.test(name)) return name;
	return name.replace(BIDI_CONTROLS, tokenFor);
}

export type EscapedSegment = { kind: "text" | "escape"; text: string };

// Splits escaped text into plain runs and escape tokens so the view can isolate each
// token. Joining the segment texts always gives back the input.
export function splitEscapedName({ text }: { text: string }): EscapedSegment[] {
	const segments: EscapedSegment[] = [];
	let last = 0;
	for (const match of text.matchAll(ESCAPE_TOKEN)) {
		const at = match.index ?? 0;
		if (at > last) segments.push({ kind: "text", text: text.slice(last, at) });
		segments.push({ kind: "escape", text: match[0] });
		last = at + match[0].length;
	}
	if (last < text.length)
		segments.push({ kind: "text", text: text.slice(last) });
	return segments;
}
