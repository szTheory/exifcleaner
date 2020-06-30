import { app } from "electron";
import { isLinux } from "../common/platform";
import path from "path";

export function showAboutWindow(author: string, websiteUrl: string): void {
	let aboutPanelOptions = {
		applicationName: app.getName(),
		applicationVersion: app.getVersion(),
		copyright: `Copyright © ${author}`,
		version: app.getVersion(),
		// credits: author, //optional
		// authors: [author], //optional
		website: websiteUrl,
		iconPath: iconPath()
	};

	app.setAboutPanelOptions(aboutPanelOptions);
	app.showAboutPanel();
}

function iconPath(): string {
	if (isLinux()) {
		return path.join(__dirname, "..", "..", "exifcleaner.png");
	} else {
		return path.join(__dirname, "static", "icon.png");
	}
}
