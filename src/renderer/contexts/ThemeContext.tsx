import { createContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export interface ThemeContextValue {
	theme: "dark" | "light";
	isLoading: boolean;
}

const defaultValue: ThemeContextValue = {
	theme: "light",
	isLoading: true,
};

export const ThemeContext = createContext<ThemeContextValue>(defaultValue);

export function ThemeProvider({
	children,
}: {
	children: ReactNode;
}): React.JSX.Element {
	const [theme, setTheme] = useState<"dark" | "light">("light");
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;

		async function loadTheme(): Promise<void> {
			const result = await window.api.theme.get();
			if (!cancelled) {
				const resolved = result.shouldUseDarkColors ? "dark" : "light";
				setTheme(resolved);
				document.documentElement.setAttribute("data-theme", resolved);
				setIsLoading(false);
			}
		}

		loadTheme();

		const cleanup = window.api.theme.onChanged((payload) => {
			const resolved = payload.shouldUseDarkColors ? "dark" : "light";
			setTheme(resolved);
			document.documentElement.setAttribute("data-theme", resolved);
		});

		return () => {
			cancelled = true;
			cleanup();
		};
	}, []);

	const value = useMemo(
		(): ThemeContextValue => ({ theme, isLoading }),
		[theme, isLoading],
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}
