'use strict';

document.getElementById('btn').addEventListener('click', () => {
  window.api.triggerTranslation();
});

// La fenêtre est focusable:false → blur ne se déclenche jamais.
// La fermeture est gérée par UIAutomation (déselection) ou le timer 4s (Discord).
