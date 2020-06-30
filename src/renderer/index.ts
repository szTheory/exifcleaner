import unhandled from "electron-unhandled";

// electron-webpack HMR
import { is } from "electron-util";
if (is.development && module.hot) {
	module.hot.accept();
}

// stylesheets
import "../styles/index.scss";

// app
require("../renderer/drag");
require("../renderer/menu_select_files");

// SETUP ERROR HANDLING
unhandled();
