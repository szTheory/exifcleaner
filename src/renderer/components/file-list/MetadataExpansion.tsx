import { useMemo } from "react";
import { computeMetadataDiff } from "../../../domain";
import { MetadataGroup } from "./MetadataGroup";
import "../../styles/metadata_expansion.css";

export function MetadataExpansion({
	beforeMetadata,
	afterMetadata,
	onCopy,
	i18nLookup,
	locale,
}: {
	beforeMetadata: Record<string, unknown>;
	afterMetadata: Record<string, unknown>;
	onCopy: () => void;
	i18nLookup: (key: string) => string;
	locale: string;
}): React.JSX.Element {
	const groups = useMemo(
		() => computeMetadataDiff({ before: beforeMetadata, after: afterMetadata }),
		[beforeMetadata, afterMetadata],
	);
	const removedCount = groups.reduce(
		(total, group) => total + group.removedCount,
		0,
	);
	const presentCount = groups.reduce(
		(total, group) => total + group.totalCount - group.removedCount,
		0,
	);
	const removedGroups = groups
		.map((group) => ({
			group,
			fields: group.fields.filter((field) => field.removed),
		}))
		.filter(({ fields }) => fields.length > 0);
	const presentGroups = groups
		.map((group) => ({
			group,
			fields: group.fields.filter((field) => !field.removed),
		}))
		.filter(({ fields }) => fields.length > 0);
	const removedSummary = formatMetadataCount({
		count: removedCount,
		locale,
		baseKey: "metadata.removed",
		i18nLookup,
	});
	const presentSummary = formatMetadataCount({
		count: presentCount,
		locale,
		baseKey: "metadata.present",
		i18nLookup,
	});

	function handleCopyAll(): void {
		const lines: string[] = [];
		for (const group of groups) {
			const friendlyName =
				i18nLookup(group.friendlyNameKey) || group.rawGroupName;
			for (const field of group.fields) {
				const prefix = field.removed ? "[-]" : "[+]";
				const valueStr =
					field.value === null || field.value === undefined
						? ""
						: typeof field.value === "string"
							? field.value
							: JSON.stringify(field.value);
				lines.push(`${prefix} ${friendlyName}: ${field.name} = ${valueStr}`);
			}
		}
		navigator.clipboard.writeText(lines.join("\n")).then(onCopy, () => {
			// Clipboard write failed silently
		});
	}

	if (groups.length === 0) {
		return (
			<div className="metadata-expansion">
				<span className="metadata-expansion__empty">
					{i18nLookup("noMetadataFound")}
				</span>
			</div>
		);
	}

	return (
		<div className="metadata-expansion">
			<div className="metadata-expansion__header">
				<p className="metadata-expansion__summary">
					{removedSummary} · {presentSummary}
				</p>
				<button
					className="metadata-expansion__copy-btn"
					type="button"
					onClick={handleCopyAll}
				>
					{i18nLookup("copyAll")}
				</button>
			</div>
			<div className="metadata-expansion__content">
				{removedGroups.map(({ group, fields }) => (
					<MetadataGroup
						key={group.rawGroupName}
						group={group}
						fields={fields}
						friendlyName={
							i18nLookup(group.friendlyNameKey) || group.rawGroupName
						}
						i18nLookup={i18nLookup}
					/>
				))}
				{presentGroups.length > 0 && (
					<details className="metadata-expansion__present">
						<summary>{presentSummary}</summary>
						<div className="metadata-expansion__present-groups">
							{presentGroups.map(({ group, fields }) => (
								<MetadataGroup
									key={group.rawGroupName}
									group={group}
									fields={fields}
									friendlyName={
										i18nLookup(group.friendlyNameKey) || group.rawGroupName
									}
									i18nLookup={i18nLookup}
								/>
							))}
						</div>
					</details>
				)}
			</div>
		</div>
	);
}

export function formatMetadataCount({
	count,
	locale,
	baseKey,
	i18nLookup,
}: {
	count: number;
	locale: string;
	baseKey: string;
	i18nLookup: (key: string) => string;
}): string {
	const category = new Intl.PluralRules(locale).select(count);
	const categoryKey = `${baseKey}.${category}`;
	const localized = i18nLookup(categoryKey);
	const template =
		localized === categoryKey ? i18nLookup(`${baseKey}.other`) : localized;
	return template.replace("{count}", String(count));
}
