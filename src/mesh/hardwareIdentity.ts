/** Public STM32 silicon UID, ascending memory order as 24 uppercase hex digits.
 * Bindings identify products locally; they never grant permissions/authenticity. */
export const hardwareUid = (value: unknown): string | null => {
  if (typeof value !== 'string' || !/^[0-9a-f]{24}$/i.test(value)) return null;
  const uid = value.toUpperCase();
  return /^(0{24}|F{24})$/.test(uid) ? null : uid;
};
export type HardwareIdentityEvent = {
  nodeId: string;
  state: 'pending' | 'identified' | 'unavailable' | 'incompatible' | 'disconnected';
  session: number;
  hardwareUid?: string;
  deviceType?: 'lamp' | 'probe';
};
export type HardwareBinding = { hardwareUid: string; arcDeviceId: string; confirmedBy: string };
export type ArcHardwareIdentity = { hardwareUid: string; deviceType: 'lamp' | 'probe' };
export const decodeArcHardwareIdentity = (frame: Uint8Array, token: number): ArcHardwareIdentity => {
  if (!Number.isInteger(token) || token<=0 || token>0xffffffff || frame.length!==20 || frame[0]!==0x79 ||
      frame[1]!==1 || frame[2]!==0 || ![1,2].includes(frame[3]) ||
      new DataView(frame.buffer,frame.byteOffset,frame.byteLength).getUint32(4,true)!==token) throw new Error('Invalid ARC hardware identity response');
  const uid=hardwareUid(Array.from(frame.subarray(8)).map(byte=>byte.toString(16).padStart(2,'0')).join(''));
  if(!uid)throw new Error('Invalid silicon UID');
  return {hardwareUid:uid,deviceType:frame[3]===1?'lamp':'probe'};
};
// Existing Lamp-only callers keep a strict type check; no Probe is relabeled.
export const decodeHardwareIdentity = (frame: Uint8Array, token: number): string => {
  const result=decodeArcHardwareIdentity(frame,token);
  if(result.deviceType!=='lamp')throw new Error('Expected Lamp hardware identity');
  return result.hardwareUid;
};

export function resolveHardwareBinding(bindings: HardwareBinding[], uid: string, expectedArcId?: string | null):
  { state: 'known'; arcDeviceId: string } | { state: 'unknown' | 'conflict' } {
  const normalized=hardwareUid(uid);
  if(!normalized)return {state:'conflict'};
  const candidates=bindings.filter(binding=>binding.hardwareUid===normalized);
  if(!candidates.length)return {state:'unknown'};
  if(candidates.length!==1 || bindings.filter(binding=>binding.arcDeviceId===candidates[0].arcDeviceId).length!==1 ||
     (expectedArcId && expectedArcId!==candidates[0].arcDeviceId))return {state:'conflict'};
  return {state:'known',arcDeviceId:candidates[0].arcDeviceId};
}
export function associateHardwareBinding(bindings: HardwareBinding[], uid: string, arcDeviceId: string, accountUid: string,
                                         authorizedArcIds: string[], expectedArcId?: string | null): HardwareBinding[] {
  const normalized=hardwareUid(uid);
  if(!normalized || !accountUid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arcDeviceId) ||
     !authorizedArcIds.includes(arcDeviceId) || (expectedArcId && expectedArcId!==arcDeviceId))throw new Error('Select an authorized, existing ARC Lamp');
  const resolution=resolveHardwareBinding(bindings,normalized,arcDeviceId);
  if(resolution.state==='conflict' || bindings.some(binding=>binding.arcDeviceId===arcDeviceId && binding.hardwareUid!==normalized))throw new Error('Hardware UID / ARC ID binding conflict. Prior data unchanged.');
  if(resolution.state==='known')return bindings;
  return [...bindings,{hardwareUid:normalized,arcDeviceId,confirmedBy:accountUid}];
}
