// Bottom status bar with gear icon (left), progress summary, and "Clean more" button (right).
// Renders persistently across both EmptyState and FileTable views.

import type { ReactNode } from "react";

export function StatusBar({
	gearIcon,
	completedCount,
	totalCount,
	totalTagsRemoved,
	elapsedSeconds,
	onCleanMore,
}: {
	gearIcon: ReactNode;
	completedCount?: number;
	totalCount?: number;
	totalTagsRemoved?: number;
	elapsedSeconds?: number;
	onCleanMore?: () => void;
}): React.JSX.Element {
	const hasStats =
		totalCount !== undefined && totalCount > 0 && completedCount !== undefined;

	return (
		<footer className="status-bar">
			<div className="status-bar__left">{gearIcon}</div>
			{hasStats && (
				<>
					<div className="status-bar__summary">
						<span className="status-bar__count">{completedCount}</span>{" "}
						of{" "}
						<span className="status-bar__count">{totalCount}</span>{" "}
						cleaned{" \u2014 "}
						<span className="status-bar__count">
							{totalTagsRemoved ?? 0}
						</span>{" "}
						tags removed{" \u2014 "}
						<span className="status-bar__count">
							{elapsedSeconds ?? 0}
						</span>
						s
					</div>
					{onCleanMore !== undefined && (
						<button
							className="status-bar__button"
							type="button"
							onClick={onCleanMore}
							aria-label="Clear all results"
						>
							Clear
						</button>
					)}
				</>
			)}
		</footer>
	);
}
