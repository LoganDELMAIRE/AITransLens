import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, FlatList,
  StyleSheet, TextInput, SafeAreaView,
} from 'react-native';
import { LANGUAGES } from '../services/translator';
import { colors } from '../theme';

interface Props {
  visible: boolean;
  selected: string;
  excludeAuto?: boolean;
  onSelect: (lang: string) => void;
  onClose: () => void;
}

export function LanguageSelector({ visible, selected, excludeAuto, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');

  const entries = Object.entries(LANGUAGES).filter(([code, name]) => {
    if (excludeAuto && code === 'auto') return false;
    return name.toLowerCase().includes(search.toLowerCase()) ||
      code.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Choisir une langue</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.search}
          placeholder="Rechercher..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoFocus
        />

        <FlatList
          data={entries}
          keyExtractor={([code]) => code}
          renderItem={({ item: [code, name] }) => (
            <TouchableOpacity
              style={[styles.item, selected === code && styles.itemSelected]}
              onPress={() => { onSelect(code); setSearch(''); onClose(); }}
            >
              <Text style={[styles.itemName, selected === code && styles.itemNameSelected]}>
                {name}
              </Text>
              <Text style={styles.itemCode}>{code.toUpperCase()}</Text>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '600', color: colors.text },
  closeBtn: { padding: 8 },
  closeTxt: { fontSize: 16, color: colors.textSecondary },
  search: {
    margin: 16, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.surface, borderRadius: 12,
    color: colors.text, fontSize: 16, borderWidth: 1, borderColor: colors.border,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  itemSelected: { backgroundColor: colors.primaryMuted },
  itemName: { fontSize: 16, color: colors.text },
  itemNameSelected: { color: colors.primary, fontWeight: '600' },
  itemCode: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
});
