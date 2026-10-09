import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View } from 'react-native';
import { portalClient } from './portalClient';
import type { ArcUserSummary } from './portalTypes';

export function PortalPeoplePicker({ selected, onSelect, placeholder, noResults, errorLabel, removeLabel }: {
  selected: ArcUserSummary | null;
  onSelect: (person: ArcUserSummary | null) => void;
  placeholder: string;
  noResults: string;
  errorLabel: string;
  removeLabel: (name: string) => string;
}) {
  const dark = useColorScheme() === 'dark';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ArcUserSummary[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (selected || query.trim().length < 3) { setStatus('idle'); setResults([]); return; }
    let active = true;
    const timer = setTimeout(() => {
      setStatus('loading');
      portalClient.peopleSearch(query.trim()).then(people => {
        if (!active) return;
        setResults(people); setStatus('ready');
      }).catch(() => { if (active) setStatus('error'); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [query, selected]);

  const ink = dark ? '#edf4ee' : '#163025';
  const surface = dark ? '#21362a' : '#f5f8f5';
  const border = dark ? '#4c6655' : '#cfdbd1';
  return <View style={styles.root}>
    {selected ? <View style={[styles.selected, { backgroundColor: surface, borderColor: border }]}><Text style={[styles.name, { color: ink }]}>{selected.displayName}</Text>{selected.secondaryLabel ? <Text style={styles.secondary}>{selected.secondaryLabel}</Text> : null}<TouchableOpacity onPress={() => { onSelect(null); setQuery(''); }} accessibilityLabel={removeLabel(selected.displayName)}><Text style={[styles.clear, { color: ink }]}>×</Text></TouchableOpacity></View>
      : <TextInput style={[styles.input, { backgroundColor: surface, borderColor: border, color: ink }]} value={query} onChangeText={setQuery} placeholder={placeholder} placeholderTextColor={dark ? '#a4b7aa' : '#6b8070'} autoCapitalize="none" autoCorrect={false} />}
    {!selected && status === 'loading' ? <ActivityIndicator style={styles.indicator} size="small" color={ink} /> : null}
    {!selected && status === 'error' ? <Text style={styles.note}>{errorLabel}</Text> : null}
    {!selected && status === 'ready' ? <View style={[styles.results, { borderColor: border }]}>{results.length ? results.map(person => <TouchableOpacity key={person.uid} style={[styles.result, { borderColor: border, backgroundColor: surface }]} onPress={() => { onSelect(person); setQuery(''); }}><View style={styles.resultCopy}><Text style={[styles.name, { color: ink }]}>{person.displayName}</Text>{person.secondaryLabel ? <Text style={styles.secondary}>{person.secondaryLabel}</Text> : null}</View><Text style={[styles.arrow, { color: ink }]}>›</Text></TouchableOpacity>) : <Text style={styles.note}>{noResults}</Text>}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { width: '100%', marginVertical: 8 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, fontSize: 15 },
  selected: { minHeight: 48, borderWidth: 1, borderRadius: 6, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 15, fontWeight: '600' },
  secondary: { fontSize: 12, color: '#7f9685' },
  clear: { fontSize: 24, paddingHorizontal: 8 },
  results: { maxHeight: 220, borderWidth: 1, borderRadius: 6, overflow: 'hidden' },
  result: { minHeight: 48, borderBottomWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center' },
  resultCopy: { flex: 1 },
  arrow: { fontSize: 23 },
  note: { padding: 10, fontSize: 13, color: '#7f9685' },
  indicator: { padding: 8 },
});
