'use strict';

/* ---- Constantes ---- */
const LANG_LABELS = {
  auto: 'Auto', en: 'EN', fr: 'FR', es: 'ES', de: 'DE',
  it: 'IT', pt: 'PT', ru: 'RU', ja: 'JA', ko: 'KO',
  zh: 'ZH', ar: 'AR', hi: 'HI', nl: 'NL', pl: 'PL',
  sv: 'SV', tr: 'TR', da: 'DA', fi: 'FI', cs: 'CS',
  uk: 'UK', vi: 'VI',
};

/* ---- État ---- */
let currentTranslation = '';
let currentState = { originalText: '', translatedText: '', sourceLang: 'auto', targetLang: 'fr' };

/* ---- Helpers ---- */
function $(id) { return document.getElementById(id); }

function langLabel(code) { return LANG_LABELS[code] || code.toUpperCase(); }

function truncate(text, max = 100) {
  return text.length > max ? text.slice(0, max) + '…' : text;
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

// Copier la traduction
$('btn-copy').addEventListener('click', async () => {
  if (!currentTranslation) return;
  await window.api.copyToClipboard(currentTranslation);
  const label = $('copy-label');
  label.textContent = '✓ Copié';
  setTimeout(() => { label.textContent = 'Copier'; }, 2000);
});

// Remplacer le texte sélectionné
$('btn-replace').addEventListener('click', async () => {
  if (!currentTranslation) return;
  await window.api.replaceSelectedText(currentTranslation);
});

// Fermer
$('btn-close').addEventListener('click', () => window.api.closeOverlay());

// Ouvrir les paramètres
$('btn-settings').addEventListener('click', () => window.api.openSettings());

// Touche Échap pour fermer
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.api.closeOverlay();
});

/* ---- Swap ---- */
$('btn-swap').addEventListener('click', async () => {
  if (currentState.sourceLang === 'auto') return;

  const newSrc = currentState.targetLang;
  const newTgt = currentState.sourceLang;
  const newText = currentState.translatedText;

  // Met à jour l'affichage immédiatement
  currentState.sourceLang = newSrc;
  currentState.targetLang = newTgt;
  currentState.originalText = newText;
  currentState.translatedText = '';

  $('source-lang').textContent = langLabel(newSrc);
  $('target-lang').textContent = langLabel(newTgt);
  $('source-text').textContent = truncate(newText);
  $('btn-swap').disabled = true;

  showLoading();

  // Sauvegarde + retraduction
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
  $('target-lang').textContent = langLabel(targetLang);

  // Bouton swap désactivé si source = auto ou pas encore de traduction
  $('btn-swap').disabled = (sourceLang === 'auto' || loading);

  // Mémorise l'état pour le swap
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
window.api.overlayReady();
