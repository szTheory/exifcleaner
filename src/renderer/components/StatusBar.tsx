// Bottom status bar with progress summary and "Clean more" button.

export function StatusBar({
	completedCount,
	totalCount,
	totalTagsRemoved,
	elapsedSeconds,
	onCleanMore,
}: {
	completedCount: number;
	totalCount: number;
	totalTagsRemoved: number;
	elapsedSeconds: number;
	onCleanMore: () => void;
}): React.JSX.Element {
	return (
		<footer className="status-bar">
			<div className="status-bar__summary">
				<span className="status-bar__count">{completedCount}</span> of{" "}
				<span className="status-bar__count">{totalCount}</span> cleaned
				{" \u2014 "}
				<span className="status-bar__count">{totalTagsRemoved}</span> tags
				removed{" \u2014 "}
				<span className="status-bar__count">{elapsedSeconds}</span>s
			</div>
			<button className="status-bar__button" onClick={onCleanMore}>
				Clean more
			</button>
		</footer>
	);
}
