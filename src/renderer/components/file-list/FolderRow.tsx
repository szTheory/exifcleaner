// Folder grouping row with collapsible chevron toggle and discovery status.

import type { FolderDiscoveryStatus } from "../../contexts/AppContext";
import { middleTruncatePath } from "../../../domain";
import { assertNever } from "../../../common/types";
import { ChevronIcon } from "../icons/ChevronIcon";

export function FolderRow({
	folder,
	fileCount,
	isCollapsed,
	onToggle,
	discoveryStatus,
}: {
	folder: string;
	fileCount: number;
	isCollapsed: boolean;
	onToggle: () => void;
	discoveryStatus: FolderDiscoveryStatus;
}): React.JSX.Element {
	const displayLabel = middleTruncatePath({
		folderPath: folder,
		maxLength: 40,
	});

	return (
		<div className="folder-row">
			<button
				className="folder-row__toggle"
				onClick={onToggle}
				aria-label={isCollapsed ? `Expand ${folder}` : `Collapse ${folder}`}
			>
				<ChevronIcon expanded={!isCollapsed} />
			</button>
			<svg
				className="folder-row__icon"
				width="16"
				height="16"
				viewBox="0 0 16 16"
				fill="currentColor"
				aria-hidden="true"
			>
				<path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H7.707L6.354 3.146A.5.5 0 0 0 6 3H1.5z" />
			</svg>
			<span className="folder-row__label" title={folder}>
				{displayLabel}
			</span>
			<span
				className={`folder-row__count${discoveryStatus === "scanning" ? " folder-row__count--scanning" : ""}`}
				aria-live="polite"
			>
				{renderCount(discoveryStatus, fileCount)}
			</span>
		</div>
	);
}

function renderCount(status: FolderDiscoveryStatus, fileCount: number): string {
	switch (status) {
		case "scanning":
			return "Scanning\u2026";
		case "discovering":
			return `${fileCount} found\u2026`;
		case "complete":
			return `${fileCount} files`;
		case "empty":
			return "0 supported files";
		default:
			return assertNever({ value: status });
	}
}
