'use strict';

const {
  app, BrowserWindow, globalShortcut, ipcMain,
  clipboard, screen, Tray, Menu, nativeImage, shell,
} = require('electron');
const path = require('path');
const ConfigManager = require('./config/manager');
const Translator = require('./modules/translator');
const SelectionMonitor = require('./modules/selection-monitor');

const config = new ConfigManager();
// En mode packagé, le .ps1 est dans resources/ (extraResources), pas dans l'asar
const ps1Path = app.isPackaged
  ? path.join(process.resourcesPath, 'selection-monitor.ps1')
  : path.join(__dirname, 'modules', 'selection-monitor.ps1');
const selectionMonitor = new SelectionMonitor(ps1Path);
let translator = null;
let overlayWindow = null;
let settingsWindow = null;
let miniButtonWindow = null;
let tray = null;

/** Données en attente pour l'overlay. @type {object|null} */
let pendingData = null;

/**
 * Texte capturé au moment où le mini bouton a été affiché.
 * Isolé de lastSelectedText pour ne pas être effacé par le changement de focus.
 * @type {string}
 */
let capturedText = '';

function getTranslator() {
  if (!translator) translator = new Translator(config);
  return translator;
}

// ---------------------------------------------------------------------------
// Utilitaire position
// ---------------------------------------------------------------------------

function positionNearCursor(win, w, h, offsetY = 24) {
  const cursor = screen.getCursorScreenPoint();
  const { bounds } = screen.getDisplayNearestPoint(cursor);

  let x = cursor.x - Math.floor(w / 2);
  let y = cursor.y + offsetY;

  x = Math.max(bounds.x + 8, Math.min(x, bounds.x + bounds.width - w - 8));
  y = Math.max(bounds.y + 8, Math.min(y, bounds.y + bounds.height - h - 8));

  win.setPosition(x, y);
}

// ---------------------------------------------------------------------------
// Mini bouton
// ---------------------------------------------------------------------------

function showMiniButton() {
  // Ne pas afficher si l'overlay de traduction est ouvert
  if (overlayWindow && !overlayWindow.isDestroyed()) return;

  if (miniButtonWindow && !miniButtonWindow.isDestroyed()) {
    return; // déjà visible, ne pas repositionner
  }

  miniButtonWindow = new BrowserWindow({
    width: 110,
    height: 30,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  miniButtonWindow.loadFile(path.join(__dirname, 'renderer/mini-button/index.html'));
  miniButtonWindow.setAlwaysOnTop(true, 'screen-saver');

  miniButtonWindow.once('ready-to-show', () => {
    positionNearCursor(miniButtonWindow, 110, 30, 18);
    miniButtonWindow.showInactive(); // n'arrache pas le focus à l'app source
  });

  miniButtonWindow.on('closed', () => { miniButtonWindow = null; });
}

function hideMiniButton() {
  if (miniButtonWindow && !miniButtonWindow.isDestroyed()) {
    miniButtonWindow.close();
  }
}

// ---------------------------------------------------------------------------
// Surveillance de la sélection (UIAutomation PowerShell)
// ---------------------------------------------------------------------------

let hideDebounce = null;

function startSelectionMonitor() {
  selectionMonitor.on('selection', (text) => {
    if (text) {
      // Annule un éventuel masquage en cours (ex: focus vers mini bouton)
      if (hideDebounce) { clearTimeout(hideDebounce); hideDebounce = null; }
      capturedText = text;
      showMiniButton();
    } else {
      // Délai avant masquage : évite de fermer le bouton pendant qu'on clique dessus
      // (UIAutomation détecte le changement de focus ~200ms avant que le clic soit traité)
      if (hideDebounce) clearTimeout(hideDebounce);
      hideDebounce = setTimeout(() => {
        hideDebounce = null;
        hideMiniButton();
      }, 600);
    }
  });

  // Si UIAutomation n'est pas dispo, fallback sur le polling presse-papier
  selectionMonitor.on('unavailable', () => {
    startClipboardPollingFallback();
  });

  selectionMonitor.start();
}

// Fallback clipboard polling (non-Windows ou UIAutomation indisponible)
let clipboardPoller = null;
let lastClipboardText = '';

function startClipboardPollingFallback() {
  lastClipboardText = clipboard.readText();

  clipboardPoller = setInterval(() => {
    const text = clipboard.readText().trim();
    if (text && text !== lastClipboardText) {
      lastClipboardText = text;
      capturedText = text;
      if (!overlayWindow || overlayWindow.isDestroyed()) {
        showMiniButton();
        setTimeout(hideMiniButton, 4000);
      }
    }
  }, 400);
}

// ---------------------------------------------------------------------------
// Fenêtre overlay
// ---------------------------------------------------------------------------

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
  }

  hideMiniButton();

  const W = 480, H = 260;

  overlayWindow = new BrowserWindow({
    width: W,
    height: H,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.loadFile(path.join(__dirname, 'renderer/overlay/index.html'));
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  overlayWindow.once('ready-to-show', () => {
    positionNearCursor(overlayWindow, W, H);
    overlayWindow.show();
    overlayWindow.focus();
    // Délai avant d'activer blur-to-close : sur Windows, focus() peut déclencher
    // un blur transitoire pendant la mise en avant-plan de la fenêtre
    setTimeout(() => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.on('blur', () => {
          if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
        });
      }
    }, 350);
  });

  overlayWindow.on('closed', () => { overlayWindow = null; });
}

// ---------------------------------------------------------------------------
// Fenêtre paramètres
// ---------------------------------------------------------------------------

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 620,
    title: 'AITransLens — Paramètres',
    resizable: false,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer/settings/index.html'));
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ---------------------------------------------------------------------------
// Déclenchement de la traduction
// ---------------------------------------------------------------------------

async function triggerTranslation() {
  // Priorité : texte capturé à l'affichage du bouton, sinon presse-papier
  const text = (capturedText || clipboard.readText()).trim();
  capturedText = ''; // reset après usage pour ne pas réutiliser le même texte
  if (!text) return;

  const { sourceLang, targetLang } = config.getAll();

  pendingData = { originalText: text, translatedText: null, sourceLang, targetLang, loading: true };
  createOverlayWindow();

  try {
    const translation = await getTranslator().translate(text, sourceLang, targetLang);
    const data = { originalText: text, translatedText: translation, sourceLang, targetLang, loading: false };
    pendingData = data;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('show-translation', data);
    }
  } catch (err) {
    const data = { originalText: text, translatedText: null, sourceLang, targetLang, loading: false, error: err.message };
    pendingData = data;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('show-translation', data);
    }
  }
}

// ---------------------------------------------------------------------------
// Raccourci global
// ---------------------------------------------------------------------------

function registerHotkey() {
  globalShortcut.unregisterAll();
  const hotkey = config.get('hotkey') || 'CommandOrControl+Shift+T';
  try {
    globalShortcut.register(hotkey, triggerTranslation);
  } catch {
    globalShortcut.register('CommandOrControl+Shift+T', triggerTranslation);
    config.set('hotkey', 'CommandOrControl+Shift+T');
  }
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('AITransLens');

  const menu = Menu.buildFromTemplate([
    { label: 'Paramètres', click: createSettingsWindow },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', createSettingsWindow);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const DEPRECATED_MODELS = new Set([
  'gemini-2.0-flash', 'gemini-2.0-flash-lite',
  'gemini-1.5-flash', 'gemini-1.5-pro',
  'gemini-2.5-flash-preview-04-17', 'gemini-2.5-pro-preview-05-06',
]);

app.whenReady().then(() => {
  config.init();

  if (DEPRECATED_MODELS.has(config.get('model'))) {
    config.set('model', 'gemini-2.5-flash');
  }

  // ---- Handlers IPC ----

  ipcMain.handle('get-config', () => config.getAll());

  ipcMain.handle('save-config', (_, partial) => {
    config.merge(partial);
    if ('apiKey' in partial || 'model' in partial) {
      if (translator) { translator.invalidate(); translator = null; }
    }
    if ('hotkey' in partial) registerHotkey();
    return config.getAll();
  });

  ipcMain.handle('translate', async (_, text, src, tgt) => {
    return getTranslator().translate(text, src, tgt);
  });

  ipcMain.handle('copy-to-clipboard', (_, text) => {
    clipboard.writeText(text);
  });

  ipcMain.handle('close-overlay', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
  });

  ipcMain.handle('open-settings', () => createSettingsWindow());

  ipcMain.handle('open-external', (_, url) => shell.openExternal(url));

  ipcMain.handle('trigger-translation', () => triggerTranslation());
  ipcMain.handle('close-mini-button',   () => hideMiniButton());

  ipcMain.handle('replace-selected-text', async (_, translation) => {
    clipboard.writeText(translation);
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
    // Laisse le focus revenir à la fenêtre source avant de simuler Ctrl+V
    await new Promise(r => setTimeout(r, 200));
    if (process.platform === 'win32') {
      const { spawn } = require('child_process');
      spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")',
      ]);
    }
  });

  ipcMain.on('overlay-ready', (event) => {
    if (pendingData) event.sender.send('show-translation', pendingData);
  });

  // ---- Démarrage ----

  registerHotkey();
  startSelectionMonitor();
  try { createTray(); } catch { /* icône manquante */ }

  // macOS : rouvrir les paramètres si on clique sur l'icône du dock
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createSettingsWindow();
  });
});

app.on('window-all-closed', () => { /* tray app */ });

app.on('will-quit', () => {
  selectionMonitor.stop();
  if (clipboardPoller) clearInterval(clipboardPoller);
  if (hideDebounce) clearTimeout(hideDebounce);
  globalShortcut.unregisterAll();
});
