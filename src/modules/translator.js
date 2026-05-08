'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

const LANG_NAMES = {
  auto: 'auto-detect',
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  nl: 'Dutch',
  pl: 'Polish',
  sv: 'Swedish',
  tr: 'Turkish',
  da: 'Danish',
  fi: 'Finnish',
  cs: 'Czech',
  uk: 'Ukrainian',
  vi: 'Vietnamese',
};

class Translator {
  /** @param {import('../config/manager')} config */
  constructor(config) {
    this._config = config;
    this._model = null;
    this._cache = new Map();
    this._smartCache = new Map();
    this._cacheLimit = 50;
  }

  _init() {
    const apiKey = this._config.get('apiKey');
    if (!apiKey) {
      throw new Error('Clé API Gemini manquante. Configurez-la dans les paramètres.');
    }
    const modelName = this._config.get('model') || 'gemini-2.0-flash';
    const genAI = new GoogleGenerativeAI(apiKey);
    this._model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    });
  }

  /**
   * @param {string} text
   * @param {string} sourceLang  ISO 639-1 code or 'auto'
   * @param {string} targetLang  ISO 639-1 code
   * @returns {Promise<string>}
   */
  async translate(text, sourceLang = 'auto', targetLang = 'fr') {
    if (!this._model) this._init();

    const trimmed = text.trim();
    if (!trimmed) return '';

    const cacheKey = `${trimmed}||${sourceLang}||${targetLang}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const targetName = LANG_NAMES[targetLang] || targetLang;
    const sourceName = sourceLang !== 'auto' ? (LANG_NAMES[sourceLang] || sourceLang) : null;

    const prompt = sourceName
      ? `Translate the following text from ${sourceName} to ${targetName}. Return only the translation, no explanations:\n\n${trimmed}`
      : `Translate the following text to ${targetName}. Detect the source language automatically. Return only the translation, no explanations:\n\n${trimmed}`;

    try {
      const result = await this._model.generateContent(prompt);
      const translation = result.response.text().trim();

      if (this._cache.size >= this._cacheLimit) {
        this._cache.delete(this._cache.keys().next().value);
      }
      this._cache.set(cacheKey, translation);

      return translation;
    } catch (err) {
      throw this._normalizeError(err);
    }
  }

  /**
   * Transforme les erreurs API en messages lisibles.
   * Extrait le délai de retry pour les 429.
   * @param {Error} err
   * @returns {Error}
   */
  _normalizeError(err) {
    const msg = err.message || '';

    // 429 — quota dépassé
    if (msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('quota')) {
      const retryMatch = msg.match(/retry(?:Delay)?["\s:]+(\d+)s/i)
        || msg.match(/Please retry in ([\d.]+)s/i);
      const seconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null;

      const retryInfo = seconds ? ` Réessayez dans ${seconds}s.` : '';
      const normalized = new Error(`Quota API dépassé.${retryInfo} Vérifiez votre plan sur ai.google.dev/rate-limit.`);
      normalized.code = 'QUOTA_EXCEEDED';
      normalized.retryAfter = seconds;
      return normalized;
    }

    // 404 — modèle indisponible
    if (msg.includes('404') || msg.includes('no longer available') || msg.includes('Not Found')) {
      const normalized = new Error('Modèle indisponible. Changez de modèle dans les paramètres (ex : gemini-1.5-flash).');
      normalized.code = 'MODEL_NOT_FOUND';
      return normalized;
    }

    // 401 / 403 — clé invalide
    if (msg.includes('401') || msg.includes('403') || msg.includes('API key')) {
      const normalized = new Error('Clé API invalide ou non autorisée. Vérifiez les paramètres.');
      normalized.code = 'AUTH_ERROR';
      return normalized;
    }

    // Réseau (vrai problème de connexion — pas d'erreur HTTP)
    if ((msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT'))
        || (msg.includes('fetch') && !msg.includes('Error fetching from'))) {
      const normalized = new Error('Impossible de joindre l\'API Gemini. Vérifiez votre connexion.');
      normalized.code = 'NETWORK_ERROR';
      return normalized;
    }

    return err;
  }

  /**
   * Détecte laquelle de lang1/lang2 est la langue du texte, puis traduit vers l'autre.
   * Un seul appel Gemini pour les deux opérations.
   * @param {string} text
   * @param {string} lang1  code ISO 639-1 (ex: 'en')
   * @param {string} lang2  code ISO 639-1 (ex: 'fr')
   * @returns {Promise<{sourceLang: string, targetLang: string, translation: string}>}
   */
  async translateSmart(text, lang1, lang2) {
    if (!this._model) this._init();
    const trimmed = text.trim();
    if (!trimmed) return { sourceLang: lang1, targetLang: lang2, translation: '' };

    const cacheKey = `${trimmed}||${lang1}||${lang2}`;
    if (this._smartCache.has(cacheKey)) return this._smartCache.get(cacheKey);

    const name1 = LANG_NAMES[lang1] || lang1;
    const name2 = LANG_NAMES[lang2] || lang2;

    const prompt = `The following text is written in either ${name1} or ${name2}. Detect which one, then translate it to the other language.
Respond with valid JSON only (no markdown, no code blocks):
{"detected":"<${lang1} or ${lang2}>","translation":"<translated text>"}

Text: ${trimmed}`;

    try {
      const result = await this._model.generateContent(prompt);
      const raw = result.response.text().trim()
        .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

      const parsed = JSON.parse(raw);
      const src = String(parsed.detected || '').trim();
      const detectedSource = src === lang2 ? lang2 : lang1;
      const detectedTarget = detectedSource === lang1 ? lang2 : lang1;
      const translation = String(parsed.translation || '').trim();

      const entry = { sourceLang: detectedSource, targetLang: detectedTarget, translation };
      if (this._smartCache.size >= this._cacheLimit) {
        this._smartCache.delete(this._smartCache.keys().next().value);
      }
      this._smartCache.set(cacheKey, entry);
      return entry;
    } catch (err) {
      // Fallback : appel simple sans détection
      const translation = await this.translate(trimmed, lang1, lang2);
      return { sourceLang: lang1, targetLang: lang2, translation };
    }
  }

  /**
   * @param {string} text
   * @returns {Promise<string>}
   */
  /**
   * @param {string} text
   * @param {'standard'|'formal'|'concise'|'fluent'} style
   * @param {string} lang  ISO 639-1 ou 'auto'
   * @returns {Promise<string>}
   */
  async correct(text, style = 'standard', lang = 'auto') {
    if (!this._model) this._init();
    const trimmed = text.trim();
    if (!trimmed) return '';

    const cacheKey = `correct||${trimmed}||${style}||${lang}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const styleInstructions = {
      standard: 'Correct the grammar and spelling of the following text. Keep the same language, tone, and style.',
      formal:   'Rewrite the following text in a formal, professional tone. Correct any grammar and spelling errors.',
      concise:  'Rewrite the following text to be more concise and clear, removing redundancy. Correct any grammar errors.',
      fluent:   'Rewrite the following text to sound more natural and fluent. Correct any grammar and spelling errors.',
    };

    const instruction = styleInstructions[style] || styleInstructions.standard;
    const langInstruction = (lang && lang !== 'auto')
      ? ` Respond in ${LANG_NAMES[lang] || lang}.`
      : ' Keep the original language.';

    const prompt = `${instruction}${langInstruction} Return only the corrected text, no explanations:\n\n${trimmed}`;

    try {
      const result = await this._model.generateContent(prompt);
      const corrected = result.response.text().trim();
      if (this._cache.size >= this._cacheLimit) {
        this._cache.delete(this._cache.keys().next().value);
      }
      this._cache.set(cacheKey, corrected);
      return corrected;
    } catch (err) {
      throw this._normalizeError(err);
    }
  }

  /** Invalide le modèle (ex: changement de clé API) */
  invalidate() {
    this._model = null;
    this._cache.clear();
    this._smartCache.clear();
  }
}

module.exports = Translator;
