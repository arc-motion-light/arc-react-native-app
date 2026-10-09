export type ArcSecureEnvelopeVersion = 1;

export type ArcUnsignedSecureEnvelope<T> = {
  version: ArcSecureEnvelopeVersion;
  senderKeyId: string;
  targetDeviceId: string;
  issuedAt: number;
  nonce: string;
  sequence?: number;
  payload: T;
};

export type ArcSecureEnvelope<T> = ArcUnsignedSecureEnvelope<T> & {
  signature: string;
};

export interface ArcEnvelopeCodec {
  /** Canonical, deterministic binary serialization. Do not sign ordinary JSON.stringify output. */
  encodeForSignature<T>(envelope: ArcUnsignedSecureEnvelope<T>): Uint8Array;
  encodeForWire<T>(envelope: ArcSecureEnvelope<T>): Uint8Array;
  decodeFromWire<T>(data: Uint8Array): ArcSecureEnvelope<T>;
}

export interface ArcReplayGuard {
  assertFresh(input: { senderKeyId: string; targetDeviceId: string; nonce: string; sequence?: number; issuedAt: number }): Promise<void>;
  markAccepted(input: { senderKeyId: string; targetDeviceId: string; nonce: string; sequence?: number; issuedAt: number }): Promise<void>;
}

export interface ArcSessionKeyProvider {
  beginAuthenticatedSession(input: { targetDeviceId: string; deviceKeyId: string }): Promise<{ sessionId: string }>;
  closeSession(sessionId: string): Promise<void>;
}

export const createUnsignedArcEnvelope = <T>(input: Omit<ArcUnsignedSecureEnvelope<T>, 'version'>): ArcUnsignedSecureEnvelope<T> => ({
  version: 1,
  ...input,
});

export const hasArcSecureEnvelopeShape = <T>(value: unknown): value is ArcSecureEnvelope<T> => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ArcSecureEnvelope<T>>;
  return candidate.version === 1 &&
    typeof candidate.senderKeyId === 'string' && candidate.senderKeyId.length > 0 &&
    typeof candidate.targetDeviceId === 'string' && candidate.targetDeviceId.length > 0 &&
    typeof candidate.issuedAt === 'number' && Number.isFinite(candidate.issuedAt) &&
    typeof candidate.nonce === 'string' && candidate.nonce.length > 0 &&
    typeof candidate.signature === 'string' && candidate.signature.length > 0;
};
