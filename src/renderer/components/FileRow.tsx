// Single file row with 5 columns: NAME, TYPE, SIZE, BEFORE, AFTER.
// Supports expansion for error details and metadata info.

import { useRef } from "react";
import type { FileEntry } from "../contexts/AppContext";
import { FileProcessingStatus } from "../../domain/file_status";
import { TypePill } from "./TypePill";
import { StatusIcon } from "./StatusIcon";
import { ErrorExpansion } from "./ErrorExpansion";
import { formatFileSize } from "../utils/format_file_size";

export function FileRow({
	file,
	isExpanded,
	onToggleExpand,
	staggerIndex,
	animatedCheckRef,
	onCopyToast,
}: {
	file: FileEntry;
	isExpanded: boolean;
	onToggleExpand: () => void;
	staggerIndex: number;
	animatedCheckRef: React.RefObject<Set<string>>;
	onCopyToast: () => void;
}): React.JSX.Element {
	const enteringRef = useRef(true);

	const isComplete =
		file.status === FileProcessingStatus.Complete ||
		file.status === FileProcessingStatus.NoMetadataFound;
	const isError = file.status === FileProcessingStatus.Error;

	const rowClasses = [
		"file-table__row",
		isComplete ? "file-table__row--complete" : "",
		isError ? "file-table__row--error" : "",
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
			onToggleExpand();
		} else if (e.key === "Escape" && isExpanded) {
			e.preventDefault();
			onToggleExpand();
		}
	}

	// Determine if checkmark should animate (one-shot via ref)
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
				style={
					{
						"--ec-stagger-delay": `${staggerIndex * 30}ms`,
					} as React.CSSProperties
				}
				tabIndex={0}
				role="row"
				onClick={onToggleExpand}
				onKeyDown={handleKeyDown}
			>
				<div className="file-table__cell file-table__cell--status">
					<StatusIcon status={file.status} shouldAnimate={shouldAnimateCheck} />
				</div>
				<div className="file-table__cell file-table__cell--name">
					{file.name}
				</div>
				<div className="file-table__cell">
					<TypePill extension={file.extension} />
				</div>
				<div className="file-table__cell">{formatFileSize(file.size)}</div>
				<div className="file-table__cell">{renderBeforeCell(file)}</div>
				<div className="file-table__cell">{renderAfterCell(file)}</div>
			</div>
			{isExpanded && isError && file.error !== null && (
				<ErrorExpansion error={file.error} onCopy={onCopyToast} />
			)}
			{isExpanded && isComplete && (
				<div className="file-table__expansion">
					<span className="file-table__cell--muted">
						Metadata details available in a future update
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
			return <span className="file-table__cell--muted">--</span>;
		default:
			return <>{file.beforeTags ?? "--"}</>;
	}
}

function renderAfterCell(file: FileEntry): React.JSX.Element {
	switch (file.status) {
		case FileProcessingStatus.Pending:
		case FileProcessingStatus.Reading:
		case FileProcessingStatus.Processing:
			return <span className="file-table__cell--muted">--</span>;
		case FileProcessingStatus.Complete:
		case FileProcessingStatus.NoMetadataFound:
			return <>{file.afterTags ?? "--"}</>;
		case FileProcessingStatus.Error:
			return <span className="file-table__cell--muted">--</span>;
		default: {
			const _exhaustive: never = file.status;
			throw new Error(`Unhandled status: ${_exhaustive}`);
		}
	}
}
