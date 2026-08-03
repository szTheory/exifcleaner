import type { MetadataDiffField, MetadataDiffGroup } from "../../../domain";
import { MetadataField } from "./MetadataField";

export function MetadataGroup({
	group,
	friendlyName,
	fields,
	i18nLookup,
}: {
	group: MetadataDiffGroup;
	friendlyName: string;
	fields: readonly MetadataDiffField[];
	i18nLookup: (key: string) => string;
}): React.JSX.Element {
	return (
		<div className="metadata-group">
			<div className="metadata-group__header" title={group.rawGroupName}>
				<span className="metadata-group__name">{friendlyName}</span>
				<span className="metadata-group__count">({fields.length})</span>
			</div>
			<div className="metadata-group__fields">
				{fields.map((field) => (
					<MetadataField
						key={field.name}
						field={field}
						i18nLookup={i18nLookup}
					/>
				))}
			</div>
		</div>
	);
}
