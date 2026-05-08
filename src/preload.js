'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (partial) => ipcRenderer.invoke('save-config', partial),

  // Translation
  translate: (text, src, tgt) => ipcRenderer.invoke('translate', text, src, tgt),
  correctText: (text) => ipcRenderer.invoke('correct-text', text),

  // Clipboard
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  // Window actions
  closeOverlay: () => ipcRenderer.invoke('close-overlay'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  setOverlayBlurGuard: (ms) => ipcRenderer.invoke('set-overlay-blur-guard', ms),

  // Overlay → Main: signal que le renderer est prêt
  overlayReady: () => ipcRenderer.send('overlay-ready'),

  // Main → Overlay: reçoit les données de traduction
  onShowTranslation: (cb) => {
    ipcRenderer.on('show-translation', (_e, data) => cb(data));
  },

  removeListener: (channel) => ipcRenderer.removeAllListeners(channel),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  platform: process.platform,

  // Mini bouton
  triggerTranslation: () => ipcRenderer.invoke('trigger-translation'),
  triggerCorrection: () => ipcRenderer.invoke('trigger-correction'),
  closeMiniButton: () => ipcRenderer.invoke('close-mini-button'),
  onMiniButtonConfig: (cb) => ipcRenderer.on('mini-button-config', (_e, cfg) => cb(cfg)),

  // Correction overlay
  closeCorrection: () => ipcRenderer.invoke('close-correction'),
  correctionReady: () => ipcRenderer.send('correction-ready'),
  onShowCorrection: (cb) => {
    ipcRenderer.on('show-correction', (_e, data) => cb(data));
  },

  // Remplacement du texte sélectionné
  replaceSelectedText: (translation) => ipcRenderer.invoke('replace-selected-text', translation),

  // Démarrage automatique
  getLoginItem: () => ipcRenderer.invoke('get-login-item'),
  setLoginItem: (enable) => ipcRenderer.invoke('set-login-item', enable),
});
