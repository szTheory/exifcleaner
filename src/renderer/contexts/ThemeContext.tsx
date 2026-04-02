import {
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { ReactNode } from "react";
import type { ThemeMode } from "../../domain";

const THEME_CROSSFADE_DURATION_MS = 200;

export interface ThemeContextValue {
	theme: "dark" | "light";
	themeMode: ThemeMode;
	isLoading: boolean;
	setThemeMode: (mode: ThemeMode) => void;
}

const defaultValue: ThemeContextValue = {
	theme: "light",
	themeMode: "system",
	isLoading: true,
	setThemeMode: () => {},
};

export const ThemeContext = createContext<ThemeContextValue>(defaultValue);

export function ThemeProvider({
	children,
}: {
	children: ReactNode;
}): React.JSX.Element {
	const [theme, setTheme] = useState<"dark" | "light">("light");
	const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;

		async function loadTheme(): Promise<void> {
			const [themeResult, settingsResult, accentResult] = await Promise.all([
				window.api.theme.get(),
				window.api.settings.get(),
				window.api.theme.getAccentColor(),
			]);
			if (!cancelled) {
				const resolved = themeResult.shouldUseDarkColors ? "dark" : "light";
				setTheme(resolved);
				setThemeModeState(settingsResult.themeMode);
				document.documentElement.setAttribute("data-theme", resolved);

				document.documentElement.style.setProperty(
					"--ec-color-accent",
					accentResult.color,
				);

				setIsLoading(false);
			}
		}

		loadTheme();

		// No crossfade for system-driven theme changes
		const cleanupTheme = window.api.theme.onChanged((payload) => {
			const resolved = payload.shouldUseDarkColors ? "dark" : "light";
			setTheme(resolved);
			document.documentElement.setAttribute("data-theme", resolved);
		});

		const cleanupAccent = window.api.theme.onAccentColorChanged((payload) => {
			document.documentElement.style.setProperty(
				"--ec-color-accent",
				payload.color,
			);
		});

		const cleanupMenuMode = window.api.theme.onThemeModeChanged?.((mode) => {
			setThemeModeState(mode);
		});

		return () => {
			cancelled = true;
			cleanupTheme();
			cleanupAccent();
			cleanupMenuMode?.();
		};
	}, []);

	const setThemeMode = useCallback((mode: ThemeMode): void => {
		// Crossfade transition class for manual switch (D-22)
		document.documentElement.classList.add("theme-transitioning");

		setThemeModeState(mode);
		window.api.theme.set(mode);
		window.api.settings.set({ themeMode: mode });

		// Remove transition class after animation completes (D-23)
		setTimeout(() => {
			document.documentElement.classList.remove("theme-transitioning");
		}, THEME_CROSSFADE_DURATION_MS);
	}, []);

	const value = useMemo(
		(): ThemeContextValue => ({ theme, themeMode, isLoading, setThemeMode }),
		[theme, themeMode, isLoading, setThemeMode],
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}
