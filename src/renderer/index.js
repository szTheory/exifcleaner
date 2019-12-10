const unhandled = require("electron-unhandled");

// electron-webpack HMR
const { is } = require("electron-util");
if (is.development && module.hot) {
	module.hot.accept();
}

// stylesheets
require("../styles/index.scss");

// app
require("../common/drag");

// ERROR HANDLING
unhandled();
