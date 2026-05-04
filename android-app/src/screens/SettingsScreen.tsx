import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, StatusBar, NativeModules, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

const { PermissionsModule } = NativeModules as {
  PermissionsModule?: {
    hasOverlayPermission: () => Promise<boolean>;
    hasAccessibilityPermission: () => Promise<boolean>;
    requestOverlayPermission: () => void;
    requestAccessibilityPermission: () => void;
    startFloatingService: () => Promise<boolean>;
    stopFloatingService: () => void;
  };
};
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { storage, AppConfig } from '../services/storage';
import { translator } from '../services/translator';
import { LanguageSelector } from '../components/LanguageSelector';
import { colors, spacing, radius } from '../theme';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (recommandé)' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (plus précis)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
];

export function SettingsScreen({ navigation }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [langModalFor, setLangModalFor] = useState<'source' | 'target' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [hasOverlay, setHasOverlay] = useState(false);
  const [hasAccessibility, setHasAccessibility] = useState(false);
  const [floatingActive, setFloatingActive] = useState(false);

  useEffect(() => {
    storage.getAll().then(setConfig);
  }, []);

  const checkPermissions = useCallback(async () => {
    if (!PermissionsModule) return;
    const [overlay, accessibility] = await Promise.all([
      PermissionsModule.hasOverlayPermission(),
      PermissionsModule.hasAccessibilityPermission(),
    ]);
    setHasOverlay(overlay);
    setHasAccessibility(accessibility);
    setFloatingActive(overlay && accessibility);
  }, []);

  useFocusEffect(useCallback(() => {
    checkPermissions();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') checkPermissions(); });
    return () => sub.remove();
  }, [checkPermissions]));

  const handleToggleFloating = async () => {
    if (!PermissionsModule) return;
    if (floatingActive) {
      PermissionsModule.stopFloatingService();
      setFloatingActive(false);
    } else {
      if (!hasOverlay) {
        Alert.alert(
          'Permission requise',
          'AITransLens doit pouvoir afficher des fenêtres par-dessus les autres apps.',
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Autoriser', onPress: () => PermissionsModule.requestOverlayPermission() },
          ]
        );
        return;
      }
      if (!hasAccessibility) {
        Alert.alert(
          'Accessibilité requise',
          'Activez "AITransLens" dans les services d\'accessibilité pour détecter le texte sélectionné.',
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Ouvrir les réglages', onPress: () => PermissionsModule.requestAccessibilityPermission() },
          ]
        );
        return;
      }
      try {
        await PermissionsModule.startFloatingService();
        setFloatingActive(true);
      } catch {
        Alert.alert('Erreur', 'Impossible de démarrer le service flottant.');
      }
    }
  };

  const update = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setConfig(prev => prev ? { ...prev, [key]: value } : prev);
    setDirty(true);
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!config) return;
    await storage.merge(config);
    if (config.apiKey) translator.init(config.apiKey, config.model);
    setDirty(false);
    Alert.alert('Sauvegardé', 'Les paramètres ont été mis à jour.');
    navigation.goBack();
  };

  const handleTest = async () => {
    if (!config?.apiKey) {
      setTestResult({ ok: false, msg: 'Veuillez entrer une clé API.' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      translator.init(config.apiKey, config.model);
      await translator.translate('Hello', 'en', 'fr');
      setTestResult({ ok: true, msg: 'Connexion réussie !' });
    } catch (err: unknown) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : 'Erreur inconnue' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClearHistory = () => {
    Alert.alert('Effacer l\'historique', 'Supprimer toutes les traductions enregistrées ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: () => storage.clearHistory() },
    ]);
  };

  if (!config) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paramètres</Text>
        <TouchableOpacity
          style={[styles.saveBtn, !dirty && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!dirty}
        >
          <Text style={styles.saveBtnText}>Sauvegarder</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll}>

        <SectionHeader title="API Gemini" />
        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>Clé API</Text>
            <View style={styles.apiKeyRow}>
              <TextInput
                style={[styles.input, styles.inputFlex]}
                value={config.apiKey}
                onChangeText={v => update('apiKey', v)}
                secureTextEntry={!apiKeyVisible}
                placeholder="Votre clé API Google AI Studio"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setApiKeyVisible(v => !v)} style={styles.eyeBtn}>
                <Text style={styles.eyeIcon}>{apiKeyVisible ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.field}>
            <Text style={styles.label}>Modèle</Text>
            {MODELS.map(m => (
              <TouchableOpacity
                key={m.id}
                style={styles.radioRow}
                onPress={() => update('model', m.id)}
              >
                <View style={[styles.radio, config.model === m.id && styles.radioSelected]}>
                  {config.model === m.id && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.radioLabel}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.divider} />

          <View style={styles.testRow}>
            <TouchableOpacity style={styles.testBtn} onPress={handleTest} disabled={isTesting}>
              {isTesting
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={styles.testBtnText}>Tester la connexion</Text>
              }
            </TouchableOpacity>
            {testResult && (
              <Text style={[styles.testResult, testResult.ok ? styles.testOk : styles.testErr]}>
                {testResult.ok ? '✓ ' : '✕ '}{testResult.msg}
              </Text>
            )}
          </View>
        </View>

        <SectionHeader title="Traduction par défaut" />
        <View style={styles.card}>
          <TouchableOpacity style={styles.settingRow} onPress={() => setLangModalFor('source')}>
            <Text style={styles.settingLabel}>Langue source</Text>
            <Text style={styles.settingValue}>{config.sourceLang === 'auto' ? 'Détection auto' : config.sourceLang.toUpperCase()}</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.settingRow} onPress={() => setLangModalFor('target')}>
            <Text style={styles.settingLabel}>Langue cible</Text>
            <Text style={styles.settingValue}>{config.targetLang.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        <SectionHeader title="Bouton flottant" />
        <View style={styles.card}>
          <View style={styles.floatingHeader}>
            <View style={styles.floatingInfo}>
              <Text style={styles.settingLabel}>Traduire à la sélection</Text>
              <Text style={styles.floatingDesc}>
                Un bouton apparaît dès qu'un texte est sélectionné dans n'importe quelle app
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.toggleBtn, floatingActive && styles.toggleBtnOn]}
              onPress={handleToggleFloating}
            >
              <Text style={styles.toggleTxt}>{floatingActive ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>
          </View>

          {!floatingActive && (
            <>
              <View style={styles.divider} />
              <PermissionRow
                label="Fenêtres par-dessus les apps"
                granted={hasOverlay}
                onPress={() => PermissionsModule?.requestOverlayPermission()}
              />
              <View style={styles.divider} />
              <PermissionRow
                label="Service d'accessibilité"
                granted={hasAccessibility}
                onPress={() => PermissionsModule?.requestAccessibilityPermission()}
              />
            </>
          )}
        </View>

        <SectionHeader title="Données" />
        <View style={styles.card}>
          <TouchableOpacity style={styles.settingRow} onPress={handleClearHistory}>
            <Text style={[styles.settingLabel, styles.dangerText]}>Effacer l'historique</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <SectionHeader title="À propos" />
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Version</Text>
            <Text style={styles.settingValue}>1.0.0</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Modèle IA</Text>
            <Text style={styles.settingValue}>Google Gemini</Text>
          </View>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      <LanguageSelector
        visible={langModalFor === 'source'}
        selected={config.sourceLang}
        onSelect={v => update('sourceLang', v)}
        onClose={() => setLangModalFor(null)}
      />
      <LanguageSelector
        visible={langModalFor === 'target'}
        selected={config.targetLang}
        excludeAuto
        onSelect={v => update('targetLang', v)}
        onClose={() => setLangModalFor(null)}
      />
    </SafeAreaView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function PermissionRow({ label, granted, onPress }: { label: string; granted: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.settingRow} onPress={granted ? undefined : onPress} disabled={granted}>
      <Text style={styles.settingLabel}>{label}</Text>
      {granted
        ? <Text style={styles.permGranted}>✓ Accordé</Text>
        : <Text style={styles.permDenied}>Autoriser →</Text>
      }
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: 8 },
  backIcon: { fontSize: 22, color: colors.primary },
  headerTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  saveBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: colors.primary, borderRadius: radius.full,
  },
  saveBtnDisabled: { backgroundColor: colors.border },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },

  scroll: { flex: 1 },
  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.2,
    marginHorizontal: spacing.md, marginTop: 24, marginBottom: 8,
  },
  card: {
    marginHorizontal: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  field: { padding: spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
  input: {
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: colors.surfaceElevated, borderRadius: radius.md,
    color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border,
  },
  inputFlex: { flex: 1 },
  apiKeyRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  eyeBtn: { padding: 10 },
  eyeIcon: { fontSize: 18 },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  radioLabel: { fontSize: 14, color: colors.text, flex: 1 },
  testRow: { padding: spacing.md, gap: 10 },
  testBtn: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.primary, borderRadius: radius.md,
    alignItems: 'center',
  },
  testBtnText: { fontSize: 14, fontWeight: '600', color: colors.white },
  testResult: { fontSize: 13, lineHeight: 18 },
  testOk: { color: colors.success },
  testErr: { color: colors.error },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 14,
  },
  settingLabel: { fontSize: 15, color: colors.text },
  settingValue: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  dangerText: { color: colors.error },
  chevron: { fontSize: 18, color: colors.textMuted },
  bottomPad: { height: 40 },

  floatingHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  floatingInfo: { flex: 1, marginRight: spacing.md },
  floatingDesc: { fontSize: 12, color: colors.textMuted, marginTop: 3, lineHeight: 16 },
  toggleBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: colors.border, borderRadius: radius.full, minWidth: 52, alignItems: 'center',
  },
  toggleBtnOn: { backgroundColor: colors.primary },
  toggleTxt: { fontSize: 12, fontWeight: '700', color: colors.white },
  permGranted: { fontSize: 13, color: colors.success, fontWeight: '600' },
  permDenied: { fontSize: 13, color: colors.primary, fontWeight: '600' },
});
