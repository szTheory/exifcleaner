// Neutral extension badge for the file type column.

export function TypePill({
	extension,
}: {
	extension: string;
}): React.JSX.Element {
	return <span className="type-pill">{extension}</span>;
}
