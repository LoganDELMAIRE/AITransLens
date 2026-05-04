import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Keyboard, Share,
  Animated, StatusBar, DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { translator, LANGUAGES } from '../services/translator';
import { storage } from '../services/storage';
import { LanguageSelector } from '../components/LanguageSelector';
import { colors, spacing, radius } from '../theme';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Translator'>;

export function TranslatorScreen({ route, navigation }: Props) {
  const processTextInput = route.params?.processText ?? null;

  const [sourceText, setSourceText] = useState(processTextInput ?? '');
  const [translation, setTranslation] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('fr');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [langModalFor, setLangModalFor] = useState<'source' | 'target' | null>(null);
  const [copied, setCopied] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isInitialized = useRef(false);
  const sourceLangRef = useRef(sourceLang);
  const targetLangRef = useRef(targetLang);

  useEffect(() => { sourceLangRef.current = sourceLang; }, [sourceLang]);
  useEffect(() => { targetLangRef.current = targetLang; }, [targetLang]);

  useEffect(() => {
    storage.getAll().then(cfg => {
      setSourceLang(cfg.sourceLang);
      setTargetLang(cfg.targetLang);
      sourceLangRef.current = cfg.sourceLang;
      targetLangRef.current = cfg.targetLang;
      isInitialized.current = true;
      if (processTextInput) {
        handleTranslate(processTextInput, cfg.sourceLang, cfg.targetLang);
      }
    });
  }, []);

  // Traduction déclenchée depuis le bouton flottant ou ProcessText via DeviceEventEmitter
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('translateText', (text: string) => {
      setSourceText(text);
      setTranslation('');
      setError('');
      fadeAnim.setValue(0);
      handleTranslate(text, sourceLangRef.current, targetLangRef.current);
    });
    return () => sub.remove();
  }, []);

  const handleTranslate = useCallback(async (
    text: string = sourceText,
    src: string = sourceLang,
    tgt: string = targetLang,
  ) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setIsLoading(true);
    setError('');
    setTranslation('');

    try {
      const result = await translator.translate(trimmed, src, tgt);
      setTranslation(result);
      await storage.addHistory({ sourceText: trimmed, translation: result, sourceLang: src, targetLang: tgt });
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  }, [sourceText, sourceLang, targetLang, fadeAnim]);

  const handleSwap = useCallback(() => {
    if (sourceLang === 'auto') return;
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(translation);
    setTranslation(sourceText);
    fadeAnim.setValue(translation ? 1 : 0);
  }, [sourceLang, targetLang, sourceText, translation, fadeAnim]);

  const handleCopy = useCallback(async () => {
    Clipboard.setString(translation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [translation]);

  const handleShare = useCallback(async () => {
    await Share.share({ message: translation });
  }, [translation]);

  const handleClear = useCallback(() => {
    setSourceText('');
    setTranslation('');
    setError('');
    fadeAnim.setValue(0);
  }, [fadeAnim]);

  const sourceLangLabel = LANGUAGES[sourceLang] ?? sourceLang;
  const targetLangLabel = LANGUAGES[targetLang] ?? targetLang;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <Text style={styles.headerIcon}>🌐</Text>
          <Text style={styles.headerTitle}>AITransLens</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate('History')} style={styles.headerBtn}>
            <Text style={styles.headerBtnIcon}>🕐</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.headerBtn}>
            <Text style={styles.headerBtnIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.langBar}>
        <TouchableOpacity style={styles.langBtn} onPress={() => setLangModalFor('source')}>
          <Text style={styles.langBtnText}>{sourceLangLabel}</Text>
          <Text style={styles.langBtnArrow}>▾</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.swapBtn, sourceLang === 'auto' && styles.swapBtnDisabled]}
          onPress={handleSwap}
          disabled={sourceLang === 'auto'}
        >
          <Text style={styles.swapIcon}>⇄</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.langBtn} onPress={() => setLangModalFor('target')}>
          <Text style={styles.langBtnText}>{targetLangLabel}</Text>
          <Text style={styles.langBtnArrow}>▾</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>{sourceLangLabel}</Text>
            {sourceText.length > 0 && (
              <TouchableOpacity onPress={handleClear}>
                <Text style={styles.clearBtn}>Effacer</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={styles.sourceInput}
            multiline
            placeholder="Entrez le texte à traduire..."
            placeholderTextColor={colors.textMuted}
            value={sourceText}
            onChangeText={text => {
              setSourceText(text);
              if (!text.trim()) { setTranslation(''); setError(''); }
            }}
            textAlignVertical="top"
          />
          <View style={styles.cardFooter}>
            <Text style={styles.charCount}>{sourceText.length} car.</Text>
            <TouchableOpacity
              style={[styles.translateBtn, (!sourceText.trim() || isLoading) && styles.translateBtnDisabled]}
              onPress={() => handleTranslate()}
              disabled={!sourceText.trim() || isLoading}
            >
              <Text style={styles.translateBtnText}>Traduire</Text>
            </TouchableOpacity>
          </View>
        </View>

        {(isLoading || translation || error) && (
          <Animated.View style={[styles.card, styles.resultCard, { opacity: isLoading ? 1 : fadeAnim }]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>{targetLangLabel}</Text>
              {translation ? (
                <View style={styles.resultActions}>
                  <TouchableOpacity onPress={handleCopy} style={styles.actionBtn}>
                    <Text style={styles.actionBtnText}>{copied ? '✓ Copié' : 'Copier'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleShare} style={styles.actionBtn}>
                    <Text style={styles.actionBtnText}>Partager</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingText}>Traduction en cours...</Text>
              </View>
            )}

            {!isLoading && error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {!isLoading && translation ? (
              <Text style={styles.translationText} selectable>{translation}</Text>
            ) : null}
          </Animated.View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      <LanguageSelector
        visible={langModalFor === 'source'}
        selected={sourceLang}
        onSelect={setSourceLang}
        onClose={() => setLangModalFor(null)}
      />
      <LanguageSelector
        visible={langModalFor === 'target'}
        selected={targetLang}
        excludeAuto
        onSelect={setTargetLang}
        onClose={() => setLangModalFor(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { fontSize: 22 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.primaryLight, letterSpacing: 0.3 },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerBtn: { padding: 8 },
  headerBtnIcon: { fontSize: 20 },

  langBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  langBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: colors.surfaceElevated, borderRadius: radius.md,
    gap: 4,
  },
  langBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  langBtnArrow: { fontSize: 10, color: colors.textMuted },
  swapBtn: {
    width: 40, height: 40, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 8, backgroundColor: colors.primaryMuted,
  },
  swapBtnDisabled: { opacity: 0.3 },
  swapIcon: { fontSize: 18, color: colors.primary },

  scroll: { flex: 1 },
  card: {
    margin: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  resultCard: { borderColor: colors.primaryMuted },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  cardLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  clearBtn: { fontSize: 13, color: colors.primary },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  charCount: { fontSize: 12, color: colors.textMuted },
  sourceInput: {
    minHeight: 120, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: 16, color: colors.text, lineHeight: 24,
  },
  translateBtn: {
    paddingHorizontal: 20, paddingVertical: 8,
    backgroundColor: colors.primary, borderRadius: radius.full,
  },
  translateBtnDisabled: { backgroundColor: colors.border },
  translateBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },

  resultActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: colors.surfaceElevated, borderRadius: radius.full,
  },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: colors.primaryLight },

  loadingContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.md },
  loadingText: { fontSize: 14, color: colors.textSecondary },
  errorContainer: { padding: spacing.md, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  errorIcon: { fontSize: 16 },
  errorText: { flex: 1, fontSize: 14, color: colors.error, lineHeight: 20 },
  translationText: {
    fontSize: 16, color: colors.text, lineHeight: 26,
    padding: spacing.md,
  },
  bottomPad: { height: 40 },
});
