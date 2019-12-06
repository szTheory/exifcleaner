'use strict';

// electron-webpack HMR
const { is } = require('electron-util')
if (is.development && module.hot) {
	module.hot.accept();
}

// const stye
require('../common/index.scss')
require('../common/drag')
