'use strict';

/* ---- Langues disponibles ---- */
const LANGUAGES = [
  { code: 'auto', label: 'Détection automatique' },
  { code: 'en',   label: 'Anglais' },
  { code: 'fr',   label: 'Français' },
  { code: 'es',   label: 'Espagnol' },
  { code: 'de',   label: 'Allemand' },
  { code: 'it',   label: 'Italien' },
  { code: 'pt',   label: 'Portugais' },
  { code: 'ru',   label: 'Russe' },
  { code: 'ja',   label: 'Japonais' },
  { code: 'ko',   label: 'Coréen' },
  { code: 'zh',   label: 'Chinois' },
  { code: 'ar',   label: 'Arabe' },
  { code: 'hi',   label: 'Hindi' },
  { code: 'nl',   label: 'Néerlandais' },
  { code: 'pl',   label: 'Polonais' },
  { code: 'sv',   label: 'Suédois' },
  { code: 'tr',   label: 'Turc' },
  { code: 'da',   label: 'Danois' },
  { code: 'fi',   label: 'Finnois' },
  { code: 'cs',   label: 'Tchèque' },
  { code: 'uk',   label: 'Ukrainien' },
  { code: 'vi',   label: 'Vietnamien' },
];

const DEFAULTS = {
  apiKey: '',
  model: 'gemini-2.0-flash',
  sourceLang: 'auto',
  targetLang: 'fr',
  hotkey: 'CommandOrControl+Shift+T',
  overlayOpacity: 0.97,
  autoDismissDelay: 10,
  correctionHotkey: 'CommandOrControl+Shift+C',
  correctionStyle: 'standard',
  correctionLang: 'auto',
};

/* ---- Helpers ---- */
function $(id) { return document.getElementById(id); }

function setStatus(msg, type = '') {
  const el = $('status-msg');
  el.textContent = msg;
  el.className = `status-msg ${type}`;
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 4000);
}

function populateLangSelect(selectId, selected, includeAuto = true) {
  const select = $(selectId);
  select.innerHTML = '';
  for (const { code, label } of LANGUAGES) {
    if (!includeAuto && code === 'auto') continue;
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    if (code === selected) opt.selected = true;
    select.appendChild(opt);
  }
}

function formatHotkeyDisplay(hotkey) {
  return hotkey
    .replace('CommandOrControl', window.api.platform === 'darwin' ? 'Cmd' : 'Ctrl')
    .replace('Command', 'Cmd');
}

/* ---- Remplissage du formulaire ---- */
function fillForm(cfg) {
  $('api-key').value        = cfg.apiKey || '';
  $('model').value          = cfg.model || DEFAULTS.model;
  $('hotkey').value         = formatHotkeyDisplay(cfg.hotkey || DEFAULTS.hotkey);
  $('opacity').value        = Math.round((cfg.overlayOpacity ?? DEFAULTS.overlayOpacity) * 100);
  $('opacity-label').textContent = `${$('opacity').value}%`;
  $('auto-dismiss').value   = String(cfg.autoDismissDelay ?? DEFAULTS.autoDismissDelay);
  $('hotkey-badge').textContent = formatHotkeyDisplay(cfg.hotkey || DEFAULTS.hotkey);

  $('correction-hotkey').value  = formatHotkeyDisplay(cfg.correctionHotkey || DEFAULTS.correctionHotkey);
  $('correction-style').value   = cfg.correctionStyle || DEFAULTS.correctionStyle;
  currentCorrectionHotkey = cfg.correctionHotkey || DEFAULTS.correctionHotkey;

  $('show-translate-button').checked = cfg.showTranslateButton !== false;
  $('show-correct-button').checked   = cfg.showCorrectButton   !== false;

  populateLangSelect('source-lang', cfg.sourceLang || 'auto', true);
  populateLangSelect('target-lang', cfg.targetLang || 'fr', false);
  populateCorrectionLang(cfg.correctionLang || DEFAULTS.correctionLang);
}

/* ---- Lecture du formulaire ---- */
function readForm() {
  return {
    apiKey:               $('api-key').value.trim(),
    model:                $('model').value,
    sourceLang:           $('source-lang').value,
    targetLang:           $('target-lang').value,
    hotkey:               currentHotkey,
    overlayOpacity:       parseInt($('opacity').value, 10) / 100,
    autoDismissDelay:     parseInt($('auto-dismiss').value, 10),
    correctionHotkey:     currentCorrectionHotkey,
    correctionStyle:      $('correction-style').value,
    correctionLang:       $('correction-lang').value,
    showTranslateButton:  $('show-translate-button').checked,
    showCorrectButton:    $('show-correct-button').checked,
  };
}

/* ---- Langue de correction ---- */
function populateCorrectionLang(selected) {
  const select = $('correction-lang');
  select.innerHTML = '';
  const autoOpt = document.createElement('option');
  autoOpt.value = 'auto';
  autoOpt.textContent = 'Conserver la langue originale';
  if (selected === 'auto') autoOpt.selected = true;
  select.appendChild(autoOpt);
  for (const { code, label } of LANGUAGES) {
    if (code === 'auto') continue;
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    if (code === selected) opt.selected = true;
    select.appendChild(opt);
  }
}

/* ---- Capture du raccourci traduction ---- */
let currentHotkey = DEFAULTS.hotkey;

$('hotkey').addEventListener('focus', () => {
  $('hotkey').value = 'Appuyez sur une combinaison…';
  $('hotkey').classList.add('capturing');
});

$('hotkey').addEventListener('blur', () => {
  $('hotkey').classList.remove('capturing');
  $('hotkey').value = formatHotkeyDisplay(currentHotkey);
});

$('hotkey').addEventListener('keydown', (e) => {
  e.preventDefault();
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey)  parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const key = e.key;
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    parts.push(key.length === 1 ? key.toUpperCase() : key);
    currentHotkey = parts.join('+');
    $('hotkey').value = formatHotkeyDisplay(currentHotkey);
    $('hotkey').blur();
  }
});

/* ---- Capture du raccourci correction ---- */
let currentCorrectionHotkey = DEFAULTS.correctionHotkey;

$('correction-hotkey').addEventListener('focus', () => {
  $('correction-hotkey').value = 'Appuyez sur une combinaison…';
  $('correction-hotkey').classList.add('capturing');
});

$('correction-hotkey').addEventListener('blur', () => {
  $('correction-hotkey').classList.remove('capturing');
  $('correction-hotkey').value = formatHotkeyDisplay(currentCorrectionHotkey);
});

$('correction-hotkey').addEventListener('keydown', (e) => {
  e.preventDefault();
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey)  parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const key = e.key;
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    parts.push(key.length === 1 ? key.toUpperCase() : key);
    currentCorrectionHotkey = parts.join('+');
    $('correction-hotkey').value = formatHotkeyDisplay(currentCorrectionHotkey);
    $('correction-hotkey').blur();
  }
});

/* ---- Afficher / masquer la clé ---- */
$('toggle-key').addEventListener('click', () => {
  const input = $('api-key');
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  $('toggle-key').textContent = isPassword ? 'Masquer' : 'Afficher';
});

/* ---- Opacité live ---- */
$('opacity').addEventListener('input', () => {
  $('opacity-label').textContent = `${$('opacity').value}%`;
});

/* ---- Lien AI Studio ---- */
$('link-studio').addEventListener('click', () => {
  window.api.openExternal('https://aistudio.google.com/apikey');
});

/* ---- Test connexion ---- */
$('btn-test').addEventListener('click', async () => {
  const btn = $('btn-test');
  const result = $('test-result');

  btn.disabled = true;
  result.textContent = 'Test en cours…';
  result.className = 'test-result';

  const apiKey = $('api-key').value.trim();
  if (!apiKey) {
    result.textContent = '✗ Clé API manquante';
    result.className = 'test-result error';
    btn.disabled = false;
    return;
  }

  // Sauvegarde temporaire de la clé pour tester
  await window.api.saveConfig({ apiKey, model: $('model').value });

  try {
    const translation = await window.api.translate('Hello', 'en', 'fr');
    if (translation) {
      result.textContent = `✓ Connexion OK — "${translation}"`;
      result.className = 'test-result ok';
    } else {
      throw new Error('Réponse vide');
    }
  } catch (err) {
    result.textContent = `✗ ${err.message}`;
    result.className = 'test-result error';
  }

  btn.disabled = false;
});

/* ---- Enregistrer ---- */
$('btn-save').addEventListener('click', async () => {
  const partial = readForm();
  if (!partial.apiKey) {
    setStatus('La clé API est requise.', 'error');
    $('api-key').focus();
    return;
  }
  await window.api.saveConfig(partial);
  $('hotkey-badge').textContent = formatHotkeyDisplay(currentHotkey);
  setStatus('Paramètres enregistrés.', 'ok');
});

/* ---- Réinitialiser ---- */
$('btn-reset').addEventListener('click', async () => {
  if (!confirm('Réinitialiser tous les paramètres ?')) return;
  currentHotkey           = DEFAULTS.hotkey;
  currentCorrectionHotkey = DEFAULTS.correctionHotkey;
  await window.api.saveConfig({ ...DEFAULTS });
  fillForm(DEFAULTS);
  setStatus('Paramètres réinitialisés.', 'ok');
});

/* ---- Démarrage automatique ---- */
$('startup').addEventListener('change', async () => {
  await window.api.setLoginItem($('startup').checked);
});

/* ---- Boutons flottants ---- */
$('show-translate-button').addEventListener('change', async () => {
  await window.api.saveConfig({ showTranslateButton: $('show-translate-button').checked });
});

$('show-correct-button').addEventListener('change', async () => {
  await window.api.saveConfig({ showCorrectButton: $('show-correct-button').checked });
});

/* ---- Init ---- */
(async () => {
  const cfg = await window.api.getConfig();
  currentHotkey = cfg.hotkey || DEFAULTS.hotkey;
  fillForm(cfg);

  if (window.api.platform === 'win32' || window.api.platform === 'darwin') {
    $('startup').checked = await window.api.getLoginItem();
  } else {
    // Linux : cacher l'option (non supporté)
    $('startup').closest('.field-row').style.display = 'none';
  }
})();
