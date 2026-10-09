import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  children: React.ReactNode;
};

export function Section({ title, children }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  body: {
    gap: 12,
  },
});
