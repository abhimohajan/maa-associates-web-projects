'use strict';

const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let httpServer;
let serverPort = 0;

function userDataDbDir() {
  const dir = path.join(app.getPath('userData'), 'maa-data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f766e',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  const base = `http://127.0.0.1:${port}`;
  mainWindow.loadURL(`${base}/`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true
            }
          }
        };
      }
    } catch {
      /* fall through */
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const u = new URL(url);
      if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
        event.preventDefault();
        shell.openExternal(url);
        return;
      }
      if (String(u.port || '') !== String(port)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });
}

function startEmbeddedServer() {
  process.env.MAA_DB_DIR = userDataDbDir();
  const { startServer } = require('./server.js');
  httpServer = startServer(0);
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.once('listening', () => {
      const addr = httpServer.address();
      serverPort = typeof addr === 'object' && addr && addr.port != null ? addr.port : 0;
      resolve(serverPort);
    });
  });
}

function shutdownServer() {
  return new Promise((resolve) => {
    if (!httpServer || typeof httpServer.close !== 'function') {
      resolve();
      return;
    }
    httpServer.close(() => resolve());
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      const port = await startEmbeddedServer();
      createWindow(port);
    } catch (err) {
      console.error(err);
      dialog.showErrorBox(
        'MAA ASSOCIATES',
        `Server start failed:\n${err && err.message ? err.message : String(err)}`
      );
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverPort) createWindow(serverPort);
  });

  app.on('before-quit', () => {
    shutdownServer();
  });
}
