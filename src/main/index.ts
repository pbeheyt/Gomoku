import { app, BrowserWindow } from 'electron';
import path from 'path';

function createWindow() {
  const mainWindow = new BrowserWindow({
    show: false,
    minWidth: 1280,
    minHeight: 800,
    icon: path.join(__dirname, '../renderer/icon.png'),
    webPreferences: {
      contextIsolation: true,
    },
  });

  mainWindow.maximize();
  mainWindow.show();

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', function () {
  app.quit();
});
