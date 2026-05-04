import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { storage, TranslationHistoryItem } from '../services/storage';
import { LANGUAGES } from '../services/translator';
import { colors, spacing, radius } from '../theme';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

export function HistoryScreen({ navigation }: Props) {
  const [history, setHistory] = useState<TranslationHistoryItem[]>([]);

  useFocusEffect(useCallback(() => {
    storage.getHistory().then(setHistory);
  }, []));

  const handleClear = () => {
    Alert.alert('Effacer l\'historique', 'Supprimer toutes les traductions ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Effacer', style: 'destructive', onPress: async () => {
          await storage.clearHistory();
          setHistory([]);
        },
      },
    ]);
  };

  const handleItemPress = (item: TranslationHistoryItem) => {
    navigation.navigate('Translator', { processText: item.sourceText });
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historique</Text>
        {history.length > 0 && (
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Effacer</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={history}
        keyExtractor={item => item.id}
        contentContainerStyle={history.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>Aucune traduction pour l'instant</Text>
            <Text style={styles.emptyHint}>Vos traductions apparaîtront ici</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => handleItemPress(item)}
            onLongPress={() => {
              Clipboard.setString(item.translation);
              Alert.alert('Copié', 'Traduction copiée dans le presse-papier.');
            }}
          >
            <View style={styles.cardTop}>
              <Text style={styles.langPair}>
                {(LANGUAGES[item.sourceLang] ?? item.sourceLang)} → {(LANGUAGES[item.targetLang] ?? item.targetLang)}
              </Text>
              <Text style={styles.date}>{formatDate(item.timestamp)}</Text>
            </View>
            <Text style={styles.sourceText} numberOfLines={2}>{item.sourceText}</Text>
            <View style={styles.separator} />
            <Text style={styles.translationText} numberOfLines={2}>{item.translation}</Text>
          </TouchableOpacity>
        )}
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
  backBtn: { padding: 8 },
  backIcon: { fontSize: 22, color: colors.primary },
  headerTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  clearBtn: { padding: 8 },
  clearBtnText: { fontSize: 14, color: colors.error },
  listContent: { padding: spacing.md, gap: 10 },
  emptyContainer: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 18, fontWeight: '600', color: colors.textSecondary },
  emptyHint: { fontSize: 14, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  langPair: { fontSize: 12, fontWeight: '600', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  date: { fontSize: 11, color: colors.textMuted },
  sourceText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  separator: { height: 1, backgroundColor: colors.border },
  translationText: { fontSize: 14, color: colors.text, lineHeight: 20, fontWeight: '500' },
});
