import "../../styles/segmented_control.css";

interface SegmentOption<T extends string> {
	value: T;
	label: string;
	icon: React.JSX.Element;
}

export function SegmentedControl<const T extends string>({
	options,
	value,
	onChange,
	label,
}: {
	options: SegmentOption<T>[];
	value: T;
	onChange: (value: T) => void;
	label: string;
}): React.JSX.Element {
	const activeIndex = options.findIndex((o) => o.value === value);

	function handleKeyDown(e: React.KeyboardEvent, index: number): void {
		if (e.key === "ArrowRight" || e.key === "ArrowDown") {
			e.preventDefault();
			const next = (index + 1) % options.length;
			const nextOption = options[next];
			if (nextOption !== undefined) {
				onChange(nextOption.value);
			}
		} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
			e.preventDefault();
			const prev = (index - 1 + options.length) % options.length;
			const prevOption = options[prev];
			if (prevOption !== undefined) {
				onChange(prevOption.value);
			}
		}
	}

	return (
		<div role="radiogroup" aria-label={label} className="segmented-control">
			{options.map((option, index) => (
				<button
					key={option.value}
					role="radio"
					type="button"
					aria-checked={value === option.value}
					className={`segmented-control__segment${value === option.value ? " segmented-control__segment--active" : ""}`}
					onClick={() => onChange(option.value)}
					onKeyDown={(e) => handleKeyDown(e, index)}
					tabIndex={value === option.value ? 0 : -1}
				>
					{option.icon}
					<span className="segmented-control__label">{option.label}</span>
				</button>
			))}
			<div
				className="segmented-control__indicator"
				style={{ transform: `translateX(${activeIndex * 100}%)` }}
			/>
		</div>
	);
}
