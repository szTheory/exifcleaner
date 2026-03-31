import React from "react";

export const GearIcon = React.forwardRef<
	HTMLButtonElement,
	{ isOpen: boolean; onClick: () => void }
>(function GearIcon({ isOpen, onClick }, ref): React.JSX.Element {
	return (
		<button
			ref={ref}
			className="gear-icon"
			onClick={onClick}
			aria-label={isOpen ? "Close settings" : "Open settings"}
			type="button"
		>
			<svg
				width="16"
				height="16"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<circle cx="8" cy="8" r="2.5" />
				<path d="M6.69 1.74a.94.94 0 0 1 .93-.74h.76a.94.94 0 0 1 .93.74l.17.83a5.2 5.2 0 0 1 .86.5l.8-.27a.94.94 0 0 1 1.05.38l.38.66a.94.94 0 0 1-.12 1.12l-.63.56a5.3 5.3 0 0 1 0 1l.63.56a.94.94 0 0 1 .12 1.12l-.38.66a.94.94 0 0 1-1.05.38l-.8-.27a5.2 5.2 0 0 1-.86.5l-.17.83a.94.94 0 0 1-.93.74h-.76a.94.94 0 0 1-.93-.74l-.17-.83a5.2 5.2 0 0 1-.86-.5l-.8.27a.94.94 0 0 1-1.05-.38l-.38-.66a.94.94 0 0 1 .12-1.12l.63-.56a5.3 5.3 0 0 1 0-1l-.63-.56A.94.94 0 0 1 3.43 4l.38-.66a.94.94 0 0 1 1.05-.38l.8.27a5.2 5.2 0 0 1 .86-.5l.17-.83Z" />
			</svg>
		</button>
	);
});
