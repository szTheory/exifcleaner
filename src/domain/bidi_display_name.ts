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
function tokenFor(control: string): string {
	const codePoint = control.codePointAt(0) ?? 0;
	return `<U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}>`;
}

export function displayName({ name }: { name: string }): string {
	return displayNameSegments({ name })
		.map((segment) => segment.text)
		.join("");
}

export type EscapedSegment = { kind: "text" | "escape"; text: string };

// Segments raw names so only generated escapes are isolated in the view. Literal text that
// happens to look like an escape token remains ordinary text.
export function displayNameSegments({
	name,
}: {
	name: string;
}): EscapedSegment[] {
	const segments: EscapedSegment[] = [];
	let textStart = 0;
	for (let index = 0; index < name.length;) {
		const codePoint = name.codePointAt(index);
		if (codePoint === undefined) break;
		const character = String.fromCodePoint(codePoint);
		if (BIDI_CONTROL.test(character)) {
			if (index > textStart) {
				segments.push({ kind: "text", text: name.slice(textStart, index) });
			}
			segments.push({ kind: "escape", text: tokenFor(character) });
			index += character.length;
			textStart = index;
		} else {
			index += character.length;
		}
	}
	if (textStart < name.length) {
		segments.push({ kind: "text", text: name.slice(textStart) });
	}
	return segments;
}
