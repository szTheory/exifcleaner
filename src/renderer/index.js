'use strict';

// electron-webpack HMR
const { is } = require('electron-util')
if (is.development && module.hot) {
	module.hot.accept();
}

// stylesheets
require('../styles/index.scss')

// app
require('../common/drag')
const { listenForDarkModeChanges } = require("./dark_mode")


function init() {
	listenForDarkModeChanges()
}
init()
