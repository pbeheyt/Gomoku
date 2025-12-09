import { app, BrowserWindow } from 'electron';
import path from 'path';

// Référence globale pour éviter que le Garbage Collector ne détruise la fenêtre
let mainWindow: BrowserWindow | null = null;

/**
 * Crée la fenêtre principale de l'application.
 * Processus : Main (Node.js)
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    show: false, // On cache la fenêtre tant qu'elle n'est pas chargée (évite l'écran blanc)
    minWidth: 1280,
    minHeight: 800,
    icon: path.join(__dirname, '../renderer/icon.png'),
    webPreferences: {
      // SÉCURITÉ : Isole le JS de l'UI du système de fichiers pour éviter les failles.
      contextIsolation: true,
      sandbox: true
    },
  });

  mainWindow.maximize();
  
  // Événement : La fenêtre est prête à être affichée (pas de flash blanc)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Nettoyage de la référence quand on ferme
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- CYCLE DE VIE ---

app.whenReady().then(() => {
  createWindow();
});

// Quitter l'application dès que la fenêtre est fermée.
app.on('window-all-closed', () => {
  app.quit();
});
