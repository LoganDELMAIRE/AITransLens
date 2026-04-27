'use strict';

document.getElementById('btn').addEventListener('click', () => {
  window.api.triggerTranslation();
});

// Ferme si on clique ailleurs (perte de focus)
window.addEventListener('blur', () => {
  window.api.closeMiniButton();
});
