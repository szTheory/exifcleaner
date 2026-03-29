import { useI18n } from "../hooks/use_i18n";

export function EmptyState(): React.JSX.Element {
	const { t } = useI18n();
	return (
		<section className="empty-state" aria-label={t("empty.title")}>
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
				<h1 className="empty-state__title">{t("empty.title")}</h1>
				<p className="empty-state__subtitle">{t("empty.subtitle")}</p>
			</div>
		</section>
	);
}
