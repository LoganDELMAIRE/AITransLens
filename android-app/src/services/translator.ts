import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

export const LANGUAGES: Record<string, string> = {
  auto: 'Détection auto',
  en: 'Anglais',
  fr: 'Français',
  es: 'Espagnol',
  de: 'Allemand',
  it: 'Italien',
  pt: 'Portugais',
  ru: 'Russe',
  ja: 'Japonais',
  ko: 'Coréen',
  zh: 'Chinois',
  ar: 'Arabe',
  hi: 'Hindi',
  nl: 'Néerlandais',
  pl: 'Polonais',
  sv: 'Suédois',
  tr: 'Turc',
  da: 'Danois',
  fi: 'Finnois',
  cs: 'Tchèque',
  uk: 'Ukrainien',
  vi: 'Vietnamien',
};

const LANGUAGE_NAMES: Record<string, string> = {
  auto: 'the detected language',
  en: 'English', fr: 'French', es: 'Spanish', de: 'German',
  it: 'Italian', pt: 'Portuguese', ru: 'Russian', ja: 'Japanese',
  ko: 'Korean', zh: 'Chinese', ar: 'Arabic', hi: 'Hindi',
  nl: 'Dutch', pl: 'Polish', sv: 'Swedish', tr: 'Turkish',
  da: 'Danish', fi: 'Finnish', cs: 'Czech', uk: 'Ukrainian', vi: 'Vietnamese',
};

export interface SmartTranslationResult {
  sourceLang: string;
  targetLang: string;
  translation: string;
}

class TranslatorService {
  private model: GenerativeModel | null = null;
  private cache = new Map<string, string>();
  private readonly MAX_CACHE = 50;

  init(apiKey: string, modelName: string = 'gemini-2.5-flash'): void {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    });
    this.cache.clear();
  }

  async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (!this.model) throw new Error('Traducteur non initialisé. Configurez votre clé API.');

    const cacheKey = `${sourceLang}:${targetLang}:${text}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    const targetLabel = LANGUAGE_NAMES[targetLang] ?? targetLang;
    const prompt = sourceLang === 'auto'
      ? `Translate to ${targetLabel}. Return ONLY the translation:\n\n${text}`
      : `Translate from ${LANGUAGE_NAMES[sourceLang] ?? sourceLang} to ${targetLabel}. Return ONLY the translation:\n\n${text}`;

    try {
      const result = await this.model.generateContent(prompt);
      const translation = result.response.text().trim();

      if (this.cache.size >= this.MAX_CACHE) {
        this.cache.delete(this.cache.keys().next().value!);
      }
      this.cache.set(cacheKey, translation);
      return translation;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  async translateSmart(text: string, lang1: string, lang2: string): Promise<SmartTranslationResult> {
    if (!this.model) throw new Error('Traducteur non initialisé. Configurez votre clé API.');

    const name1 = LANGUAGE_NAMES[lang1] ?? lang1;
    const name2 = LANGUAGE_NAMES[lang2] ?? lang2;

    const prompt = `Detect if the text is in ${name1} or ${name2}, then translate to the other.
Return ONLY JSON: {"detected": "lang_code", "translation": "translated text"}
Codes: "${lang1}" = ${name1}, "${lang2}" = ${name2}
Text: ${text}`;

    try {
      const result = await this.model.generateContent(prompt);
      const raw = result.response.text().trim();
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Format invalide');

      const parsed = JSON.parse(match[0]) as { detected: string; translation: string };
      const detected = parsed.detected ?? lang1;
      return {
        sourceLang: detected,
        targetLang: detected === lang1 ? lang2 : lang1,
        translation: parsed.translation,
      };
    } catch {
      const translation = await this.translate(text, 'auto', lang2);
      return { sourceLang: lang1, targetLang: lang2, translation };
    }
  }

  async correct(text: string, style: string = 'standard', lang: string = 'auto'): Promise<string> {
    if (!this.model) throw new Error('Traducteur non initialisé. Configurez votre clé API.');

    const cacheKey = `correct:${style}:${lang}:${text}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    const styleInstructions: Record<string, string> = {
      standard: 'Correct the grammar and spelling of the following text. Keep the same language, tone, and style.',
      formal:   'Rewrite the following text in a formal, professional tone. Correct any grammar and spelling errors.',
      concise:  'Rewrite the following text to be more concise and clear, removing redundancy. Correct any grammar errors.',
      fluent:   'Rewrite the following text to sound more natural and fluent. Correct any grammar and spelling errors.',
    };

    const instruction = styleInstructions[style] ?? styleInstructions.standard;
    const langInstruction = lang && lang !== 'auto'
      ? ` Respond in ${LANGUAGE_NAMES[lang] ?? lang}.`
      : ' Keep the original language.';

    const prompt = `${instruction}${langInstruction} Return ONLY the corrected text:\n\n${text}`;

    try {
      const result = await this.model.generateContent(prompt);
      const corrected = result.response.text().trim();
      if (this.cache.size >= this.MAX_CACHE) {
        this.cache.delete(this.cache.keys().next().value!);
      }
      this.cache.set(cacheKey, corrected);
      return corrected;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): Error {
    const e = error as { status?: number; message?: string };
    if (e?.status === 429) return new Error('Quota API dépassé. Réessayez dans quelques instants.');
    if (e?.status === 401 || e?.status === 403) return new Error('Clé API invalide. Vérifiez les paramètres.');
    if (e?.status === 404) return new Error('Modèle introuvable. Changez de modèle dans les paramètres.');
    if (e?.message?.includes('network') || e?.message?.includes('fetch')) {
      return new Error('Erreur réseau. Vérifiez votre connexion.');
    }
    return new Error(e?.message ?? 'Erreur de traduction inconnue.');
  }
}

export const translator = new TranslatorService();
