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
    title: 'Taste & Trace',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const indexPath = path.join(__dirname, 'dist', 'index.html');
  win.loadFile(indexPath).catch((error) => {
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <html>
        <body style="font-family: sans-serif; padding: 32px; color: #222;">
          <h1>Taste & Trace could not start</h1>
          <p>The desktop app could not load its interface files.</p>
          <pre style="white-space: pre-wrap; background: #f4f4f4; padding: 16px;">${error.message}
${indexPath}</pre>
        </body>
      </html>
    `)}`);
  });

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
