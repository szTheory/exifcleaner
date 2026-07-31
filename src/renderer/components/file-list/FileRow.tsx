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
import { resolveRevealTargets } from "../../utils/reveal_paths";
import { useI18n } from "../../hooks/use_i18n";

export function FileRow({
	file,
	isExpanded,
	onToggleExpand,
	staggerIndex,
	animatedCheckRef,
	onCopyToast,
	onRevealError,
}: {
	file: FileEntry;
	isExpanded: boolean;
	onToggleExpand: () => void;
	staggerIndex: number;
	animatedCheckRef: React.RefObject<Set<string>>;
	onCopyToast: () => void;
	onRevealError?: (message: string) => void;
}): React.JSX.Element {
	const enteringRef = useRef(true);
	const { t } = useI18n();
	const revealTargets = resolveRevealTargets(file);

	const isComplete =
		file.status === FileProcessingStatus.Complete ||
		file.status === FileProcessingStatus.NoMetadataFound;
	const isError = file.status === FileProcessingStatus.Error;
	const isExpandable = isComplete || isError;
	const isForcedCopy = isComplete && file.wasForcedCopy === true;
	const failureSummary =
		file.failureKind === "verification"
			? t("verificationFailedSummary")
			: file.failureKind === "cleanup"
				? t("cleanupFailedSummary")
				: undefined;
	const errorDetail =
		file.failureKind === "cleanup" && file.detail !== undefined && file.residualPath !== undefined
			? `${file.detail}: ${file.residualPath}`
			: (file.detail ?? file.error);

	const rowClasses = [
		"file-table__row",
		isComplete ? "file-table__row--complete" : "",
		isError ? "file-table__row--error" : "",
		isExpandable ? "file-table__row--expandable" : "",
		isForcedCopy ? "file-table__row--forced-copy" : "",
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
		window.api.reveal.showInFolder(revealTargets.primaryPath).then((result) => {
			if (!result.success && result.error !== undefined) {
				onRevealError?.(result.error);
			}
		});
	}

	function handleRevealContextMenu(): void {
		if (revealTargets.contextPaths === null) return;
		window.api.reveal.showContextMenu(revealTargets.contextPaths);
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
				aria-label={
					isForcedCopy
						? `${t("complete")}. ${t("writtenToCopy")}.`
						: failureSummary
				}
				onClick={isExpandable ? onToggleExpand : undefined}
				onKeyDown={handleKeyDown}
			>
				<div className="file-table__cell file-table__cell--status">
					{isError ? (
						<StatusIcon
							status={file.status}
							shouldAnimate={false}
							{...(failureSummary === undefined
								? {}
								: { accessibleLabel: failureSummary })}
						/>
					) : isExpandable ? (
						<ChevronIcon expanded={isExpanded} />
					) : (
						<StatusIcon
							status={file.status}
							shouldAnimate={shouldAnimateCheck}
						/>
					)}
				</div>
				<div className="file-table__cell file-table__cell--name">
					<div className="file-table__name-stack">
						<span className="file-table__name-text">{file.name}</span>
						{isForcedCopy && (
							<span className="file-table__copy-disclosure">
								{t("writtenToCopy")}
							</span>
						)}
						{failureSummary !== undefined && (
							<span className="file-table__error-summary">{failureSummary}</span>
						)}
					</div>
				</div>
				<div className="file-table__cell">
					<TypePill extension={file.extension} />
				</div>
				<div className="file-table__cell file-table__cell--size">
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
									e.stopPropagation();
									handleRevealClick();
								}
							}}
							aria-label={
								revealTargets.contextPaths === null
									? "Reveal in file manager"
									: "Reveal cleaned copy in file manager"
							}
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
			{isExpanded && isError && errorDetail !== null && (
				<ErrorExpansion error={errorDetail} onCopy={onCopyToast} />
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
