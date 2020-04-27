const { app, shell } = require("electron");

function buildDebugSubmenu() {
	return [
		{
			label: "Show Settings",
			click() {
				config.openInEditor();
			}
		},
		{
			label: "Show App Data",
			click() {
				shell.openItem(app.getPath("userData"));
			}
		},
		{
			type: "separator"
		},
		{
			label: "Delete Settings",
			click() {
				config.clear();
				app.relaunch();
				app.quit();
			}
		},
		{
			label: "Delete App Data",
			click() {
				shell.moveItemToTrash(app.getPath("userData"));
				app.relaunch();
				app.quit();
			}
		}
	];
}

module.exports = {
	buildDebugSubmenu
};
