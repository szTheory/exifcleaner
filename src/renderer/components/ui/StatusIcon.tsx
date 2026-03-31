// Status icon for file processing states: pending dot, spinner, checkmark, circle-X.

import { FileProcessingStatus } from "../../../domain";

export function StatusIcon({
	status,
	shouldAnimate,
}: {
	status: FileProcessingStatus;
	shouldAnimate: boolean;
}): React.JSX.Element {
	switch (status) {
		case FileProcessingStatus.Pending:
			return (
				<span className="status-icon">
					<svg
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						role="img"
						aria-label="Pending"
					>
						<circle cx="8" cy="8" r="4" fill="var(--ec-color-muted)" />
					</svg>
				</span>
			);

		case FileProcessingStatus.Reading:
		case FileProcessingStatus.Processing:
			return (
				<span className="status-icon">
					<span
						className="status-icon__spinner"
						role="img"
						aria-label="Processing"
					/>
				</span>
			);

		case FileProcessingStatus.Complete:
		case FileProcessingStatus.NoMetadataFound: {
			const checkClass = shouldAnimate
				? "status-icon__check status-icon__check--animate"
				: "status-icon__check";
			return (
				<span className="status-icon">
					<svg
						className={checkClass}
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						role="img"
						aria-label="Complete"
					>
						<path
							d="M3.5 8.5L6.5 11.5L12.5 4.5"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</span>
			);
		}

		case FileProcessingStatus.Error:
			return (
				<span className="status-icon">
					<svg
						className="status-icon__error"
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						role="img"
						aria-label="Error"
					>
						<circle
							cx="8"
							cy="8"
							r="7"
							stroke="currentColor"
							strokeWidth="1.5"
						/>
						<path
							d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
						/>
					</svg>
				</span>
			);

		default: {
			const _exhaustive: never = status;
			throw new Error(`Unhandled status: ${_exhaustive}`);
		}
	}
}
