'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (partial) => ipcRenderer.invoke('save-config', partial),

  // Translation
  translate: (text, src, tgt) => ipcRenderer.invoke('translate', text, src, tgt),

  // Clipboard
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  // Window actions
  closeOverlay: () => ipcRenderer.invoke('close-overlay'),
  openSettings: () => ipcRenderer.invoke('open-settings'),

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
  closeMiniButton: () => ipcRenderer.invoke('close-mini-button'),

  // Remplacement du texte sélectionné
  replaceSelectedText: (translation) => ipcRenderer.invoke('replace-selected-text', translation),

  // Démarrage automatique
  getLoginItem: () => ipcRenderer.invoke('get-login-item'),
  setLoginItem: (enable) => ipcRenderer.invoke('set-login-item', enable),
});
