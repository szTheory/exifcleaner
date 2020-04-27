const { buildHelpSubmenu } = require("./menu_help");
const { fileMenuOpenItem } = require("./menu_file_open");

// Linux and Windows
function buildDefaultOsTemplate() {
	return [
		{
			role: "fileMenu",
			submenu: [
				fileMenuOpenItem(),
				{
					type: "separator"
				},
				{
					role: "quit"
				}
			]
		},
		{
			role: "editMenu"
		},
		{
			role: "viewMenu"
		},
		{
			role: "help",
			submenu: buildHelpSubmenu()
		}
	];
}

module.exports = {
	buildDefaultOsTemplate
};
