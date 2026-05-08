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
let correctionWindow = null;
let settingsWindow = null;
let miniButtonWindow = null;
let tray = null;

/** Données en attente pour l'overlay. @type {object|null} */
let pendingData = null;
let pendingCorrectionData = null;

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
  if (overlayWindow && !overlayWindow.isDestroyed()) return;
  if (correctionWindow && !correctionWindow.isDestroyed()) return;

  if (miniButtonWindow && !miniButtonWindow.isDestroyed()) {
    return;
  }

  const showTranslate = config.get('showTranslateButton') !== false;
  const showCorrect   = config.get('showCorrectButton') !== false;
  if (!showTranslate && !showCorrect) return;

  const W = (showTranslate && showCorrect) ? 210 : 110;

  miniButtonWindow = new BrowserWindow({
    width: W,
    height: 30,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
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
    positionNearCursor(miniButtonWindow, W, 30, 18);
    miniButtonWindow.showInactive();
    miniButtonWindow.webContents.send('mini-button-config', { showTranslate, showCorrect });
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
// true quand UIAutomation gère la sélection active → le clipboard poller cède la priorité
let uiaSelectionActive = false;

function startSelectionMonitor() {
  selectionMonitor.on('selection', (text) => {
    if (text) {
      if (hideDebounce) { clearTimeout(hideDebounce); hideDebounce = null; }
      capturedText = text;
      uiaSelectionActive = true;
      showMiniButton();
    } else {
      uiaSelectionActive = false;
      if (hideDebounce) clearTimeout(hideDebounce);
      hideDebounce = setTimeout(() => {
        hideDebounce = null;
        hideMiniButton();
      }, 600);
    }
  });

  selectionMonitor.on('unavailable', () => { /* clipboard polling prend le relais seul */ });

  // Ferme le mini bouton si l'utilisateur clique en dehors (focusable:false → pas de blur)
  selectionMonitor.on('mousedown', () => {
    if (!miniButtonWindow || miniButtonWindow.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const [bx, by] = miniButtonWindow.getPosition();
    const [bw, bh] = miniButtonWindow.getSize();
    const inside = cursor.x >= bx && cursor.x <= bx + bw
                && cursor.y >= by && cursor.y <= by + bh;
    if (!inside) hideMiniButton();
  });

  selectionMonitor.start();

  // Toujours actif en complément de UIAutomation.
  // Couvre Discord, Teams, et toutes les apps sans UIAutomation TextPattern.
  // Le PS1 envoie ^c via détection souris pour ces apps ; le poller attrape le résultat.
  startClipboardPollingFallback();
}

// Fallback clipboard polling (non-Windows ou UIAutomation indisponible)
let clipboardPoller = null;
let lastClipboardText = '';
let overlayBlurGuardUntil = 0;

function startClipboardPollingFallback() {
  lastClipboardText = clipboard.readText();

  clipboardPoller = setInterval(() => {
    // UIAutomation gère la sélection → ne pas interférer avec capturedText
    if (uiaSelectionActive) return;

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
  overlayBlurGuardUntil = Date.now() + 1200;

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
    app.focus({ steal: true });
    overlayWindow.focus();

    overlayWindow.on('blur', () => {
      if (!overlayWindow || overlayWindow.isDestroyed()) return;
      if (Date.now() < overlayBlurGuardUntil) return;
      overlayWindow.close();
    });

    // Si blur a déjà tiré pendant le guard (focus volé par l'app source),
    // on vérifie une fois après expiration pour fermer si toujours sans focus.
    const checkAfterGuard = () => {
      if (!overlayWindow || overlayWindow.isDestroyed()) return;
      const remaining = overlayBlurGuardUntil - Date.now();
      if (remaining > 0) { setTimeout(checkAfterGuard, remaining + 50); return; }
      if (!overlayWindow.isFocused()) overlayWindow.close();
    };
    setTimeout(checkAfterGuard, overlayBlurGuardUntil - Date.now() + 50);
  });

  overlayWindow.on('closed', () => { overlayWindow = null; });
}

// ---------------------------------------------------------------------------
// Fenêtre correction
// ---------------------------------------------------------------------------

function createCorrectionWindow() {
  if (correctionWindow && !correctionWindow.isDestroyed()) {
    correctionWindow.destroy();
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
  }

  hideMiniButton();
  overlayBlurGuardUntil = Date.now() + 1200;

  const W = 480, H = 240;

  correctionWindow = new BrowserWindow({
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

  correctionWindow.loadFile(path.join(__dirname, 'renderer/correction/index.html'));
  correctionWindow.setAlwaysOnTop(true, 'screen-saver');

  correctionWindow.once('ready-to-show', () => {
    positionNearCursor(correctionWindow, W, H);
    correctionWindow.show();
    app.focus({ steal: true });
    correctionWindow.focus();

    correctionWindow.on('blur', () => {
      if (!correctionWindow || correctionWindow.isDestroyed()) return;
      if (Date.now() < overlayBlurGuardUntil) return;
      correctionWindow.close();
    });

    const checkAfterGuard = () => {
      if (!correctionWindow || correctionWindow.isDestroyed()) return;
      const remaining = overlayBlurGuardUntil - Date.now();
      if (remaining > 0) { setTimeout(checkAfterGuard, remaining + 50); return; }
      if (!correctionWindow.isFocused()) correctionWindow.close();
    };
    setTimeout(checkAfterGuard, overlayBlurGuardUntil - Date.now() + 50);
  });

  correctionWindow.on('closed', () => { correctionWindow = null; });
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
    height: 720,
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
  uiaSelectionActive = false; // libère le clipboard poller pour la prochaine sélection
  const text = (capturedText || clipboard.readText()).trim();
  capturedText = '';
  if (!text) return;

  const { sourceLang, targetLang } = config.getAll();

  pendingData = { originalText: text, translatedText: null, sourceLang, targetLang, loading: true };
  createOverlayWindow();

  try {
    let data;
    if (sourceLang !== 'auto') {
      // Détecte automatiquement laquelle des deux langues est la source, traduit vers l'autre
      const result = await getTranslator().translateSmart(text, sourceLang, targetLang);
      data = {
        originalText: text,
        translatedText: result.translation,
        sourceLang: result.sourceLang,
        targetLang: result.targetLang,
        loading: false,
      };
    } else {
      const translation = await getTranslator().translate(text, sourceLang, targetLang);
      data = { originalText: text, translatedText: translation, sourceLang, targetLang, loading: false };
    }
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

async function triggerCorrection() {
  uiaSelectionActive = false;
  const text = (capturedText || clipboard.readText()).trim();
  capturedText = '';
  if (!text) return;

  pendingCorrectionData = { originalText: text, correctedText: null, loading: true };
  createCorrectionWindow();

  try {
    const { correctionStyle, correctionLang } = config.getAll();
    const corrected = await getTranslator().correct(text, correctionStyle, correctionLang);
    const data = { originalText: text, correctedText: corrected, loading: false };
    pendingCorrectionData = data;
    if (correctionWindow && !correctionWindow.isDestroyed()) {
      correctionWindow.webContents.send('show-correction', data);
    }
  } catch (err) {
    const data = { originalText: text, correctedText: null, loading: false, error: err.message };
    pendingCorrectionData = data;
    if (correctionWindow && !correctionWindow.isDestroyed()) {
      correctionWindow.webContents.send('show-correction', data);
    }
  }
}

// ---------------------------------------------------------------------------
// Raccourci global
// ---------------------------------------------------------------------------

function registerHotkeys() {
  globalShortcut.unregisterAll();

  const hotkey = config.get('hotkey') || 'CommandOrControl+Shift+T';
  try {
    globalShortcut.register(hotkey, triggerTranslation);
  } catch {
    globalShortcut.register('CommandOrControl+Shift+T', triggerTranslation);
    config.set('hotkey', 'CommandOrControl+Shift+T');
  }

  const correctionHotkey = config.get('correctionHotkey') || 'CommandOrControl+Shift+C';
  if (correctionHotkey && correctionHotkey !== hotkey) {
    try {
      globalShortcut.register(correctionHotkey, triggerCorrection);
    } catch { /* ignore si conflit */ }
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
    if ('hotkey' in partial || 'correctionHotkey' in partial) registerHotkeys();
    return config.getAll();
  });

  ipcMain.handle('translate', async (_, text, src, tgt) => {
    return getTranslator().translate(text, src, tgt);
  });

  ipcMain.handle('correct-text', async (_, text) => {
    return getTranslator().correct(text);
  });

  ipcMain.handle('copy-to-clipboard', (_, text) => {
    clipboard.writeText(text);
  });

  ipcMain.handle('close-overlay', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
  });

  ipcMain.handle('set-overlay-blur-guard', (_, ms = 800) => {
    overlayBlurGuardUntil = Date.now() + Math.max(0, Number(ms) || 0);
  });

  ipcMain.handle('open-settings', () => createSettingsWindow());

  ipcMain.handle('open-external', (_, url) => shell.openExternal(url));

  ipcMain.handle('get-login-item', () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle('set-login-item', (_, enable) => {
    app.setLoginItemSettings({ openAtLogin: enable });
  });

  ipcMain.handle('trigger-translation', () => triggerTranslation());
  ipcMain.handle('trigger-correction',  () => triggerCorrection());
  ipcMain.handle('close-mini-button',   () => hideMiniButton());

  ipcMain.handle('close-correction', () => {
    if (correctionWindow && !correctionWindow.isDestroyed()) correctionWindow.close();
  });

  ipcMain.on('correction-ready', (event) => {
    if (pendingCorrectionData) event.sender.send('show-correction', pendingCorrectionData);
  });

  ipcMain.handle('replace-selected-text', async (_, translation) => {
    clipboard.writeText(translation);
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
    if (correctionWindow && !correctionWindow.isDestroyed()) correctionWindow.close();
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

  registerHotkeys();
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
