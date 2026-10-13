import React from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ArcPublicDeviceQr } from '../arc/arcDeviceQr';
import type { PortalDeviceSummary } from '../cloud/portalTypes';

export type ArcQrReviewState = {
  identity: ArcPublicDeviceQr;
  phase: 'loading' | 'registered' | 'choose' | 'error';
  registered?: PortalDeviceSummary;
  choices?: PortalDeviceSummary[];
  error?: string;
};

type Props = {
  state: ArcQrReviewState | null;
  onDismiss: () => void;
  onChoose: (device: PortalDeviceSummary) => void;
  onLocal: () => void;
  onOpenRegistered: (device: PortalDeviceSummary) => void;
};

/** No QR-only binding writes. Local hardware UID verification remains mandatory. */
export function ArcDeviceQrReview({ state, onDismiss, onChoose, onLocal, onOpenRegistered }: Props) {
  return (
    <Modal visible={!!state} transparent animationType="fade" onRequestClose={onDismiss}>
      {state ? <View style={styles.scrim}><View style={styles.panel}>
        <Text style={styles.title}>ARC device identity</Text>
        <Text style={styles.subTitle}>{state.identity.deviceType.toUpperCase()}</Text>
        <Text style={styles.uid} selectable>{state.identity.hardwareUid}</Text>
        {state.phase === 'loading' ? <View style={styles.progress}><ActivityIndicator color="#A7CFDF" /><Text style={styles.body}>Checking your ARC inventory…</Text></View> : null}
        {state.phase === 'error' ? <Text style={styles.error}>{state.error ?? 'Unable to verify this QR label.'}</Text> : null}
        {state.phase === 'registered' && state.registered ? <>
          <Text style={styles.body}>Registered to your account:</Text>
          <Text style={styles.device}>{state.registered.displayName}</Text>
          <Text style={styles.caption}>Identity matched against the ARC backend. This is not an encrypted local bond.</Text>
          <TouchableOpacity style={styles.action} onPress={() => onOpenRegistered(state.registered!)} accessibilityRole="button"><Text style={styles.actionText}>View device</Text></TouchableOpacity>
        </> : null}
        {state.phase === 'choose' ? <>
          <Text style={styles.body}>Choose which already-claimed ARC node this physical device should represent.</Text>
          <Text style={styles.caption}>Your selection is pending until the app reads the same UID directly from the connected hardware. A scanned label alone cannot authorize control.</Text>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {(state.choices ?? []).map(device => <TouchableOpacity key={device.id} style={styles.choice} onPress={() => onChoose(device)} accessibilityRole="button">
              <Text style={styles.device}>{device.displayName}</Text><Text style={styles.caption}>{device.id}</Text>
            </TouchableOpacity>)}
            {!state.choices?.length ? <Text style={styles.error}>No eligible claimed {state.identity.deviceType} devices found for this account. Claim the canonical device first.</Text> : null}
          </ScrollView>
        </> : null}
        {state.phase !== 'loading' && state.phase !== 'error' ? <TouchableOpacity style={styles.secondary} onPress={onLocal} accessibilityRole="button"><Text style={styles.secondaryText}>Continue in Local</Text></TouchableOpacity> : null}
        <TouchableOpacity style={styles.secondary} onPress={onDismiss} accessibilityRole="button"><Text style={styles.secondaryText}>Close</Text></TouchableOpacity>
      </View></View> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 22 },
  panel: { backgroundColor: '#18232E', width: '100%', maxWidth: 540, maxHeight: '83%', borderRadius: 17, padding: 22, gap: 12 },
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '700' },
  subTitle: { color: '#ACD7D0', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  uid: { color: '#D7E8ED', fontSize: 13, fontFamily: 'Menlo', letterSpacing: 0.2 },
  body: { color: '#EEF3F5', fontSize: 15, lineHeight: 21 },
  device: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  caption: { color: '#AEC0CC', fontSize: 12, lineHeight: 18 },
  error: { color: '#FFB2AA', fontSize: 14, lineHeight: 20 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  list: { maxHeight: 250 },
  choice: { padding: 13, borderRadius: 9, borderColor: '#536A77', borderWidth: 1, marginBottom: 9, gap: 5 },
  action: { borderRadius: 8, backgroundColor: '#286C70', alignItems: 'center', padding: 13 },
  actionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  secondary: { borderRadius: 8, borderColor: '#516675', borderWidth: 1, padding: 12, alignItems: 'center' },
  secondaryText: { color: '#D4EBF2', fontSize: 15 },
});
