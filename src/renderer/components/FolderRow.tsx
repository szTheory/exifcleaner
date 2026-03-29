// Folder grouping row with collapsible chevron toggle.

export function FolderRow({
	folder,
	fileCount,
	isCollapsed,
	onToggle,
}: {
	folder: string;
	fileCount: number;
	isCollapsed: boolean;
	onToggle: () => void;
}): React.JSX.Element {
	const chevronClass = `folder-row__chevron${isCollapsed ? " folder-row__chevron--collapsed" : ""}`;

	return (
		<div className="folder-row">
			<button
				className="folder-row__toggle"
				onClick={onToggle}
				aria-label={isCollapsed ? `Expand ${folder}` : `Collapse ${folder}`}
			>
				<svg
					className={chevronClass}
					width="16"
					height="16"
					viewBox="0 0 16 16"
					fill="none"
				>
					<path
						d="M6 4L10 8L6 12"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>
			<span className="folder-row__label">{folder}</span>
			<span className="folder-row__count">{fileCount} files</span>
		</div>
	);
}
