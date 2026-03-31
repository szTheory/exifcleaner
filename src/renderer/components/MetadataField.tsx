// Single metadata field row with removed/preserved indicator.
// Removed fields show red tint + minus icon, preserved show green tint + checkmark.

import type { MetadataDiffField } from "../../domain/metadata_groups";

export function MetadataField({
	field,
}: {
	field: MetadataDiffField;
}): React.JSX.Element {
	const valueStr = formatFieldValue(field.value);
	const truncated = valueStr.length > 80;
	const displayValue = truncated ? valueStr.slice(0, 80) + "\u2026" : valueStr;

	return (
		<div
			className={`metadata-field${field.removed ? " metadata-field--removed" : " metadata-field--preserved"}`}
			aria-label={`${field.name}: ${field.removed ? "removed" : "preserved"}`}
		>
			<span className="metadata-field__icon" aria-hidden="true">
				{field.removed ? "\u2212" : "\u2713"}
			</span>
			<span className="metadata-field__name">{field.name}</span>
			<span
				className="metadata-field__value"
				title={truncated ? valueStr : undefined}
			>
				{displayValue}
			</span>
		</div>
	);
}

function formatFieldValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	return JSON.stringify(value);
}
