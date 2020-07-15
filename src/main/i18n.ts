import { app } from "electron";
import { i18n as i18nCommon } from "../common/i18n";

export function i18n(key: string): string {
	return i18nCommon(key, app.getLocale());
}
