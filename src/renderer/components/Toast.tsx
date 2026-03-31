// Simple notification toast for clipboard copy confirmation.

export function Toast({
	message,
	visible,
}: {
	message: string;
	visible: boolean;
}): React.JSX.Element {
	return (
		<div
			className={`toast ${visible ? "toast--visible" : "toast--hidden"}`}
			role="status"
			aria-live="polite"
		>
			{message}
		</div>
	);
}
