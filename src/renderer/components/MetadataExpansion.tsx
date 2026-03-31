// Container for metadata before/after diff with grouped display and copy-all button.
// Renders MetadataGroup components for each ExifTool family 2 category.

import { useMemo } from "react";
import { computeMetadataDiff } from "../../domain/metadata_groups";
import { MetadataGroup } from "./MetadataGroup";
import "../styles/metadata_expansion.css";

export function MetadataExpansion({
	beforeMetadata,
	afterMetadata,
	onCopy,
	i18nLookup,
}: {
	beforeMetadata: Record<string, unknown>;
	afterMetadata: Record<string, unknown>;
	onCopy: () => void;
	i18nLookup: (key: string) => string;
}): React.JSX.Element {
	const groups = useMemo(
		() => computeMetadataDiff(beforeMetadata, afterMetadata),
		[beforeMetadata, afterMetadata],
	);

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
				lines.push(
					`${prefix} ${friendlyName}: ${field.name} = ${valueStr}`,
				);
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
				<button
					className="metadata-expansion__copy-btn"
					type="button"
					onClick={handleCopyAll}
				>
					{i18nLookup("copyAll")}
				</button>
			</div>
			<div className="metadata-expansion__content">
				{groups.map((group) => (
					<MetadataGroup
						key={group.rawGroupName}
						group={group}
						friendlyName={
							i18nLookup(group.friendlyNameKey) ||
							group.rawGroupName
						}
					/>
				))}
			</div>
		</div>
	);
}
