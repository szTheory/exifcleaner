// stylesheets
// vars first
import "../styles/vars.css";

// app
import "../styles/base.css";
import "../styles/card.css";
import "../styles/display.css";
import "../styles/empty.css";
import "../styles/file_list.css";
import "../styles/icon.css";
import "../styles/popover.css";
import "../styles/dark_mode.css";
import "../styles/tables.css";
import "../styles/typography.css";

// app
import { setupDragAndDrop } from "./drag";
import { setupSelectFilesMenu } from "./menu_select_files";
import { setupI18n } from "./i18n";

function setup(): void {
	setupI18n();
	setupDragAndDrop();
	setupSelectFilesMenu();
}

setup();
