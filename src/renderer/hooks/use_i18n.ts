import { useContext } from "react";
import { I18nContext } from "../contexts/I18nContext";
import type { I18nContextValue } from "../contexts/I18nContext";

export function useI18n(): I18nContextValue {
	return useContext(I18nContext);
}
