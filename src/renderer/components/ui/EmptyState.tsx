import { useI18n } from "../../hooks/use_i18n";

interface EmptyStateProps {
	dragActive: boolean;
	onChooseFiles: () => void;
	onChooseFolder: () => void;
	saveAsCopy: boolean | null;
}

export function EmptyState({
	dragActive,
	onChooseFiles,
	onChooseFolder,
	saveAsCopy,
}: EmptyStateProps): React.JSX.Element {
	const { t } = useI18n();
	return (
		<section className="empty-state" aria-labelledby="empty-state-title">
			<div className="empty-state__inner">
				<svg
					className="empty-state__icon"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					aria-hidden="true"
				>
					<path
						fill="currentColor"
						fillRule="evenodd"
						d="M12.002 4h-10a1 1 0 00-1 1v8l2.646-2.354a.5.5 0 01.63-.062l2.66 1.773 3.71-3.71a.5.5 0 01.577-.094l1.777 1.947V5a1 1 0 00-1-1zm-10-1a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2h-10zm4 4.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
					/>
					<path
						fill="currentColor"
						fillRule="evenodd"
						d="M4 2h10a1 1 0 011 1v8a1 1 0 01-1 1v1a2 2 0 002-2V3a2 2 0 00-2-2H4a2 2 0 00-2 2h1a1 1 0 011-1z"
					/>
				</svg>
				<h1 className="empty-state__title" id="empty-state-title">
					{t("empty.title")}
				</h1>
				<div className="empty-state__instructions" aria-live="polite">
					<p className="empty-state__instruction" aria-hidden={dragActive}>
						{t("empty.subtitle")}
					</p>
					<p className="empty-state__instruction" aria-hidden={!dragActive}>
						{t("empty.dropActive")}
					</p>
				</div>
				<div className="empty-state__actions">
					<button
						type="button"
						className="empty-state__button empty-state__button--primary"
						onClick={onChooseFiles}
					>
						{t("intake.chooseFiles")}
					</button>
					<button
						type="button"
						className="empty-state__button empty-state__button--secondary"
						onClick={onChooseFolder}
					>
						{t("intake.chooseFolder")}
					</button>
				</div>
				<p
					className="empty-state__output-mode"
					aria-hidden={saveAsCopy === null}
				>
					{saveAsCopy === null
						? "\u00a0"
						: t(saveAsCopy ? "intake.outputCopy" : "intake.outputOverwrite")}
				</p>
			</div>
		</section>
	);
}
