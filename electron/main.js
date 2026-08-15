const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Определяем путь к index.html
  const indexPath = app.isPackaged
    ? path.join(__dirname, "../dist/index.html") // production
    : path.join(__dirname, "../dist/index.html"); // dev

  // Загружаем сборку React/Vite
  win.loadFile(indexPath);

  // Открыть консоль разработчика (можно убрать для релиза)
  win.webContents.openDevTools();

  // Убираем меню Chromium
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});