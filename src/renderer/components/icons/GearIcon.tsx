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
				{/*
				  8-tooth gear generated on a polar grid about (8,8), so the hub is
				  concentric with the body by construction rather than by hand-tuned arc
				  parameters. The previous path was neither symmetric nor centred: its body
				  spanned y 1.00-11.04 (centre 6.02) against a hub at y=8, so the hub sat
				  ~2 units low and the bottom third of the frame was empty.

				  Tips at r=7.0, roots at r=5.0, hub r=2.4. Tip radius plus half the 1.5
				  stroke reaches 7.66, inside the 8-unit half-frame, so nothing clips.
				  Corners are softened by stroke-linejoin="round", which is why the outline
				  is a plain polygon needing no arc commands.
				*/}
				<circle cx="8" cy="8" r="2.4" />
				<path d="M6.85 1.09L9.15 1.09L8.82 3.07L10.91 3.93L12.07 2.3L13.7 3.93L12.07 5.09L12.93 7.18L14.91 6.85L14.91 9.15L12.93 8.82L12.07 10.91L13.7 12.07L12.07 13.7L10.91 12.07L8.82 12.93L9.15 14.91L6.85 14.91L7.18 12.93L5.09 12.07L3.93 13.7L2.3 12.07L3.93 10.91L3.07 8.82L1.09 9.15L1.09 6.85L3.07 7.18L3.93 5.09L2.3 3.93L3.93 2.3L5.09 3.93L7.18 3.07Z" />
			</svg>
		</button>
	);
});
