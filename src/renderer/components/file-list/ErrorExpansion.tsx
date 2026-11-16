// Expandable error detail with click-to-copy functionality.
// Display and copy are split (TRU-01): the pre shows the detail with bidirectional
// controls escaped, while the clipboard receives the raw string so a copied path stays
// usable.

import { displayNameSegments } from "../../../domain";
import { EscapedName } from "../../utils/escaped_name";

export function ErrorExpansion({
	error,
	onCopy,
}: {
	error: string;
	onCopy: () => void;
}): React.JSX.Element {
	function handleCopy(): void {
		navigator.clipboard.writeText(error).then(onCopy, () => {
			// Clipboard write failed silently — no-op
		});
	}

	return (
		<div className="file-table__expansion">
			<pre
				className="file-table__error-text"
				onClick={handleCopy}
				style={{ cursor: "copy" }}
			>
				<EscapedName segments={displayNameSegments({ name: error })} />
			</pre>
			<span
				className="file-table__copy-hint"
				style={{ color: "var(--ec-color-text-secondary)" }}
			>
				Click to copy
			</span>
		</div>
	);
}
