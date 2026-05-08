import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppConfig {
  apiKey: string;
  model: string;
  sourceLang: string;
  targetLang: string;
  correctionStyle: string;
  correctionLang: string;
}

const DEFAULTS: AppConfig = {
  apiKey: '',
  model: 'gemini-2.5-flash',
  sourceLang: 'auto',
  targetLang: 'fr',
  correctionStyle: 'standard',
  correctionLang: 'auto',
};

const STORAGE_KEY = '@aitranslens:config';

export interface TranslationHistoryItem {
  id: string;
  sourceText: string;
  translation: string;
  sourceLang: string;
  targetLang: string;
  timestamp: number;
}

const HISTORY_KEY = '@aitranslens:history';
const MAX_HISTORY = 30;

export const storage = {
  async getAll(): Promise<AppConfig> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  },

  async get<K extends keyof AppConfig>(key: K): Promise<AppConfig[K]> {
    const config = await this.getAll();
    return config[key];
  },

  async set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> {
    const config = await this.getAll();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, [key]: value }));
  },

  async merge(partial: Partial<AppConfig>): Promise<void> {
    const config = await this.getAll();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, ...partial }));
  },

  async getHistory(): Promise<TranslationHistoryItem[]> {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async addHistory(item: Omit<TranslationHistoryItem, 'id' | 'timestamp'>): Promise<void> {
    const history = await this.getHistory();
    const newItem: TranslationHistoryItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    };
    const updated = [newItem, ...history].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  },

  async clearHistory(): Promise<void> {
    await AsyncStorage.removeItem(HISTORY_KEY);
  },
};
