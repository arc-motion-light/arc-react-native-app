import { Buffer } from 'buffer';

export const clampNumber = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
};

export const encodeUint8 = (value: number) => {
  const v = clampNumber(value, 0, 255);
  return new Uint8Array([v]);
};

export const encodeUint16LE = (value: number) => {
  const v = clampNumber(value, 0, 0xffff);
  return new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
};

export const encodeUint32LE = (value: number) => {
  const v = clampNumber(value, 0, 0xffffffff);
  return new Uint8Array([
    v & 0xff,
    (v >> 8) & 0xff,
    (v >> 16) & 0xff,
    (v >> 24) & 0xff,
  ]);
};

export const encodePasskeyUpdate = (oldPasskey: number, newPasskey: number) => {
  const oldBytes = encodeUint32LE(oldPasskey);
  const newBytes = encodeUint32LE(newPasskey);
  const payload = new Uint8Array(8);
  payload.set(oldBytes, 0);
  payload.set(newBytes, 4);
  return payload;
};

export const toBase64 = (data: Uint8Array) => Buffer.from(data).toString('base64');

export const fromBase64 = (payload: string) => new Uint8Array(Buffer.from(payload, 'base64'));

export const readUint8 = (data: Uint8Array, offset = 0) => data[offset] ?? 0;

export const readUint16LE = (data: Uint8Array, offset = 0) => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getUint16(offset, true);
};

export const readUint16BE = (data: Uint8Array, offset = 0) => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getUint16(offset, false);
};

export const readInt16LE = (data: Uint8Array, offset = 0) => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getInt16(offset, true);
};

export const readInt16BE = (data: Uint8Array, offset = 0) => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getInt16(offset, false);
};

export const readUint32LE = (data: Uint8Array, offset = 0) => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getUint32(offset, true);
};

export const readUint32BE = (data: Uint8Array, offset = 0) => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getUint32(offset, false);
};
