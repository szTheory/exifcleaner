import unhandled from "electron-unhandled";
import { isDev } from "../common/env";

// electron-webpack HMR (Hot Module Reload)
// to automatically reload code on save when
// in development mode
if (isDev && module.hot) {
	module.hot.accept();
}

// stylesheets
import "../styles/index.scss";

// app
import { setupDragAndDrop } from "./drag";
import { setupSelectFilesMenu } from "./menu_select_files";
import { setupI18n } from "./i18n";

function setup(): void {
	// setup app
	setupI18n();
	setupDragAndDrop();
	setupSelectFilesMenu();

	// report unhandled errors
	unhandled();
}

setup();
