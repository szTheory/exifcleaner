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
					{/*
					  Segments carry data-stat so tests can address a value without
					  matching translated prose. Asserting on the rendered sentence
					  only works in the locale the assertion was written in, and the
					  app follows the host system locale \u2014 so such a test passes in CI
					  and fails for any contributor whose machine is not English.
					*/}
					<div className="status-bar__summary">
						<span data-stat="cleaned">
							{interpolate(t("statusBar.xOfYCleaned"), {
								completed: completedCount,
								total: totalCount,
							})}
						</span>
						{" \u2014 "}
						<span data-stat="tags-removed" data-value={totalTagsRemoved ?? 0}>
							{interpolate(t("statusBar.tagsRemoved"), {
								count: totalTagsRemoved ?? 0,
							})}
						</span>
						{" \u2014 "}
						<span data-stat="elapsed">
							{interpolate(t("statusBar.elapsed"), {
								seconds: elapsedSeconds ?? 0,
							})}
						</span>
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
