import unhandled from "electron-unhandled";
import { isDev } from "../common/is_dev";

// electron-webpack HMR
if (isDev && module.hot) {
	module.hot.accept();
}

// stylesheets
import "../styles/index.scss";

// app
require("../renderer/drag");
require("../renderer/menu_select_files");

// SETUP ERROR HANDLING
unhandled();
