import { setupDragAndDrop } from "./drag.js";
import { setupSelectFilesMenu } from "./menu_select_files.js";
import { setupI18n } from "./i18n.js";

function setup(): void {
	console.log("renderer setup");
	setupI18n();
	setupDragAndDrop();
	setupSelectFilesMenu();
}

setup();
