import { useState, useEffect, useRef, useCallback } from "react";
import { LANGUAGE_NAMES } from "../../../domain";
import { useI18n } from "../../hooks/use_i18n";
import "../../styles/language_dropdown.css";

function ChevronIcon(): React.JSX.Element {
	return (
		<svg
			className="language-dropdown__chevron"
			width="8"
			height="8"
			viewBox="0 0 8 8"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M2 3L4 5L6 3" />
		</svg>
	);
}

function CheckIcon(): React.JSX.Element {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M2.5 6L5 8.5L9.5 3.5" />
		</svg>
	);
}

// Total items = 1 (System) + 25 (languages) = 26
// Index 0 = System, index 1+ = LANGUAGE_NAMES[index - 1]
const SYSTEM_INDEX = 0;
const LANGUAGE_OFFSET = 1;
const TOTAL_ITEMS = LANGUAGE_NAMES.length + LANGUAGE_OFFSET;

export function LanguageDropdown({
	currentLanguage,
	onLanguageChange,
}: {
	currentLanguage: string | null;
	onLanguageChange: (code: string | null) => void;
}): React.JSX.Element {
	const { t } = useI18n();
	const [isOpen, setIsOpen] = useState(false);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Determine display label for the trigger
	const triggerLabel = (() => {
		if (currentLanguage === null) {
			return t("languageSystem") || "System";
		}
		const entry = LANGUAGE_NAMES.find((l) => l.code === currentLanguage);
		if (entry) {
			return `${entry.nativeName} (${entry.englishName})`;
		}
		return currentLanguage;
	})();

	// Close dropdown on outside click
	useEffect(() => {
		if (!isOpen) return;

		function handleMouseDown(e: MouseEvent): void {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
				setFocusedIndex(-1);
			}
		}

		document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, [isOpen]);

	// Scroll focused item into view
	useEffect(() => {
		if (!isOpen || focusedIndex < 0 || !listRef.current) return;

		const items = listRef.current.querySelectorAll<HTMLElement>(
			'[role="option"]',
		);
		const item = items[focusedIndex];
		if (item) {
			item.scrollIntoView({ block: "nearest" });
		}
	}, [focusedIndex, isOpen]);

	const handleSelect = useCallback(
		(code: string | null): void => {
			onLanguageChange(code);
			setIsOpen(false);
			setFocusedIndex(-1);
		},
		[onLanguageChange],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent): void => {
			if (!isOpen) {
				if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
					e.preventDefault();
					setIsOpen(true);
					// Focus current selection
					if (currentLanguage === null) {
						setFocusedIndex(SYSTEM_INDEX);
					} else {
						const idx = LANGUAGE_NAMES.findIndex(
							(l) => l.code === currentLanguage,
						);
						setFocusedIndex(idx >= 0 ? idx + LANGUAGE_OFFSET : SYSTEM_INDEX);
					}
				}
				return;
			}

			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setFocusedIndex((prev) =>
						prev < TOTAL_ITEMS - 1 ? prev + 1 : 0,
					);
					break;
				case "ArrowUp":
					e.preventDefault();
					setFocusedIndex((prev) =>
						prev > 0 ? prev - 1 : TOTAL_ITEMS - 1,
					);
					break;
				case "Enter":
				case " ":
					e.preventDefault();
					if (focusedIndex === SYSTEM_INDEX) {
						handleSelect(null);
					} else if (focusedIndex > 0) {
						const lang = LANGUAGE_NAMES[focusedIndex - LANGUAGE_OFFSET];
						if (lang) {
							handleSelect(lang.code);
						}
					}
					break;
				case "Escape":
					e.preventDefault();
					setIsOpen(false);
					setFocusedIndex(-1);
					break;
				case "Home":
					e.preventDefault();
					setFocusedIndex(0);
					break;
				case "End":
					e.preventDefault();
					setFocusedIndex(TOTAL_ITEMS - 1);
					break;
			}
		},
		[isOpen, focusedIndex, currentLanguage, handleSelect],
	);

	return (
		<div
			className="language-dropdown"
			ref={containerRef}
			onKeyDown={handleKeyDown}
		>
			<button
				className="language-dropdown__trigger"
				type="button"
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				onClick={() => {
					setIsOpen(!isOpen);
					if (!isOpen) {
						// Focus current selection
						if (currentLanguage === null) {
							setFocusedIndex(SYSTEM_INDEX);
						} else {
							const idx = LANGUAGE_NAMES.findIndex(
								(l) => l.code === currentLanguage,
							);
							setFocusedIndex(
								idx >= 0 ? idx + LANGUAGE_OFFSET : SYSTEM_INDEX,
							);
						}
					}
				}}
			>
				<span className="language-dropdown__trigger-text">{triggerLabel}</span>
				<ChevronIcon />
			</button>

			{isOpen && (
				<div
					className="language-dropdown__list"
					ref={listRef}
					role="listbox"
					aria-label={t("language") || "Language"}
				>
					{/* System option */}
					<div
						className={`language-dropdown__item${
							currentLanguage === null
								? " language-dropdown__item--selected"
								: ""
						}${focusedIndex === SYSTEM_INDEX ? " language-dropdown__item--focused" : ""}`}
						role="option"
						aria-selected={currentLanguage === null}
						onClick={() => handleSelect(null)}
						onMouseEnter={() => setFocusedIndex(SYSTEM_INDEX)}
					>
						<span className="language-dropdown__check">
							{currentLanguage === null && <CheckIcon />}
						</span>
						<span>{t("languageSystem") || "System"}</span>
					</div>

					<div className="language-dropdown__separator" />

					{/* Language items */}
					{LANGUAGE_NAMES.map((lang, index) => {
						const itemIndex = index + LANGUAGE_OFFSET;
						const isSelected = currentLanguage === lang.code;
						const isFocused = focusedIndex === itemIndex;

						return (
							<div
								key={lang.code}
								className={`language-dropdown__item${
									isSelected ? " language-dropdown__item--selected" : ""
								}${isFocused ? " language-dropdown__item--focused" : ""}`}
								role="option"
								aria-selected={isSelected}
								onClick={() => handleSelect(lang.code)}
								onMouseEnter={() => setFocusedIndex(itemIndex)}
							>
								<span className="language-dropdown__check">
									{isSelected && <CheckIcon />}
								</span>
								<span>{lang.nativeName}</span>
								<span className="language-dropdown__english">
									({lang.englishName})
								</span>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
