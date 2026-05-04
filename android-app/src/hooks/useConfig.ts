import { useState, useEffect, useCallback } from 'react';
import { AppConfig, storage } from '../services/storage';
import { translator } from '../services/translator';

export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storage.getAll().then(cfg => {
      setConfig(cfg);
      if (cfg.apiKey) translator.init(cfg.apiKey, cfg.model);
      setLoading(false);
    });
  }, []);

  const updateConfig = useCallback(async (partial: Partial<AppConfig>) => {
    await storage.merge(partial);
    const updated = await storage.getAll();
    setConfig(updated);
    if (updated.apiKey) translator.init(updated.apiKey, updated.model);
  }, []);

  return { config, loading, updateConfig };
}
