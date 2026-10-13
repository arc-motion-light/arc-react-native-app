/**
 * Public ARC factory-label preview. This is NOT an enrollment credential.
 * Deliberately accepts only the currently deployed identity-only label format.
 */
import { Buffer } from 'buffer';
import { hardwareUid } from '../mesh/hardwareIdentity';

export type ArcPublicDeviceQr = Readonly<{
  hardwareUid: string;
  deviceType: 'lamp' | 'probe' | 'gateway';
  nonce: string;
}>;

const QR_PREFIX = 'arc-preview://device/v1/';
const MAX_QR_LENGTH = 2048;

export function parseArcPublicDeviceQr(raw: string): ArcPublicDeviceQr {
  if (typeof raw !== 'string' || raw.length > MAX_QR_LENGTH || !raw.startsWith(QR_PREFIX)) {
    throw new Error('Not an ARC device identity QR code.');
  }
  const encoded = raw.slice(QR_PREFIX.length);
  // The server emits unpadded canonical base64url JSON. Do not accept URL tricks.
  if (!/^[A-Za-z0-9_-]{1,1024}$/.test(encoded)) {
    throw new Error('Invalid ARC device QR encoding.');
  }
  const bytes = Buffer.from(encoded, 'base64url');
  if (bytes.toString('base64url') !== encoded || bytes.length > 768) {
    throw new Error('Invalid ARC device QR payload.');
  }
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Invalid ARC device QR JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid ARC device QR structure.');
  }
  const payload = value as Record<string, unknown>;
  if (
    Object.keys(payload).sort().join(',') !== 'kind,nonce,type,uid,v' ||
    payload.v !== 1 || payload.kind !== 'PRINT_PREVIEW_ONLY' ||
    !['lamp', 'probe', 'gateway'].includes(String(payload.type)) ||
    typeof payload.uid !== 'string' || hardwareUid(payload.uid) !== payload.uid ||
    typeof payload.nonce !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(payload.nonce)
  ) {
    throw new Error('Unsupported ARC label format or invalid identity.');
  }
  return {
    hardwareUid: payload.uid,
    deviceType: payload.type as ArcPublicDeviceQr['deviceType'],
    nonce: payload.nonce,
  };
}
