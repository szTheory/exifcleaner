import symbolDark from "../../assets/brand/exifcleaner-symbol-dark.svg?no-inline";
import symbolLight from "../../assets/brand/exifcleaner-symbol-light.svg?no-inline";
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
				<img
					className="empty-state__icon empty-state__icon--light"
					src={symbolLight}
					alt=""
				/>
				<img
					className="empty-state__icon empty-state__icon--dark"
					src={symbolDark}
					alt=""
				/>
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
