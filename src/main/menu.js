const { Menu } = require("electron");
const { is } = require("electron-util");
const { buildDebugSubmenu } = require("./menu_debug");
const { buildDefaultOsTemplate } = require("./menu_default");
const { buildMacOsTemplate } = require("./menu_mac");

function buildTemplate() {
	return process.platform === "darwin"
		? buildMacOsTemplate()
		: buildDefaultOsTemplate();
}

function buildMenu() {
	let template = buildTemplate();

	if (is.development) {
		template.push({
			label: "Debug",
			submenu: buildDebugSubmenu()
		});
	}

	return Menu.buildFromTemplate(template);
}

const setupMenu = function() {
	Menu.setApplicationMenu(buildMenu());
};

module.exports = {
	setupMenu
};
