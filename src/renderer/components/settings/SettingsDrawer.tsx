import { useState, useEffect, useRef, useCallback, useContext } from "react";
import type { Settings } from "../../../domain";
import { ToggleSwitch } from "./ToggleSwitch";
import { SegmentedControl } from "./SegmentedControl";
import { LanguageDropdown } from "./LanguageDropdown";
import { ThemeContext } from "../../contexts/ThemeContext";
import { I18nContext } from "../../contexts/I18nContext";
import "../../styles/settings_drawer.css";

function SunIcon(): React.JSX.Element {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<circle cx="8" cy="8" r="3" />
			<line x1="8" y1="1" x2="8" y2="3" />
			<line x1="8" y1="13" x2="8" y2="15" />
			<line x1="1" y1="8" x2="3" y2="8" />
			<line x1="13" y1="8" x2="15" y2="8" />
			<line x1="3.05" y1="3.05" x2="4.46" y2="4.46" />
			<line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
			<line x1="3.05" y1="12.95" x2="4.46" y2="11.54" />
			<line x1="11.54" y1="4.46" x2="12.95" y2="3.05" />
		</svg>
	);
}

function AutoIcon(): React.JSX.Element {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect x="2" y="3" width="12" height="10" rx="1" />
			<line x1="5" y1="14" x2="11" y2="14" />
		</svg>
	);
}

function MoonIcon(): React.JSX.Element {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M14 9.35A6 6 0 1 1 6.65 2 4.5 4.5 0 0 0 14 9.35Z" />
		</svg>
	);
}

export function SettingsDrawer({
	isOpen,
	onClose,
}: {
	isOpen: boolean;
	onClose: () => void;
}): React.JSX.Element | null {
	const [settings, setSettings] = useState<Settings | null>(null);
	const drawerRef = useRef<HTMLDivElement>(null);
	const isMac = window.api.platform.isMac;
	const { themeMode, setThemeMode } = useContext(ThemeContext);
	const { t } = useContext(I18nContext);

	// Load settings on mount
	useEffect(() => {
		window.api.settings.get().then(setSettings);
		const unsubscribe = window.api.settings.onChanged(setSettings);
		return unsubscribe;
	}, []);

	// Handle toggle change -- immediate persist (per D-19)
	const handleToggle = useCallback(
		(key: keyof Settings, value: boolean): void => {
			window.api.settings.set({ [key]: value });
		},
		[],
	);

	// Focus trap (per D-22)
	useEffect(() => {
		if (!isOpen || !drawerRef.current) return;

		const container = drawerRef.current;
		const focusable = container.querySelectorAll<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
		);
		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		// Focus first element on open
		first?.focus();

		function handleKeyDown(e: KeyboardEvent): void {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
				return;
			}
			if (e.key !== "Tab") return;
			if (!first || !last) return;
			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last.focus();
				}
			} else {
				if (document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		}

		container.addEventListener("keydown", handleKeyDown);
		return () => container.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	if (!settings) return null;

	return (
		<>
			{/* Backdrop (per D-01) */}
			<div
				className={`settings-drawer__backdrop${isOpen ? " settings-drawer__backdrop--visible" : ""}`}
				onClick={onClose}
				aria-hidden="true"
			/>

			{/* Drawer panel */}
			<div
				ref={drawerRef}
				className={`settings-drawer${isOpen ? " settings-drawer--open" : ""}`}
				role="dialog"
				aria-label="Settings"
				aria-modal="true"
			>
				{/* Header (per D-05) */}
				<div className="settings-drawer__header">
					<h2 className="settings-drawer__title">Settings</h2>
					<button
						className="settings-drawer__close"
						onClick={onClose}
						aria-label="Close settings"
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
							<line x1="4" y1="4" x2="12" y2="12" />
							<line x1="12" y1="4" x2="4" y2="12" />
						</svg>
					</button>
				</div>

				{/* Appearance section */}
				<div className="settings-drawer__section">
					<h3 className="settings-drawer__section-label">
						{t("appearance") || "Appearance"}
					</h3>
					<SegmentedControl
						options={
							[
								{
									value: "light",
									label: t("themeLight") || "Light",
									icon: <SunIcon />,
								},
								{
									value: "system",
									label: t("themeAuto") || "Auto",
									icon: <AutoIcon />,
								},
								{
									value: "dark",
									label: t("themeDark") || "Dark",
									icon: <MoonIcon />,
								},
							] satisfies Array<{
								value: "light" | "dark" | "system";
								label: string;
								icon: React.JSX.Element;
							}>
						}
						value={themeMode}
						onChange={setThemeMode}
						label={t("appearance") || "Appearance"}
					/>
				</div>

				{/* Language section */}
				<div className="settings-drawer__section">
					<h3 className="settings-drawer__section-label">
						{t("language") || "Language"}
					</h3>
					<LanguageDropdown
						currentLanguage={settings.language}
						onLanguageChange={(code) => {
							window.api.settings.set({ language: code });
						}}
					/>
				</div>

				{/* Toggle list -- flat list in priority order */}
				<div className="settings-drawer__body">
					<ToggleSwitch
						id="toggle-preserve-orientation"
						checked={settings.preserveOrientation}
						onChange={(v) => handleToggle("preserveOrientation", v)}
						label="Preserve orientation"
						description="Keep photos upright after metadata removal"
					/>
					<ToggleSwitch
						id="toggle-preserve-color-profile"
						checked={settings.preserveColorProfile}
						onChange={(v) => handleToggle("preserveColorProfile", v)}
						label="Preserve color profile"
						description="Keep ICC color profile for accurate display"
					/>
					<ToggleSwitch
						id="toggle-save-as-copy"
						checked={settings.saveAsCopy}
						onChange={(v) => handleToggle("saveAsCopy", v)}
						label="Save as copy"
						description="Create _cleaned copy, leave original untouched"
					/>
					<ToggleSwitch
						id="toggle-preserve-timestamps"
						checked={settings.preserveTimestamps}
						onChange={(v) => handleToggle("preserveTimestamps", v)}
						label="Preserve timestamps"
						description="Keep original file dates"
					/>
					{isMac && (
						<ToggleSwitch
							id="toggle-remove-xattrs"
							checked={settings.removeXattrs}
							onChange={(v) => handleToggle("removeXattrs", v)}
							label="Remove macOS attributes"
							description="Quarantine, download origin, Finder tags"
						/>
					)}
				</div>
			</div>
		</>
	);
}
