import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function NumberField({ label, value, onChange, disabled }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, disabled && styles.inputDisabled]}
        keyboardType="numeric"
        value={value}
        onChangeText={onChange}
        editable={!disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
  label: {
    color: '#cbd5f5',
    fontSize: 13,
  },
  input: {
    backgroundColor: '#0b1220',
    borderRadius: 8,
    padding: 10,
    color: '#f8fafc',
    borderColor: '#1f2a44',
    borderWidth: 1,
  },
  inputDisabled: {
    opacity: 0.6,
  },
});
