'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');

/**
 * Surveille la sélection de texte via UIAutomation (Windows uniquement).
 * Émet :
 *   'selection' (text: string) — texte sélectionné (vide = rien de sélectionné)
 *   'unavailable'              — PowerShell/UIAutomation non disponible
 */
class SelectionMonitor extends EventEmitter {
  /** @param {string} [scriptPath] Chemin explicite vers le .ps1 (utile en mode packagé) */
  constructor(scriptPath) {
    super();
    this._scriptPath = scriptPath || path.join(__dirname, 'selection-monitor.ps1');
    this._proc = null;
    this._buf  = '';
  }

  start() {
    if (process.platform !== 'win32') {
      this.emit('unavailable');
      return;
    }

    const script = this._scriptPath;

    this._proc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', script,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    this._proc.stdout.setEncoding('utf8');

    this._proc.stdout.on('data', (chunk) => {
      this._buf += chunk;
      const lines = this._buf.split('\n');
      this._buf = lines.pop(); // garde la ligne incomplète

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const { text } = JSON.parse(trimmed);
          this.emit('selection', text || '');
        } catch {
          // ligne mal formée, ignorée
        }
      }
    });

    this._proc.on('error', () => {
      this.emit('unavailable');
    });

    this._proc.on('exit', () => {
      this._proc = null;
    });
  }

  stop() {
    if (this._proc) {
      this._proc.kill();
      this._proc = null;
    }
  }
}

module.exports = SelectionMonitor;
