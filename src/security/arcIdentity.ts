import type { PortalDeviceSummary } from '../cloud/portalTypes';

export type ArcKeyAlgorithm = 'Ed25519' | 'P-256' | string;

export type ArcPublicKey = {
  algorithm: ArcKeyAlgorithm;
  keyId: string;
  publicKey: string;
  version?: number;
  issuedAt?: number;
  expiresAt?: number;
  revokedAt?: number;
};

export type ArcIdentity = {
  subjectType: 'user' | 'device';
  subjectId: string;
  key: ArcPublicKey;
};

export type ArcTrustedKeySet = {
  active: ArcPublicKey;
  previous: ArcPublicKey[];
};

export type ArcDeviceTrustBinding = {
  canonicalDeviceId: string;
  deviceIdentity: ArcIdentity;
  fingerprint?: string;
  protocolVersion?: number;
  verifiedAt?: number;
};

export const isArcPublicIdentity = (identity: ArcIdentity): boolean =>
  Boolean(identity.subjectId && identity.key.keyId && identity.key.publicKey && identity.key.algorithm);


export type ArcCanonicalDeviceSecurityRef = {
  canonicalDeviceId: string;
  keyId?: string;
  publicKey?: string;
  fingerprint?: string;
  protocolVersion?: number;
  trustedIssuerIds: string[];
};

/**
 * Bridges canonical Portal identity to the future local trust layer without
 * treating optional cloud metadata as cryptographically verified.
 */
export const canonicalDeviceSecurityRef = (device: PortalDeviceSummary): ArcCanonicalDeviceSecurityRef => ({
  canonicalDeviceId: device.id,
  keyId: device.security?.deviceKeyId,
  publicKey: device.security?.devicePublicKey,
  fingerprint: device.security?.deviceKeyFingerprint,
  protocolVersion: device.security?.protocolVersion,
  trustedIssuerIds: device.security?.trustedIssuerIds ?? [],
});
