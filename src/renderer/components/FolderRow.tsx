// Folder grouping row with collapsible chevron toggle and discovery status.

import type { FolderDiscoveryStatus } from "../contexts/AppContext";
import { middleTruncatePath } from "../../domain/path_truncation";
import { ChevronIcon } from "./ChevronIcon";

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
	const displayLabel = middleTruncatePath(folder, 40);

	return (
		<div className="folder-row">
			<button
				className="folder-row__toggle"
				onClick={onToggle}
				aria-label={isCollapsed ? `Expand ${folder}` : `Collapse ${folder}`}
			>
				<ChevronIcon expanded={!isCollapsed} />
			</button>
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

function renderCount(
	status: FolderDiscoveryStatus,
	fileCount: number,
): string {
	switch (status) {
		case "scanning":
			return "Scanning\u2026";
		case "discovering":
			return `${fileCount} found\u2026`;
		case "complete":
			return `${fileCount} files`;
		case "empty":
			return "0 supported files";
		default: {
			const _exhaustive: never = status;
			throw new Error(`Unhandled status: ${_exhaustive}`);
		}
	}
}
