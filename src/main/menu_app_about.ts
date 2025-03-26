import { app } from "electron";
import { iconPath } from "../common/resources";
import { i18n } from "./i18n";

export function showAboutWindow(author: string, websiteUrl: string): void {
	let aboutPanelOptions = {
		applicationName: app.getName(),
		applicationVersion: app.getVersion(),
		copyright: `${i18n("aboutwindow:copyright")} © ${author}`,
		version: app.getVersion(),
		credits: author,
		authors: [author],
		website: websiteUrl,
		iconPath: iconPath(),
	};

	app.setAboutPanelOptions(aboutPanelOptions);
	app.showAboutPanel();
}
