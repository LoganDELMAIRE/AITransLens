'use strict';

/* ---- État ---- */
let currentCorrection = '';

/* ---- Helpers ---- */
function $(id) { return document.getElementById(id); }
function truncate(text, max = 100) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/* ---- Affichage ---- */
function showLoading() {
  $('state-loading').style.display = 'flex';
  $('result-text').hidden = true;
  $('error-msg').hidden = true;
  $('btn-copy').disabled = true;
  $('btn-replace').disabled = true;
}

function showResult(text) {
  currentCorrection = text;
  $('state-loading').style.display = 'none';
  $('result-text').textContent = text;
  $('result-text').hidden = false;
  $('error-msg').hidden = true;
  $('btn-copy').disabled = false;
  $('btn-replace').disabled = false;
}

function showError(msg) {
  $('state-loading').style.display = 'none';
  $('result-text').hidden = true;
  $('error-msg').textContent = msg;
  $('error-msg').hidden = false;
  $('btn-copy').disabled = true;
  $('btn-replace').disabled = true;
}

/* ---- Événements ---- */
$('btn-copy').addEventListener('click', async () => {
  if (!currentCorrection) return;
  await window.api.copyToClipboard(currentCorrection);
  const label = $('copy-label');
  label.textContent = '✓ Copié';
  setTimeout(() => { label.textContent = 'Copier'; }, 2000);
});

$('btn-replace').addEventListener('click', async () => {
  if (!currentCorrection) return;
  await window.api.replaceSelectedText(currentCorrection);
});

$('btn-close').addEventListener('click', () => window.api.closeCorrection());
$('btn-settings').addEventListener('click', () => window.api.openSettings());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.api.closeCorrection();
});

/* ---- IPC : réception des données ---- */
window.api.onShowCorrection((data) => {
  const { originalText, correctedText, loading, error } = data;

  $('source-text').textContent = truncate(originalText);

  if (loading) {
    showLoading();
  } else if (error) {
    showError(error);
  } else {
    showResult(correctedText);
  }
});

/* ---- Init ---- */
window.api.correctionReady();
