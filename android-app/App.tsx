import React, { useEffect, useRef } from 'react';
import { NativeModules, AppState, DeviceEventEmitter } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainerRef } from '@react-navigation/native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { storage } from './src/services/storage';
import { translator } from './src/services/translator';
import type { RootStackParamList } from './src/navigation/AppNavigator';

const { ProcessTextModule } = NativeModules as {
  ProcessTextModule?: {
    getPendingText: () => Promise<{ text: string; readonly: boolean } | null>;
  };
};

export default function App() {
  const navRef = useRef<NavigationContainerRef<RootStackParamList> | null>(null);

  useEffect(() => {
    storage.getAll().then(config => {
      if (config.apiKey) translator.init(config.apiKey, config.model);
    });
  }, []);

  // Vérifie le texte passé depuis ProcessTextActivity à chaque focus de l'app
  useEffect(() => {
    const checkProcessText = async () => {
      if (!ProcessTextModule) return;
      const result = await ProcessTextModule.getPendingText();
      if (result?.text && navRef.current) {
        navRef.current.navigate('Translator', {});
        setTimeout(() => DeviceEventEmitter.emit('translateText', result.text), 150);
      }
    };

    checkProcessText();

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') checkProcessText();
    });

    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <AppNavigator navRef={navRef} />
    </SafeAreaProvider>
  );
}
