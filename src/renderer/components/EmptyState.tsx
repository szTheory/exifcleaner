import { useI18n } from "../hooks/use_i18n";

export function EmptyState(): React.JSX.Element {
	const { t } = useI18n();
	return (
		<section className="empty-state" aria-label={t("empty.title")}>
			<div className="empty-state__inner">
				<h1 className="empty-state__title">{t("empty.title")}</h1>
				<p className="empty-state__subtitle">{t("empty.subtitle")}</p>
			</div>
		</section>
	);
}
