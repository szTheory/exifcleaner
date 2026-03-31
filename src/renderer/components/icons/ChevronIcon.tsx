// Rotatable chevron SVG for expandable rows and groups.
// Right-pointing (>) rotates to downward (v) when expanded.

export function ChevronIcon({
	expanded,
	className,
}: {
	expanded: boolean;
	className?: string;
}): React.JSX.Element {
	return (
		<svg
			className={`chevron-icon${expanded ? " chevron-icon--expanded" : ""}${className ? ` ${className}` : ""}`}
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<polyline points="4,2 8,6 4,10" />
		</svg>
	);
}
