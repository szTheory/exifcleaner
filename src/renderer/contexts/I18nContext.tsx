import {
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { ReactNode } from "react";
import { i18nLookup } from "../../domain/i18n_lookup";
import type { I18nStringsDictionary } from "../../domain/i18n_lookup";

export interface I18nContextValue {
	t: (key: string) => string;
	locale: string;
	isLoading: boolean;
}

const defaultValue: I18nContextValue = {
	t: (key: string) => key,
	locale: "en",
	isLoading: true,
};

export const I18nContext = createContext<I18nContextValue>(defaultValue);

export function I18nProvider({
	children,
}: {
	children: ReactNode;
}): React.JSX.Element {
	const [dictionary, setDictionary] = useState<I18nStringsDictionary | null>(
		null,
	);
	const [locale, setLocale] = useState("en");
	const [isLoading, setIsLoading] = useState(true);

	// Initial load of i18n data
	useEffect(() => {
		let cancelled = false;

		async function loadI18n(): Promise<void> {
			const [strings, loc] = await Promise.all([
				window.api.i18n.getStrings(),
				window.api.i18n.getLocale(),
			]);
			if (!cancelled) {
				setDictionary(strings);
				setLocale(loc);
				setIsLoading(false);
			}
		}

		loadI18n();
		return () => {
			cancelled = true;
		};
	}, []);

	// Listen for language changes from main process (hot-swap)
	useEffect(() => {
		const unsubscribe = window.api.i18n.onLanguageChanged(
			(newLocale: string) => {
				setLocale(newLocale);
			},
		);
		return unsubscribe;
	}, []);

	const t = useCallback(
		(key: string): string => {
			if (dictionary === null) {
				return key;
			}
			try {
				return i18nLookup(dictionary, key, locale);
			} catch {
				return key;
			}
		},
		[dictionary, locale],
	);

	const value = useMemo(
		(): I18nContextValue => ({ t, locale, isLoading }),
		[t, locale, isLoading],
	);

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
