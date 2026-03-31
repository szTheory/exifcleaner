// Expandable error detail with click-to-copy functionality.

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
				{error}
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
