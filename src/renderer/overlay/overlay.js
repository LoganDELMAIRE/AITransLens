'use strict';

/* ---- Constantes ---- */
const LANG_LABELS = {
  auto: 'Auto', en: 'EN', fr: 'FR', es: 'ES', de: 'DE',
  it: 'IT', pt: 'PT', ru: 'RU', ja: 'JA', ko: 'KO',
  zh: 'ZH', ar: 'AR', hi: 'HI', nl: 'NL', pl: 'PL',
  sv: 'SV', tr: 'TR', da: 'DA', fi: 'FI', cs: 'CS',
  uk: 'UK', vi: 'VI',
};

const TARGET_LANGUAGES = [
  'en', 'fr', 'es', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
  'ar', 'hi', 'nl', 'pl', 'sv', 'tr', 'da', 'fi', 'cs', 'uk', 'vi',
];

/* ---- État ---- */
let currentTranslation = '';
let currentState = { originalText: '', translatedText: '', sourceLang: 'auto', targetLang: 'fr' };
let syncingTargetSelect = false;

/* ---- Helpers ---- */
function $(id) { return document.getElementById(id); }
function langLabel(code) { return LANG_LABELS[code] || code.toUpperCase(); }
function truncate(text, max = 100) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function renderTargetSelect(selectedCode) {
  const select = $('target-lang-select');
  const options = TARGET_LANGUAGES.includes(selectedCode)
    ? TARGET_LANGUAGES
    : [...TARGET_LANGUAGES, selectedCode];

  syncingTargetSelect = true;
  select.innerHTML = '';
  for (const code of options) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = langLabel(code);
    if (code === selectedCode) opt.selected = true;
    select.appendChild(opt);
  }
  syncingTargetSelect = false;
}

/* ---- Affichage ---- */
function showLoading() {
  $('state-loading').style.display = 'flex';
  $('translation-text').hidden = true;
  $('error-msg').hidden = true;
  $('btn-copy').disabled = true;
  $('btn-replace').disabled = true;
}

function showResult(translation) {
  currentTranslation = translation;
  $('state-loading').style.display = 'none';
  $('translation-text').textContent = translation;
  $('translation-text').hidden = false;
  $('error-msg').hidden = true;
  $('btn-copy').disabled = false;
  $('btn-replace').disabled = false;
}

function showError(msg) {
  $('state-loading').style.display = 'none';
  $('translation-text').hidden = true;
  $('error-msg').textContent = msg;
  $('error-msg').hidden = false;
  $('btn-copy').disabled = true;
  $('btn-replace').disabled = true;
}

/* ---- Événements ---- */

$('btn-copy').addEventListener('click', async () => {
  if (!currentTranslation) return;
  await window.api.copyToClipboard(currentTranslation);
  const label = $('copy-label');
  label.textContent = '✓ Copié';
  setTimeout(() => { label.textContent = 'Copier'; }, 2000);
});

$('btn-replace').addEventListener('click', async () => {
  if (!currentTranslation) return;
  await window.api.replaceSelectedText(currentTranslation);
});

$('btn-close').addEventListener('click', () => window.api.closeOverlay());
$('btn-settings').addEventListener('click', () => window.api.openSettings());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.api.closeOverlay();
});

$('target-lang-select').addEventListener('mousedown', () => {
  window.api.setOverlayBlurGuard(1400);
});

$('target-lang-select').addEventListener('change', async () => {
  if (syncingTargetSelect) return;

  const selectedTarget = $('target-lang-select').value;
  if (!selectedTarget || selectedTarget === currentState.targetLang) return;
  if (!currentState.originalText) return;

  currentState.targetLang = selectedTarget;
  currentState.translatedText = '';
  $('btn-swap').disabled = true;
  showLoading();

  await window.api.saveConfig({ targetLang: selectedTarget });

  try {
    const sourceLang = currentState.sourceLang === 'auto' ? 'auto' : currentState.sourceLang;
    const translation = await window.api.translate(currentState.originalText, sourceLang, selectedTarget);
    currentState.translatedText = translation;
    $('btn-swap').disabled = (currentState.sourceLang === 'auto');
    showResult(translation);
  } catch (err) {
    $('btn-swap').disabled = (currentState.sourceLang === 'auto');
    showError(err.message);
  }
});

/* ---- Swap ---- */
$('btn-swap').addEventListener('click', async () => {
  if (currentState.sourceLang === 'auto') return;

  const newSrc = currentState.targetLang;
  const newTgt = currentState.sourceLang;
  const newText = currentState.translatedText;

  currentState.sourceLang = newSrc;
  currentState.targetLang = newTgt;
  currentState.originalText = newText;
  currentState.translatedText = '';

  $('source-lang').textContent = langLabel(newSrc);
  renderTargetSelect(newTgt);
  $('source-text').textContent = truncate(newText);
  $('btn-swap').disabled = true;

  showLoading();

  await window.api.saveConfig({ sourceLang: newSrc, targetLang: newTgt });
  try {
    const translation = await window.api.translate(newText, newSrc, newTgt);
    currentState.translatedText = translation;
    $('btn-swap').disabled = false;
    showResult(translation);
  } catch (err) {
    $('btn-swap').disabled = false;
    showError(err.message);
  }
});

/* ---- IPC : réception des données ---- */
window.api.onShowTranslation((data) => {
  const { originalText, translatedText, sourceLang, targetLang, loading, error } = data;

  $('source-text').textContent = truncate(originalText);
  $('source-lang').textContent = langLabel(sourceLang);
  renderTargetSelect(targetLang);

  $('btn-swap').disabled = (sourceLang === 'auto' || loading);

  if (!loading) {
    currentState = { originalText, translatedText: translatedText || '', sourceLang, targetLang };
  }

  if (loading) {
    showLoading();
  } else if (error) {
    showError(error);
  } else {
    showResult(translatedText);
  }
});

/* ---- Init ---- */
renderTargetSelect(currentState.targetLang);
window.api.overlayReady();
