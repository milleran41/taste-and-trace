const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (_error) {
  autoUpdater = null;
}

function setupAutoUpdates() {
  if (!app.isPackaged || !autoUpdater) return;

  autoUpdater.autoDownload = true;

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Taste & Trace update',
      message: 'A new version has been downloaded.',
      detail: 'Restart Taste & Trace to install the update.'
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Updates should never block the cookbook if GitHub is unreachable.
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Загружаем React/Vite сборку
  win.loadFile(path.join(__dirname, '../dist/index.html'));

  // Приложение без меню Chromium
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdates();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
