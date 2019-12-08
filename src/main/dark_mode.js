import { systemPreferences, nativeTheme } from 'electron'

export const DARK_MODE_MESSAGE_NAME = 'dark-mode'

export const isDarkMode = function () {
  return nativeTheme.shouldUseDarkColors
}

export const listenForDarkMode = function ({ win }) {
  systemPreferences.subscribeNotification(
    'AppleInterfaceThemeChangedNotification',
    () => autoSetDarkMode({ win: win })
  )
}

export const autoSetDarkMode = function ({ win }) {
  win.webContents.send(DARK_MODE_MESSAGE_NAME, isDarkMode())
}
