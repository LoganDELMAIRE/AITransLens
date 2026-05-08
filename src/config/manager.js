'use strict';

const Store = require('electron-store');

const DEFAULTS = {
  apiKey: '',
  model: 'gemini-2.5-flash',
  sourceLang: 'auto',
  targetLang: 'fr',
  hotkey: 'CommandOrControl+Shift+T',
  overlayOpacity: 0.97,
  autoDismissDelay: 10,
  correctionHotkey: 'CommandOrControl+Shift+C',
  correctionStyle: 'standard',
  correctionLang: 'auto',
  showTranslateButton: true,
  showCorrectButton: true,
};

class ConfigManager {
  constructor() {
    /** @type {import('electron-store')} */
    this._store = null;
  }

  init() {
    this._store = new Store({ name: 'config', defaults: DEFAULTS });
  }

  get(key) {
    return this._store.get(key);
  }

  set(key, value) {
    this._store.set(key, value);
  }

  merge(partial) {
    for (const [key, value] of Object.entries(partial)) {
      this._store.set(key, value);
    }
  }

  getAll() {
    return { ...DEFAULTS, ...this._store.store };
  }
}

module.exports = ConfigManager;
