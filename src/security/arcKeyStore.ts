import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { ArcIdentity, ArcPublicKey } from './arcIdentity';

const PRIVATE_KEY_SLOT = 'arc.security.user.private.v1';
const PUBLIC_IDENTITY_SLOT = 'arc.security.user.public.v1';

export type ArcGeneratedIdentity = {
  publicKey: ArcPublicKey;
  /** Opaque provider secret. This is never exposed by ArcKeyStore public identity APIs. */
  privateKeyMaterial: string;
};

export interface ArcSigningProvider {
  readonly algorithm: string;
  generateUserIdentity(subjectId: string): Promise<ArcGeneratedIdentity>;
  sign(privateKeyMaterial: string, data: Uint8Array): Promise<string>;
}

export interface ArcKeyStore {
  getOrCreateUserIdentity(subjectId: string): Promise<ArcIdentity>;
  getPublicIdentity(): Promise<ArcIdentity | null>;
  sign(data: Uint8Array): Promise<{ keyId: string; algorithm: string; signature: string }>;
  clearLocalIdentity(): Promise<void>;
}

const assertSecureStoreAvailable = async () => {
  if (Platform.OS === 'web') {
    throw new Error('ARC production private-key storage is unavailable on web in this native key-store provider.');
  }
  const available = await SecureStore.isAvailableAsync();
  if (!available) throw new Error('Secure device key storage is unavailable.');
};

/**
 * Native production storage uses Expo SecureStore. There is intentionally no
 * AsyncStorage/plaintext fallback. A real ArcSigningProvider must still be
 * supplied once ARC selects its reviewed Ed25519/P-256 implementation.
 */
export const createArcKeyStore = (provider: ArcSigningProvider): ArcKeyStore => {
  const getPublicIdentity = async (): Promise<ArcIdentity | null> => {
    await assertSecureStoreAvailable();
    const raw = await SecureStore.getItemAsync(PUBLIC_IDENTITY_SLOT);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ArcIdentity;
      return parsed?.subjectType === 'user' && parsed?.key?.keyId && parsed?.key?.publicKey ? parsed : null;
    } catch {
      return null;
    }
  };

  const clearLocalIdentity = async () => {
    await assertSecureStoreAvailable();
    await Promise.all([
      SecureStore.deleteItemAsync(PRIVATE_KEY_SLOT),
      SecureStore.deleteItemAsync(PUBLIC_IDENTITY_SLOT),
    ]);
  };

  return {
    async getOrCreateUserIdentity(subjectId: string) {
      await assertSecureStoreAvailable();
      const current = await getPublicIdentity();
      if (current?.subjectId === subjectId) return current;
      if (current && current.subjectId !== subjectId) await clearLocalIdentity();

      const generated = await provider.generateUserIdentity(subjectId);
      const identity: ArcIdentity = { subjectType: 'user', subjectId, key: generated.publicKey };
      await SecureStore.setItemAsync(PRIVATE_KEY_SLOT, generated.privateKeyMaterial, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      await SecureStore.setItemAsync(PUBLIC_IDENTITY_SLOT, JSON.stringify(identity), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      return identity;
    },

    getPublicIdentity,

    async sign(data: Uint8Array) {
      await assertSecureStoreAvailable();
      const [identity, privateKeyMaterial] = await Promise.all([
        getPublicIdentity(),
        SecureStore.getItemAsync(PRIVATE_KEY_SLOT),
      ]);
      if (!identity || !privateKeyMaterial) throw new Error('ARC local identity is not initialized.');
      const signature = await provider.sign(privateKeyMaterial, data);
      return { keyId: identity.key.keyId, algorithm: identity.key.algorithm, signature };
    },

    clearLocalIdentity,
  };
};
