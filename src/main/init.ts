import {app, BrowserWindow} from 'electron';
import contextMenu from 'electron-context-menu';
import unhandled from 'electron-unhandled';

import packageJson from '../../package.json';

import {setupApp} from './app_setup';

function setupErrorHandling(): void {
  unhandled();
}

// context menu (copy/paste/etc)
function setupContextMenu(): void {
  contextMenu();
}

function setupUserModelId(): void {
  app.setAppUserModelId(packageJson.build.appId);
}

export function init({win}: {win: BrowserWindow|null}): void {
  setupErrorHandling();
  setupContextMenu();
  setupUserModelId();
  setupApp({win: win});
}
