// Hardcoded native language names for the language picker.
// Names are displayed in native script and NEVER change regardless of current app language.
// Sorted alphabetically by nativeName.

export interface LanguageEntry {
	readonly code: string;
	readonly nativeName: string;
	readonly englishName: string;
}

export const LANGUAGE_NAMES: ReadonlyArray<LanguageEntry> = [
	{ code: "ca", nativeName: "Catala", englishName: "Catalan" },
	{ code: "cs", nativeName: "Cestina", englishName: "Czech" },
	{ code: "da", nativeName: "Dansk", englishName: "Danish" },
	{ code: "de", nativeName: "Deutsch", englishName: "German" },
	{ code: "en", nativeName: "English", englishName: "English" },
	{ code: "es", nativeName: "Espanol", englishName: "Spanish" },
	{ code: "fr", nativeName: "Francais", englishName: "French" },
	{ code: "hr", nativeName: "Hrvatski", englishName: "Croatian" },
	{ code: "it", nativeName: "Italiano", englishName: "Italian" },
	{ code: "hu", nativeName: "Magyar", englishName: "Hungarian" },
	{ code: "nl", nativeName: "Nederlands", englishName: "Dutch" },
	{ code: "pl", nativeName: "Polski", englishName: "Polish" },
	{ code: "pt", nativeName: "Portugues", englishName: "Portuguese" },
	{
		code: "pt-BR",
		nativeName: "Portugues (Brasil)",
		englishName: "Portuguese (Brazil)",
	},
	{ code: "sk", nativeName: "Slovencina", englishName: "Slovak" },
	{ code: "sv", nativeName: "Svenska", englishName: "Swedish" },
	{ code: "vn", nativeName: "Tieng Viet", englishName: "Vietnamese" },
	{ code: "tr", nativeName: "Turkce", englishName: "Turkish" },
	{ code: "ru", nativeName: "Русский", englishName: "Russian" },
	{ code: "uk", nativeName: "Українська", englishName: "Ukrainian" },
	{ code: "ar", nativeName: "العربية", englishName: "Arabic" },
	{ code: "fa", nativeName: "فارسی", englishName: "Persian" },
	{ code: "ml", nativeName: "മലയാളം", englishName: "Malayalam" },
	{ code: "zh", nativeName: "中文", englishName: "Chinese" },
	{ code: "ja", nativeName: "日本語", englishName: "Japanese" },
];
