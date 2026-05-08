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
type Mode = 'translate' | 'correct';

const CORRECTION_STYLE_LABELS: Record<string, string> = {
  standard: 'Standard',
  formal:   'Formel',
  concise:  'Concis',
  fluent:   'Fluide',
};

export function TranslatorScreen({ route, navigation }: Props) {
  const processTextInput = route.params?.processText ?? null;

  const [activeMode, setActiveMode] = useState<Mode>('translate');

  // Traduction
  const [sourceText, setSourceText] = useState(processTextInput ?? '');
  const [translation, setTranslation] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('fr');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Correction
  const [correction, setCorrection] = useState('');
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [correctionError, setCorrectionError] = useState('');
  const [corrCopied, setCorrCopied] = useState(false);
  const [correctionStyle, setCorrectionStyle] = useState('standard');
  const [correctionLang, setCorrectionLang] = useState('auto');
  const corrFadeAnim = useRef(new Animated.Value(0)).current;

  const [langModalFor, setLangModalFor] = useState<'source' | 'target' | null>(null);

  const sourceLangRef = useRef(sourceLang);
  const targetLangRef = useRef(targetLang);
  const corrStyleRef = useRef(correctionStyle);
  const corrLangRef = useRef(correctionLang);
  const isInitialized = useRef(false);

  useEffect(() => { sourceLangRef.current = sourceLang; }, [sourceLang]);
  useEffect(() => { targetLangRef.current = targetLang; }, [targetLang]);
  useEffect(() => { corrStyleRef.current = correctionStyle; }, [correctionStyle]);
  useEffect(() => { corrLangRef.current = correctionLang; }, [correctionLang]);

  useEffect(() => {
    storage.getAll().then(cfg => {
      setSourceLang(cfg.sourceLang);
      setTargetLang(cfg.targetLang);
      setCorrectionStyle(cfg.correctionStyle ?? 'standard');
      setCorrectionLang(cfg.correctionLang ?? 'auto');
      sourceLangRef.current = cfg.sourceLang;
      targetLangRef.current = cfg.targetLang;
      corrStyleRef.current = cfg.correctionStyle ?? 'standard';
      corrLangRef.current = cfg.correctionLang ?? 'auto';
      isInitialized.current = true;
      if (processTextInput) {
        handleTranslate(processTextInput, cfg.sourceLang, cfg.targetLang);
      }
    });
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('translateText', (text: string) => {
      setSourceText(text);
      setTranslation('');
      setError('');
      fadeAnim.setValue(0);
      setActiveMode('translate');
      handleTranslate(text, sourceLangRef.current, targetLangRef.current);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('correctText', (text: string) => {
      setSourceText(text);
      setCorrection('');
      setCorrectionError('');
      corrFadeAnim.setValue(0);
      setActiveMode('correct');
      handleCorrect(text, corrStyleRef.current, corrLangRef.current);
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
    fadeAnim.setValue(0);

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

  const handleCorrect = useCallback(async (
    text: string = sourceText,
    style: string = correctionStyle,
    lang: string = correctionLang,
  ) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setIsCorrecting(true);
    setCorrectionError('');
    setCorrection('');
    corrFadeAnim.setValue(0);

    try {
      const result = await translator.correct(trimmed, style, lang);
      setCorrection(result);
      Animated.timing(corrFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } catch (err: unknown) {
      setCorrectionError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsCorrecting(false);
    }
  }, [sourceText, correctionStyle, correctionLang, corrFadeAnim]);

  const handleSwap = useCallback(() => {
    if (sourceLang === 'auto') return;
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(translation);
    setTranslation(sourceText);
    fadeAnim.setValue(translation ? 1 : 0);
  }, [sourceLang, targetLang, sourceText, translation, fadeAnim]);

  const handleCopy = useCallback(() => {
    Clipboard.setString(translation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [translation]);

  const handleCopyCorrection = useCallback(() => {
    Clipboard.setString(correction);
    setCorrCopied(true);
    setTimeout(() => setCorrCopied(false), 2000);
  }, [correction]);

  const handleShare = useCallback(async () => {
    await Share.share({ message: activeMode === 'correct' ? correction : translation });
  }, [activeMode, translation, correction]);

  const handleClear = useCallback(() => {
    setSourceText('');
    setTranslation('');
    setCorrection('');
    setError('');
    setCorrectionError('');
    fadeAnim.setValue(0);
    corrFadeAnim.setValue(0);
  }, [fadeAnim, corrFadeAnim]);

  const sourceLangLabel = LANGUAGES[sourceLang] ?? sourceLang;
  const targetLangLabel = LANGUAGES[targetLang] ?? targetLang;

  const isTranslateMode = activeMode === 'translate';
  const hasOutput = isTranslateMode
    ? (isLoading || translation || error)
    : (isCorrecting || correction || correctionError);

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

      {/* Onglets */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, isTranslateMode && styles.tabActiveTranslate]}
          onPress={() => setActiveMode('translate')}
        >
          <Text style={[styles.tabText, isTranslateMode && styles.tabTextTranslate]}>
            🌐  Traduction
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, !isTranslateMode && styles.tabActiveCorrect]}
          onPress={() => setActiveMode('correct')}
        >
          <Text style={[styles.tabText, !isTranslateMode && styles.tabTextCorrect]}>
            ✓  Correction
          </Text>
        </TouchableOpacity>
      </View>

      {/* Barre de langues — uniquement en mode traduction */}
      {isTranslateMode && (
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
      )}

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Carte d'entrée */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>
              {isTranslateMode ? sourceLangLabel : 'Texte à corriger'}
            </Text>
            {sourceText.length > 0 && (
              <TouchableOpacity onPress={handleClear}>
                <Text style={styles.clearBtn}>Effacer</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={styles.sourceInput}
            multiline
            placeholder={isTranslateMode ? 'Entrez le texte à traduire...' : 'Entrez le texte à corriger...'}
            placeholderTextColor={colors.textMuted}
            value={sourceText}
            onChangeText={text => {
              setSourceText(text);
              if (!text.trim()) {
                setTranslation(''); setError('');
                setCorrection(''); setCorrectionError('');
              }
            }}
            textAlignVertical="top"
          />
          <View style={styles.cardFooter}>
            <Text style={styles.charCount}>{sourceText.length} car.</Text>
            {isTranslateMode ? (
              <TouchableOpacity
                style={[styles.actionMainBtn, styles.translateColor, (!sourceText.trim() || isLoading) && styles.actionMainBtnDisabled]}
                onPress={() => handleTranslate()}
                disabled={!sourceText.trim() || isLoading}
              >
                <Text style={styles.actionMainBtnText}>Traduire</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionMainBtn, styles.correctColor, (!sourceText.trim() || isCorrecting) && styles.actionMainBtnDisabled]}
                onPress={() => handleCorrect()}
                disabled={!sourceText.trim() || isCorrecting}
              >
                <Text style={styles.actionMainBtnText}>Corriger</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Carte résultat */}
        {hasOutput && (
          <Animated.View style={[
            styles.card,
            styles.resultCard,
            isTranslateMode ? styles.resultCardTranslate : styles.resultCardCorrect,
            { opacity: (isTranslateMode ? isLoading : isCorrecting) ? 1 : (isTranslateMode ? fadeAnim : corrFadeAnim) },
          ]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardLabel, isTranslateMode ? styles.cardLabelTranslate : styles.cardLabelCorrect]}>
                {isTranslateMode
                  ? targetLangLabel
                  : `Texte corrigé · ${CORRECTION_STYLE_LABELS[correctionStyle] ?? correctionStyle}`}
              </Text>
              {(isTranslateMode ? translation : correction) ? (
                <View style={styles.resultActions}>
                  <TouchableOpacity
                    onPress={isTranslateMode ? handleCopy : handleCopyCorrection}
                    style={styles.actionBtn}
                  >
                    <Text style={styles.actionBtnText}>
                      {(isTranslateMode ? copied : corrCopied) ? '✓ Copié' : 'Copier'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleShare} style={styles.actionBtn}>
                    <Text style={styles.actionBtnText}>Partager</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {(isTranslateMode ? isLoading : isCorrecting) && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={isTranslateMode ? colors.primary : colors.success} />
                <Text style={styles.loadingText}>
                  {isTranslateMode ? 'Traduction en cours...' : 'Correction en cours...'}
                </Text>
              </View>
            )}

            {!(isTranslateMode ? isLoading : isCorrecting) && (isTranslateMode ? error : correctionError) ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorText}>{isTranslateMode ? error : correctionError}</Text>
              </View>
            ) : null}

            {!(isTranslateMode ? isLoading : isCorrecting) && (isTranslateMode ? translation : correction) ? (
              <Text style={styles.resultText} selectable>
                {isTranslateMode ? translation : correction}
              </Text>
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

  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActiveTranslate: { borderBottomColor: colors.primary },
  tabActiveCorrect:   { borderBottomColor: colors.success },
  tabText:            { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextTranslate:   { color: colors.primary },
  tabTextCorrect:     { color: colors.success },

  langBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  langBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: colors.surfaceElevated, borderRadius: radius.md, gap: 4,
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
  resultCard: { marginTop: 0 },
  resultCardTranslate: { borderColor: colors.primaryMuted },
  resultCardCorrect:   { borderColor: '#4CAF8233' },

  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  cardLabel:          { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  cardLabelTranslate: { color: colors.primaryLight },
  cardLabelCorrect:   { color: colors.success },
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

  actionMainBtn: {
    paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: radius.full,
  },
  actionMainBtnDisabled: { backgroundColor: colors.border },
  actionMainBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  translateColor: { backgroundColor: colors.primary },
  correctColor:   { backgroundColor: colors.success },

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
  resultText: { fontSize: 16, color: colors.text, lineHeight: 26, padding: spacing.md },

  bottomPad: { height: 40 },
});
