import { is } from 'electron-util'
import { autoUpdater } from 'electron-updater'

const FOUR_HOURS = 1000 * 60 * 60 * 4

export const setupAutoUpdate = function () {
	if (is.development) { return }

	// periodically check
	setInterval(() => {
		autoUpdater.checkForUpdates()
	}, FOUR_HOURS)

	// check now
	autoUpdater.checkForUpdates()
}
