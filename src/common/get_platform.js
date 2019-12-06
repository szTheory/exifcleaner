'use strict';

import { platform } from 'os';

export default () => {
	switch (platform()) {
		case 'aix':
		case 'freebsd':
		case 'linux':
		case 'openbsd':
		case 'android':
			return 'nix';
		case 'darwin':
		case 'sunos':
			return 'nix';
		case 'win32':
			return 'win';
	}
};

