// Bottom status bar with gear icon (left), progress summary, and "Clear" button (right).
// Renders persistently across both EmptyState and FileTable views.

import type { ReactNode } from "react";
import { useI18n } from "../../hooks/use_i18n";

function interpolate(
	template: string,
	params: Record<string, string | number>,
): string {
	let result = template;
	for (const [key, value] of Object.entries(params)) {
		result = result.replace(`{${key}}`, String(value));
	}
	return result;
}

export function StatusBar({
	gearIcon,
	completedCount,
	totalCount,
	totalTagsRemoved,
	elapsedSeconds,
	onCleanMore,
}: {
	gearIcon: ReactNode;
	completedCount?: number | undefined;
	totalCount?: number | undefined;
	totalTagsRemoved?: number | undefined;
	elapsedSeconds?: number | undefined;
	onCleanMore?: (() => void) | undefined;
}): React.JSX.Element {
	const { t } = useI18n();
	const hasStats =
		totalCount !== undefined && totalCount > 0 && completedCount !== undefined;

	return (
		<footer className="status-bar">
			<div className="status-bar__left">{gearIcon}</div>
			{hasStats && (
				<>
					<div className="status-bar__summary">
						{interpolate(t("statusBar.xOfYCleaned"), {
							completed: completedCount,
							total: totalCount,
						})}
						{" \u2014 "}
						{interpolate(t("statusBar.tagsRemoved"), {
							count: totalTagsRemoved ?? 0,
						})}
						{" \u2014 "}
						{interpolate(t("statusBar.elapsed"), {
							seconds: elapsedSeconds ?? 0,
						})}
					</div>
					{onCleanMore !== undefined && (
						<button
							className="status-bar__button"
							type="button"
							onClick={onCleanMore}
							aria-label={t("statusBar.clear")}
						>
							{t("statusBar.clear")}
						</button>
					)}
				</>
			)}
		</footer>
	);
}
