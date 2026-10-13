/** ARC Probe T temporary direct BLE control v1. Little endian, exact 12 bytes.
 * Replies are transport-independent Loader TX frames; reject stale/wrong nonces.
 * Sample cadence ACK explicitly says persisted=false (RAM-only prototype mode).
 */
export type ProbeTimeAck = { epochSeconds: number; nonce: number };
export type ProbeSampleAck = { activeSeconds: number; persisted: boolean; nonce: number };
export const PROBE_TIME_ACK = 0x21;
export const PROBE_SAMPLE_ACK = 0x23;
export const encodeProbeTime = (epochSeconds: number, nonce: number): Uint8Array => {
  if (!Number.isInteger(epochSeconds) || epochSeconds < 1577836800 || epochSeconds > 4102444799) throw new Error('Invalid Probe UTC epoch');
  if (!Number.isInteger(nonce) || nonce < 1 || nonce > 0xffffffff) throw new Error('Invalid nonce');
  const p = new Uint8Array(12); const v = new DataView(p.buffer);
  p[0]=0x20; p[1]=1; v.setUint32(4,epochSeconds,true); v.setUint32(8,nonce,true); return p;
};
export const encodeProbeSample = (seconds: number, nonce: number): Uint8Array => {
  if (!Number.isInteger(seconds) || (seconds!==30 && (seconds < 60 || seconds > 600 || seconds%60!==0))) throw new Error('Unsupported Probe sample interval');
  if (!Number.isInteger(nonce) || nonce < 1 || nonce > 0xffffffff) throw new Error('Invalid nonce');
  const p=new Uint8Array(12);const v=new DataView(p.buffer);
  p[0]=0x22;p[1]=1;v.setUint32(4,nonce,true);v.setUint32(8,seconds,true);return p;
};
export const decodeProbeTimeAck = (p: Uint8Array, nonce: number, expectedEpoch: number): ProbeTimeAck => {
  if (p.length!==12 || p[0]!==PROBE_TIME_ACK || p[1]!==1 || p[3]!==0) throw new Error('Invalid Probe Time Sync ACK');
  const v=new DataView(p.buffer,p.byteOffset,p.byteLength);
  if (v.getUint32(8,true)!==nonce) throw new Error('Stale Probe Time Sync ACK');
  if (p[2]!==0) throw new Error(`Probe Time Sync rejected (status ${p[2]})`);
  const epochSeconds=v.getUint32(4,true);
  if (epochSeconds!==expectedEpoch) throw new Error('Probe Time Sync ACK epoch mismatch');
  return {epochSeconds,nonce};
};
export const decodeProbeSampleAck = (p: Uint8Array, nonce: number, expectedSeconds: number): ProbeSampleAck => {
  if (p.length!==12 || p[0]!==PROBE_SAMPLE_ACK || p[1]!==1 || (p[3]&~1)!==0) throw new Error('Invalid Probe sample ACK');
  const v=new DataView(p.buffer,p.byteOffset,p.byteLength);
  if (v.getUint32(4,true)!==nonce) throw new Error('Stale Probe sample ACK');
  if (p[2]!==0) throw new Error(`Probe sample change rejected (status ${p[2]})`);
  const activeSeconds=v.getUint32(8,true);
  if (activeSeconds!==expectedSeconds) throw new Error(`Probe active sample interval mismatch (${activeSeconds}s)`);
  return {activeSeconds,persisted:(p[3]&1)!==0,nonce};
};
