// Folder grouping row with collapsible chevron toggle and discovery status.

import type { FolderDiscoveryStatus } from "../../contexts/AppContext";
import { middleTruncatePath } from "../../../domain";
import { assertNever } from "../../../common/types";
import { ChevronIcon } from "../icons/ChevronIcon";
import { useI18n } from "../../hooks/use_i18n";

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
	const { t } = useI18n();
	const displayLabel = middleTruncatePath({
		folderPath: folder,
		maxLength: 40,
	});

	return (
		<div className="folder-row" role="row">
			<div className="folder-row__cell" role="cell">
				<button
					className="folder-row__toggle"
					onClick={onToggle}
					aria-label={t(
						isCollapsed ? "folder.expand" : "folder.collapse",
					).replace("{folder}", folder)}
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
				<bdi className="folder-row__label" title={folder} dir="auto">
					{displayLabel}
				</bdi>
				<span
					className={`folder-row__count${discoveryStatus === "scanning" ? " folder-row__count--scanning" : ""}`}
					aria-live="polite"
				>
					{renderCount(discoveryStatus, fileCount, t)}
				</span>
			</div>
		</div>
	);
}

function renderCount(
	status: FolderDiscoveryStatus,
	fileCount: number,
	t: (key: string) => string,
): string {
	switch (status) {
		case "scanning":
			return t("folder.scanning");
		case "discovering":
			return t("folder.found").replace("{count}", String(fileCount));
		case "complete":
			return t("folder.files").replace("{count}", String(fileCount));
		case "empty":
			return t("folder.supportedFiles").replace("{count}", "0");
		default:
			return assertNever({ value: status });
	}
}
