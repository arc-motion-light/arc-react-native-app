import type { DeviceAccess } from '../cloud/portalTypes';

export type ArcDeviceOperation = 'viewTelemetry' | 'viewHistory' | 'track' | 'control' | 'editSettings' | 'share';

export type ArcLocalTrustState = 'not_configured' | 'unverified' | 'verified' | 'revoked' | 'expired';

export type ArcSignedPermissionGrant = {
  version: 1;
  deviceId: string;
  subjectKeyId: string;
  issuerKeyId: string;
  permissions: Omit<DeviceAccess, 'isOwner'>;
  validFrom: number;
  validUntil?: number;
  nonce: string;
  signature: string;
};

const permissionForOperation: Record<ArcDeviceOperation, keyof Omit<DeviceAccess, 'isOwner'>> = {
  viewTelemetry: 'canViewTelemetry',
  viewHistory: 'canViewHistory',
  track: 'canTrack',
  control: 'canControl',
  editSettings: 'canEditSettings',
  share: 'canShare',
};

export type ArcAuthorizationDecision = {
  allowed: boolean;
  reason: 'allowed' | 'canonical_permission_denied' | 'local_trust_denied';
};

/**
 * Central operation gate. Today canonical DeviceAccess is authoritative.
 * `requireLocalTrust` remains false until firmware/application crypto is deployed,
 * preserving the current functioning local command protocol.
 */
export const authorizeDeviceOperation = (
  access: DeviceAccess,
  operation: ArcDeviceOperation,
  options: { localTrust?: ArcLocalTrustState; requireLocalTrust?: boolean } = {}
): ArcAuthorizationDecision => {
  const permission = permissionForOperation[operation];
  if (!access[permission]) return { allowed: false, reason: 'canonical_permission_denied' };
  if (options.requireLocalTrust && options.localTrust !== 'verified') {
    return { allowed: false, reason: 'local_trust_denied' };
  }
  return { allowed: true, reason: 'allowed' };
};

export const studentFriendGrantPermissions = (): Omit<DeviceAccess, 'isOwner'> => ({
  canViewTelemetry: true,
  canViewHistory: true,
  canTrack: true,
  canControl: false,
  canEditSettings: false,
  canShare: false,
});
