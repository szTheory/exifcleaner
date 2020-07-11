import { shell, app, MenuItemConstructorOptions } from "electron";
import os from "os";
import { isMac } from "../common/platform";
import { showAboutWindow } from "./menu_about_window";
import { openUrlMenuItem } from "./menu_item_open_url";

const WEBSITE_URL = "https://exifcleaner.com";
const GITHUB_USERNAME = "szTheory";
const GITHUB_PROJECTNAME = "exifcleaner";
const SOURCE_CODE_URL = `https://github.com/${GITHUB_USERNAME}/${GITHUB_PROJECTNAME}`;

export function buildHelpSubmenu(): MenuItemConstructorOptions[] {
	let submenu = [
		openUrlMenuItem("Website", WEBSITE_URL),
		openUrlMenuItem("Source Code", SOURCE_CODE_URL),
		{
			label: "Report an Issue…",
			click() {
				const url = newGithubIssueUrl(
					GITHUB_USERNAME,
					GITHUB_PROJECTNAME,
					newGithubIssueBody()
				);
				shell.openExternal(url);
			},
		},
	];

	if (!isMac()) {
		submenu.push(
			{
				type: "separator",
			},
			{
				label: `About ${app.getName()}`,
				click() {
					showAboutWindow(GITHUB_USERNAME, WEBSITE_URL);
				},
			}
		);
	}

	return submenu;
}

function newGithubIssueUrl(user: string, repo: string, body: string): string {
	const url = new URL(`https://github.com/${user}/${repo}/issues/new`);
	url.searchParams.set("body", body);

	return url.toString();
}

function newGithubIssueBody(): string {
	return `
<!-- Please succinctly describe your issue and steps to reproduce it. -->


---

${debugInfo()}`;
}

function debugInfo(): string {
	return `
${app.getName()} ${app.getVersion()}
Electron ${process.versions.electron}
${process.platform} ${os.release()}
Locale: ${app.getLocale()}
`.trim();
}
