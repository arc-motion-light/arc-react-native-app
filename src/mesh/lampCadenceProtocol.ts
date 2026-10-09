export const LAMP_TELEMETRY_INTERVALS = Object.freeze(Array.from({ length: 10 }, (_, i) => (i + 1) * 60));
export type LampCadenceReply = { seconds: number; revision: number; persisted: boolean; ready: boolean; effective: boolean; nonce: number; status: number };
export const validLampInterval = (seconds: number) => Number.isInteger(seconds) && LAMP_TELEMETRY_INTERVALS.includes(seconds);
export const encodeLampCadence = (nonce: number, seconds?: number, revision?: number) => {
  if (!Number.isInteger(nonce) || nonce < 1 || nonce > 0xffffffff) throw new Error('Invalid cadence nonce');
  if (seconds !== undefined && (!validLampInterval(seconds) || !Number.isInteger(revision) || revision! < 0 || revision! > 0xffffffff)) throw new Error('Invalid Lamp cadence setting');
  const frame = new Uint8Array(seconds === undefined ? 6 : 12);
  frame[0] = seconds === undefined ? 0x74 : 0x75; frame[1] = 1;
  const view = new DataView(frame.buffer); view.setUint32(2, nonce, true);
  if (seconds !== undefined) { view.setUint16(6, seconds, true); view.setUint32(8, revision!, true); }
  return frame;
};
export const decodeLampCadence = (frame: Uint8Array): LampCadenceReply => {
  if (frame.length !== 16 || frame[0] !== 0x76 || frame[1] !== 1 || frame[14] || frame[15] || frame[3] & ~7) throw new Error('Unsupported Lamp cadence reply');
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const seconds = view.getUint16(8, true);
  if (frame[2] === 0 && (!validLampInterval(seconds) || (frame[3] & 6) !== 6)) throw new Error('Lamp cadence is not effective');
  return { seconds, revision: view.getUint32(10, true), nonce: view.getUint32(4, true), status: frame[2], persisted: Boolean(frame[3] & 1), ready: Boolean(frame[3] & 2), effective: Boolean(frame[3] & 4) };
};
