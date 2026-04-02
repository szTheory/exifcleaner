// Collapsible metadata category group with header showing "X of Y removed" count.
// All groups collapsed by default per D-26.

import { useState } from "react";
import type { MetadataDiffGroup } from "../../../domain";
import { MetadataField } from "./MetadataField";
import { ChevronIcon } from "../icons/ChevronIcon";

export function MetadataGroup({
	group,
	friendlyName,
}: {
	group: MetadataDiffGroup;
	friendlyName: string;
}): React.JSX.Element {
	const [isOpen, setIsOpen] = useState(false);

	function handleKeyDown(e: React.KeyboardEvent): void {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			setIsOpen((prev) => !prev);
		}
	}

	return (
		<div className="metadata-group">
			<button
				className="metadata-group__header"
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				onKeyDown={handleKeyDown}
				aria-expanded={isOpen}
				title={group.rawGroupName}
			>
				<ChevronIcon expanded={isOpen} />
				<span className="metadata-group__name">{friendlyName}</span>
				<span className="metadata-group__count">
					({group.removedCount} of {group.totalCount} removed)
				</span>
			</button>
			<div
				className={`metadata-group__fields${isOpen ? " metadata-group__fields--open" : ""}`}
			>
				{isOpen &&
					group.fields.map((field) => (
						<MetadataField key={field.name} field={field} />
					))}
			</div>
		</div>
	);
}
