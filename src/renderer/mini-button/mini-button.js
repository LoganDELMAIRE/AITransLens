'use strict';

document.getElementById('btn-translate').addEventListener('click', () => {
  window.api.triggerTranslation();
});

document.getElementById('btn-correct').addEventListener('click', () => {
  window.api.triggerCorrection();
});

window.api.onMiniButtonConfig(({ showTranslate, showCorrect }) => {
  document.getElementById('btn-translate').style.display = showTranslate ? '' : 'none';
  document.getElementById('btn-correct').style.display   = showCorrect   ? '' : 'none';
});
