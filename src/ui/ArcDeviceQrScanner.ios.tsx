import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { parseArcPublicDeviceQr, type ArcPublicDeviceQr } from '../arc/arcDeviceQr';

type Props = { visible: boolean; onCancel: () => void; onScanned: (identity: ArcPublicDeviceQr) => void; onDismissed?: () => void };

/** iOS-only camera. Permission is requested when QR is opened, never on app startup. */
export function ArcDeviceQrScanner({ visible, onCancel, onScanned, onDismissed }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);
  const scanLatch = useRef(false);
  const askedOnOpen = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      askedOnOpen.current = false;
      scanLatch.current = false;
      setError(null);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      return;
    }
    if (permission && !permission.granted && permission.canAskAgain && !askedOnOpen.current) {
      askedOnOpen.current = true;
      void requestPermission().catch(() => setRequestFailed(true));
    }
  }, [visible, permission?.granted, permission?.canAskAgain, requestPermission]);

  const onBarcode = ({ data }: { data: string }) => {
    if (scanLatch.current) return;
    scanLatch.current = true;
    try {
      const identity = parseArcPublicDeviceQr(data);
      setError(null);
      onScanned(identity);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid QR code.');
      retryTimer.current = setTimeout(() => { scanLatch.current = false; }, 1100);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel} onDismiss={onDismissed}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Scan ARC device</Text>
          <TouchableOpacity onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close QR scanner">
            <Text style={styles.close}>Cancel</Text>
          </TouchableOpacity>
        </View>
        {visible && permission?.granted ? (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onBarcode}
            />
            <View pointerEvents="none" style={styles.frame} />
          </View>
        ) : (
          <View style={styles.state}>
            {!permission && !requestFailed ? <ActivityIndicator color="#FFFFFF" /> : null}
            <Text style={styles.stateText}>
              {requestFailed ? 'Could not request camera access.' : permission?.canAskAgain === false
                ? 'Camera access is disabled for ARC. Enable it in iOS Settings to scan your device.'
                : 'ARC needs camera access only while scanning your device label.'}
            </Text>
            {permission && permission.canAskAgain ? (
              <TouchableOpacity style={styles.action} onPress={() => void requestPermission().catch(() => setRequestFailed(true))}>
                <Text style={styles.actionText}>Allow camera</Text>
              </TouchableOpacity>
            ) : permission?.canAskAgain === false ? (
              <TouchableOpacity style={styles.action} onPress={() => void Linking.openSettings()}>
                <Text style={styles.actionText}>Open Settings</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
        <Text style={styles.hint}>Point the camera at an ARC device label. No secret or pairing key is read from the label.</Text>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1420', paddingTop: 56, paddingBottom: 35 },
  header: { paddingHorizontal: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 23, fontWeight: '700', color: '#FFFFFF' },
  close: { color: '#A7CFDF', fontSize: 16, paddingVertical: 10 },
  cameraWrap: { flex: 1, marginHorizontal: 22, overflow: 'hidden', borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  frame: { height: 242, width: 242, borderWidth: 3, borderRadius: 20, borderColor: '#BCE4D8' },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 35, gap: 22 },
  stateText: { textAlign: 'center', color: '#E2EAF1', fontSize: 16, lineHeight: 24 },
  action: { backgroundColor: '#246F70', paddingHorizontal: 24, paddingVertical: 13, borderRadius: 10 },
  actionText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  hint: { textAlign: 'center', color: '#C5D3DD', paddingHorizontal: 35, paddingTop: 21, lineHeight: 20 },
  error: { color: '#FFB7AF', textAlign: 'center', paddingTop: 15, paddingHorizontal: 24 },
});
