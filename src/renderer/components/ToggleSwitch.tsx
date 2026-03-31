import "../styles/toggle_switch.css";

export function ToggleSwitch({
	id,
	checked,
	onChange,
	label,
	description,
}: {
	id: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	description: string;
}): React.JSX.Element {
	return (
		<label className="toggle-switch" htmlFor={id}>
			<div className="toggle-switch__text">
				<span className="toggle-switch__label">{label}</span>
				<span className="toggle-switch__description">{description}</span>
			</div>
			<div className="toggle-switch__control-wrapper">
				<input
					type="checkbox"
					role="switch"
					id={id}
					className="toggle-switch__input"
					checked={checked}
					onChange={() => onChange(!checked)}
					aria-checked={checked}
					aria-label={label}
				/>
				<div
					className={`toggle-switch__track${checked ? " toggle-switch__track--on" : ""}`}
				>
					<div className="toggle-switch__thumb" />
				</div>
			</div>
		</label>
	);
}
