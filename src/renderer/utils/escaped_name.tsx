// View helper for names already escaped by displayName (TRU-01). Each escape token gets
// its own left-to-right isolate: as plain text inside a right-to-left name the token is
// reordered and a leading token flips the host paragraph's direction.
//
// Lives under utils/, not components/: a non-story .tsx under components/ becomes a
// catalog subject. Token text is rendered as an expression, never a JSX text literal, so
// the hardcoded-string scan stays green.
import { splitEscapedName } from "../../domain";

export function EscapedName({ text }: { text: string }): React.JSX.Element {
	const segments = splitEscapedName({ text });
	// Zero DOM delta for a name without a control.
	if (segments.every((segment) => segment.kind === "text")) {
		return <>{text}</>;
	}
	return (
		<>
			{segments.map((segment, index) =>
				segment.kind === "escape" ? (
					<bdi key={index} dir="ltr" className="file-table__bidi-escape">
						{segment.text}
					</bdi>
				) : (
					segment.text
				),
			)}
		</>
	);
}
