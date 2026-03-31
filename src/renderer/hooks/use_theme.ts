import { useContext } from "react";
import { ThemeContext } from "../contexts/ThemeContext";
import type { ThemeContextValue } from "../contexts/ThemeContext";

export function useTheme(): ThemeContextValue {
	return useContext(ThemeContext);
}
