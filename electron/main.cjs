const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { registerTranscriptionIpc } = require("./transcription.cjs");
const { registerLocalRecipeParserIpc } = require("./local-recipe-parser.cjs");
const { registerVideoRecipePipelineIpc } = require("./video-recipe-pipeline.cjs");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
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
  // win.webContents.openDevTools();

  // Убираем меню Chromium
  win.setMenuBarVisibility(false);
  // Добавляем контекстное меню (правая кнопка мыши) для функций Копировать/Вставить
  win.webContents.on('context-menu', async (event, params) => {
    const { Menu } = require('electron');
    let tParams = { cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All', copyImage: 'Copy Image' };
    
    try {
      // Пытаемся получить переводы из активного окна React (через i18next)
      const result = await win.webContents.executeJavaScript(`
        window.__i18n ? {
          cut: window.__i18n.t('cut', { defaultValue: 'Cut' }),
          copy: window.__i18n.t('copy', { defaultValue: 'Copy' }),
          paste: window.__i18n.t('paste', { defaultValue: 'Paste' }),
          selectAll: window.__i18n.t('select_all', { defaultValue: 'Select All' }),
          copyImage: window.__i18n.t('copy_image', { defaultValue: 'Copy Image' })
        } : null
      `);
      if (result) tParams = result;
    } catch (e) {
      console.log("Failed to fetch translations for context menu", e);
    }

    const menuTemplate = [
      { role: 'cut', label: tParams.cut },
      { role: 'copy', label: tParams.copy },
      { role: 'paste', label: tParams.paste },
      { type: 'separator' },
      { role: 'selectAll', label: tParams.selectAll }
    ];
    
    // Показываем меню только если клик был по выделяемому тексту или полю ввода
    if (params.isEditable || params.selectionText) {
      Menu.buildFromTemplate(menuTemplate).popup(win);
    } else if (params.mediaType === 'image') {
      Menu.buildFromTemplate([
        { role: 'copyImage', label: tParams.copyImage }
      ]).popup(win);
    } else {
      Menu.buildFromTemplate([
        { role: 'paste', label: tParams.paste }
      ]).popup(win);
    }
  });
}

app.whenReady().then(() => {
  registerTranscriptionIpc(ipcMain, app);
  registerLocalRecipeParserIpc(ipcMain, app);
  registerVideoRecipePipelineIpc(ipcMain, app);
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
