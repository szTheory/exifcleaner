// Single file row with 5 columns: NAME, TYPE, SIZE, BEFORE, AFTER.
// Supports expansion for error details and metadata inspection.

import { useRef } from "react";
import type { FileEntry } from "../../contexts/AppContext";
import { FileProcessingStatus } from "../../../domain";
import { assertNever } from "../../../common/types";
import { TypePill } from "../ui/TypePill";
import { StatusIcon } from "../ui/StatusIcon";
import { ChevronIcon } from "../icons/ChevronIcon";
import { ErrorExpansion } from "./ErrorExpansion";
import { MetadataExpansion } from "./MetadataExpansion";
import { formatFileSize } from "../../utils/format_file_size";
import { useI18n } from "../../hooks/use_i18n";

function computeCleanedPath(filePath: string): string {
	const lastSep = Math.max(
		filePath.lastIndexOf("/"),
		filePath.lastIndexOf("\\"),
	);
	const dir = lastSep >= 0 ? filePath.slice(0, lastSep) : "";
	const filename = lastSep >= 0 ? filePath.slice(lastSep + 1) : filePath;
	const dotIndex = filename.lastIndexOf(".");
	const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
	const ext = dotIndex > 0 ? filename.slice(dotIndex) : "";
	const sep = lastSep >= 0 ? filePath[lastSep] : "/";
	const prefix = dir ? `${dir}${sep}` : "";
	return `${prefix}${base}_cleaned${ext}`;
}

export function FileRow({
	file,
	isExpanded,
	onToggleExpand,
	staggerIndex,
	animatedCheckRef,
	onCopyToast,
	saveAsCopy,
	onRevealError,
}: {
	file: FileEntry;
	isExpanded: boolean;
	onToggleExpand: () => void;
	staggerIndex: number;
	animatedCheckRef: React.RefObject<Set<string>>;
	onCopyToast: () => void;
	saveAsCopy?: boolean;
	onRevealError?: (message: string) => void;
}): React.JSX.Element {
	const enteringRef = useRef(true);
	const { t } = useI18n();

	const isComplete =
		file.status === FileProcessingStatus.Complete ||
		file.status === FileProcessingStatus.NoMetadataFound;
	const isError = file.status === FileProcessingStatus.Error;
	const isExpandable = isComplete || isError;

	const rowClasses = [
		"file-table__row",
		isComplete ? "file-table__row--complete" : "",
		isError ? "file-table__row--error" : "",
		isExpandable ? "file-table__row--expandable" : "",
		enteringRef.current ? "file-table__row--entering" : "",
	]
		.filter(Boolean)
		.join(" ");

	function handleAnimationEnd(): void {
		enteringRef.current = false;
	}

	function handleKeyDown(e: React.KeyboardEvent): void {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			if (isExpandable) {
				onToggleExpand();
			}
		} else if (e.key === "Escape" && isExpanded) {
			e.preventDefault();
			onToggleExpand();
		}
	}

	function handleRevealClick(): void {
		const targetPath =
			saveAsCopy === true ? computeCleanedPath(file.path) : file.path;
		window.api.reveal.showInFolder(targetPath).then((result) => {
			if (!result.success && result.error !== undefined) {
				onRevealError?.(result.error);
			}
		});
	}

	function handleRevealContextMenu(): void {
		if (saveAsCopy !== true) return;
		window.api.reveal.showContextMenu({
			cleanedPath: computeCleanedPath(file.path),
			originalPath: file.path,
		});
	}

	const progressStyle: React.CSSProperties = {
		"--ec-stagger-delay": `${staggerIndex * 30}ms`,
	};

	let shouldAnimateCheck = false;
	if (isComplete && !animatedCheckRef.current.has(file.id)) {
		shouldAnimateCheck = true;
		animatedCheckRef.current.add(file.id);
	}

	return (
		<div
			title={isError ? (file.error ?? undefined) : undefined}
			onAnimationEnd={handleAnimationEnd}
		>
			<div
				className={rowClasses}
				style={progressStyle}
				tabIndex={0}
				role="row"
				onClick={isExpandable ? onToggleExpand : undefined}
				onKeyDown={handleKeyDown}
			>
				<div className="file-table__cell file-table__cell--status">
					{isExpandable ? (
						<ChevronIcon expanded={isExpanded} />
					) : (
						<StatusIcon
							status={file.status}
							shouldAnimate={shouldAnimateCheck}
						/>
					)}
				</div>
				<div className="file-table__cell file-table__cell--name">
					{file.name}
				</div>
				<div className="file-table__cell">
					<TypePill extension={file.extension} />
				</div>
				<div className="file-table__cell">
					{formatFileSize({ bytes: file.size })}
				</div>
				<div className="file-table__cell">{renderBeforeCell(file)}</div>
				<div className="file-table__cell">
					{renderAfterCell(file, shouldAnimateCheck)}
					{isComplete && (
						<span
							className="file-table__reveal"
							onClick={(e) => {
								e.stopPropagation();
								handleRevealClick();
							}}
							onContextMenu={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handleRevealContextMenu();
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handleRevealClick();
								}
							}}
							aria-label="Reveal in file manager"
							role="button"
							tabIndex={0}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M7 3H3V13H13V9" />
								<path d="M10 2H14V6" />
								<path d="M14 2L7 9" />
							</svg>
						</span>
					)}
				</div>
			</div>
			{isExpanded && isError && file.error !== null && (
				<ErrorExpansion error={file.error} onCopy={onCopyToast} />
			)}
			{isExpanded &&
				isComplete &&
				file.status === FileProcessingStatus.Complete &&
				file.beforeMetadata !== null &&
				file.afterMetadata !== null && (
					<MetadataExpansion
						beforeMetadata={file.beforeMetadata}
						afterMetadata={file.afterMetadata}
						onCopy={onCopyToast}
						i18nLookup={t}
					/>
				)}
			{isExpanded &&
				isComplete &&
				file.status === FileProcessingStatus.NoMetadataFound && (
					<div className="file-table__expansion">
						<span className="metadata-expansion__empty">
							{t("noMetadataFound")}
						</span>
					</div>
				)}
		</div>
	);
}

function renderBeforeCell(file: FileEntry): React.JSX.Element {
	switch (file.status) {
		case FileProcessingStatus.Pending:
		case FileProcessingStatus.Reading:
			return <></>;
		default:
			return <>{file.beforeTags ?? ""}</>;
	}
}

function renderAfterCell(
	file: FileEntry,
	shouldAnimate: boolean,
): React.JSX.Element {
	switch (file.status) {
		case FileProcessingStatus.Pending:
		case FileProcessingStatus.Reading:
		case FileProcessingStatus.Processing:
			return <></>;
		case FileProcessingStatus.Complete:
		case FileProcessingStatus.NoMetadataFound:
			return (
				<span className="file-table__after-done">
					{file.afterTags ?? ""}
					<StatusIcon status={file.status} shouldAnimate={shouldAnimate} />
				</span>
			);
		case FileProcessingStatus.Error:
			return <></>;
		default:
			return assertNever({ value: file.status });
	}
}
