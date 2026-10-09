import type { ProbeSensorStatus } from './meshTypes';

export const ARC_HISTORY_PROTOCOL_VERSION = 1;
export const ARC_HISTORY_RECORD_BYTES = 32;
export const ARC_HISTORY_STREAM_MAX_RECORDS = 7;

export enum ArcHistoryOpcode {
  STATUS_GET = 0x62,
  STATUS = 0x63,
  GET_AFTER = 0x64,
  RECORD = 0x65,
  ACK = 0x66,
  STREAM = 0x67,
}

export type ArcHistoryStatus = {
  layoutVersion: number;
  recordVersion: number;
  recordBytes: number;
  capacity: number;
  count: number;
  mappingCount: number;
  ready: boolean;
  oldestSequence: number;
  newestSequence: number;
  acknowledgedSequence: number;
  probeIntervalSeconds: number | null;
  lampIntervalSeconds: number | null;
  lampFollowsProbe: boolean;
};

type ArcHistoryRecordBase = {
  schemaVersion: number;
  sequence: number;
  timestampValid: boolean;
  unixTimeSeconds: number;
};

export type ArcProbeHistoryRecord = ArcHistoryRecordBase & {
  recordType: 'probe_environment';
  probeIndex: number;
  validityFlags: number;
  batteryPct: number | null;
  ambientTemperatureC: number | null;
  ambientHumidityPct: number | null;
  pressureHpa: number | null;
  gasOhms: number | null;
  soilTemperatureC: number | null;
  soilDepth0Raw: number | null;
  soilDepth1Raw: number | null;
  soilDepth2Raw: number | null;
  lightIntensityRaw: number | null;
};

export type ArcLampHistoryRecord = ArcHistoryRecordBase & {
  recordType: 'lamp_operational';
  eventKind: 'periodic' | 'state_change' | 'fault_change';
  validityFlags: number;
  stateFlags: number;
  coreTemperatureC: number | null;
  boardTemperatureC: number | null;
  mcuTemperatureC: number | null;
  currentMa: number | null;
  powerWatts: number | null;
  fan1Rpm: number | null;
  fan2Rpm: number | null;
  fanDutyPercent: number;
  healthSeverity: 'nominal' | 'warning' | 'error';
  healthCode: number;
  appliedChannelsPercent: [number, number, number, number];
  lampOn: boolean;
  outputsEnabled: boolean;
  thermalLimitReached: boolean;
  thermalShutdown: boolean;
  fanAutomatic: boolean;
  fanRpmControl: boolean;
  manualOverride: boolean;
};

export type ArcHistoryRecord = ArcProbeHistoryRecord | ArcLampHistoryRecord;

const u16 = (data: Uint8Array, offset: number) => data[offset] | (data[offset + 1] << 8);
const i16 = (data: Uint8Array, offset: number) => {
  const value = u16(data, offset);
  return value & 0x8000 ? value - 0x10000 : value;
};
const u32 = (data: Uint8Array, offset: number) =>
  (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
const putU32 = (data: Uint8Array, offset: number, value: number) => {
  const normalized = value >>> 0;
  data[offset] = normalized & 0xff;
  data[offset + 1] = (normalized >>> 8) & 0xff;
  data[offset + 2] = (normalized >>> 16) & 0xff;
  data[offset + 3] = (normalized >>> 24) & 0xff;
};

export const arcHistoryCrc16 = (data: Uint8Array, length = data.length): number => {
  let crc = 0xffff;
  for (let offset = 0; offset < length; offset += 1) {
    crc ^= data[offset] << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
};

const requireHeader = (data: Uint8Array, opcode: ArcHistoryOpcode, length: number) => {
  if (data.length !== length || data[0] !== opcode || data[1] !== ARC_HISTORY_PROTOCOL_VERSION) {
    throw new Error(`Invalid ARC history 0x${opcode.toString(16)} frame (${data.length} bytes).`);
  }
};

export const encodeArcHistoryStatusGet = () => Uint8Array.of(ArcHistoryOpcode.STATUS_GET, 1);

export const decodeArcHistoryStatus = (data: Uint8Array): ArcHistoryStatus => {
  if ((data.length !== 24 && data.length !== 30) || data[0] !== ArcHistoryOpcode.STATUS ||
      (data[1] !== 1 && data[1] !== 2)) {
    throw new Error(`Invalid ARC history status frame (${data.length} bytes).`);
  }
  return {
    layoutVersion: data[2], recordVersion: data[3], recordBytes: u16(data, 4),
    capacity: u16(data, 6), count: u16(data, 8), mappingCount: data[10], ready: data[11] !== 0,
    oldestSequence: u32(data, 12), newestSequence: u32(data, 16), acknowledgedSequence: u32(data, 20),
    probeIntervalSeconds: data.length >= 30 ? u16(data, 24) : null,
    lampIntervalSeconds: data.length >= 30 ? u16(data, 26) : null,
    lampFollowsProbe: data.length >= 30 ? (data[29] & 0x01) !== 0 : false,
  };
};

export const encodeArcHistoryGetAfter = (sequence: number) => {
  const data = Uint8Array.of(ArcHistoryOpcode.GET_AFTER, 1, 0, 0, 0, 0);
  putU32(data, 2, sequence);
  return data;
};

/**
 * Request a bounded history batch from the WBA5.
 *
 * This is a WBA-local protocol extension. The WBA5 translates the batch into
 * repeated existing G4 GET_AFTER v1 requests, so the G4 history protocol and
 * FRAM reader remain unchanged.
 *
 * Wire format:
 *   [0]     0x64 GET_AFTER
 *   [1]     0x02 batch protocol version
 *   [2..5]  afterSequence, uint32 LE
 *   [6..9]  frozen headSequence, uint32 LE
 *   [10]    max records, 1..32
 */
export const encodeArcHistoryGetBatch = (
  afterSequence: number,
  headSequence: number,
  limit: number,
) => {
  if (!Number.isInteger(afterSequence) ||
      afterSequence < -1 ||
      afterSequence > 0xffffffff) {
    throw new Error(`Invalid ARC history batch after sequence ${afterSequence}.`);
  }

  if (!Number.isInteger(headSequence) ||
      headSequence < 0 ||
      headSequence > 0xffffffff ||
      headSequence <= afterSequence) {
    throw new Error(`Invalid ARC history batch head sequence ${headSequence}.`);
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 32) {
    throw new Error(`Invalid ARC history batch limit ${limit}.`);
  }

  const data = Uint8Array.of(
    ArcHistoryOpcode.GET_AFTER,
    2,
    0, 0, 0, 0,
    0, 0, 0, 0,
    limit,
  );

  putU32(data, 2, afterSequence);
  putU32(data, 6, headSequence);

  return data;
};

export const decodeArcHistoryRecord = (data: Uint8Array): ArcHistoryRecord | null => {
  if ((data.length !== 4 && data.length !== 36) || data[0] !== ArcHistoryOpcode.RECORD || data[1] !== 1 || data[3] !== 0) {
    throw new Error(`Invalid ARC history record response (${data.length} bytes).`);
  }
  if (data[2] === 0 && data.length === 4) return null;
  if (data[2] !== ARC_HISTORY_RECORD_BYTES || data.length !== 36) throw new Error(`Unsupported history record size ${data[2]}.`);
  const raw = data.slice(4);
  if (u16(raw, 30) !== arcHistoryCrc16(raw, 30)) throw new Error('ARC history record CRC mismatch.');
  const legacyProbe = raw[0] === 1;
  const schemaVersion = legacyProbe ? 1 : raw[0] >>> 4;
  const type = legacyProbe ? 1 : raw[0] & 0x0f;
  if (schemaVersion !== 1 && schemaVersion !== 2) throw new Error(`Unsupported history schema ${schemaVersion}.`);
  const sequence = u32(raw, 4);
  const unixTimeSeconds = u32(raw, 8);
  if (type === 2 && schemaVersion === 2) {
    const valid = raw[2];
    const state = raw[3];
    const packedHealth = raw[27];
    const channelNibbles = [raw[28] & 0x0f, raw[28] >>> 4, raw[29] & 0x0f, raw[29] >>> 4] as const;
    return {
      schemaVersion,
      recordType: 'lamp_operational',
      sequence,
      timestampValid: (state & 0x01) !== 0,
      unixTimeSeconds,
      eventKind: raw[1] === 2 ? 'fault_change' : raw[1] === 1 ? 'state_change' : 'periodic',
      validityFlags: valid,
      stateFlags: state,
      coreTemperatureC: valid & 0x01 ? i16(raw, 12) / 10 : null,
      boardTemperatureC: valid & 0x02 ? i16(raw, 14) / 10 : null,
      mcuTemperatureC: valid & 0x04 ? i16(raw, 16) / 10 : null,
      currentMa: valid & 0x08 ? u16(raw, 18) : null,
      powerWatts: valid & 0x10 ? u16(raw, 20) / 10 : null,
      fan1Rpm: valid & 0x20 ? u16(raw, 22) : null,
      fan2Rpm: valid & 0x40 ? u16(raw, 24) : null,
      fanDutyPercent: raw[26],
      healthSeverity: packedHealth >>> 6 === 2 ? 'error' : packedHealth >>> 6 === 1 ? 'warning' : 'nominal',
      healthCode: packedHealth & 0x3f,
      appliedChannelsPercent: channelNibbles.map((value) => value * 100 / 15) as [number, number, number, number],
      lampOn: (state & 0x02) !== 0,
      outputsEnabled: (state & 0x04) !== 0,
      thermalLimitReached: (state & 0x08) !== 0,
      thermalShutdown: (state & 0x10) !== 0,
      fanAutomatic: (state & 0x20) !== 0,
      fanRpmControl: (state & 0x40) !== 0,
      manualOverride: (state & 0x80) !== 0,
    };
  }
  if (type !== 1) throw new Error(`Unsupported history record type ${type}.`);
  const valid = raw[2];
  const battery = raw[3] & 0x7f;
  return {
    schemaVersion,
    recordType: 'probe_environment',
    probeIndex: raw[1], validityFlags: valid, sequence: u32(raw, 4),
    timestampValid: (raw[3] & 0x80) !== 0, unixTimeSeconds: u32(raw, 8),
    batteryPct: battery <= 100 ? battery : null,
    ambientTemperatureC: valid & 0x01 ? i16(raw, 12) / 100 : null,
    ambientHumidityPct: valid & 0x01 ? u16(raw, 14) / 100 : null,
    pressureHpa: valid & 0x02 ? u16(raw, 16) / 10 : null,
    gasOhms: valid & 0x04 ? u16(raw, 18) * 100 : null,
    soilTemperatureC: valid & 0x08 ? i16(raw, 20) / 100 : null,
    soilDepth0Raw: valid & 0x10 ? u16(raw, 22) : null,
    soilDepth1Raw: valid & 0x20 ? u16(raw, 24) : null,
    soilDepth2Raw: valid & 0x40 ? u16(raw, 26) : null,
    lightIntensityRaw: valid & 0x80 ? u16(raw, 28) : null,
  };
};

export const decodeArcHistoryStream = (data: Uint8Array): ArcHistoryRecord[] => {
  if (data.length < 4 ||
      data[0] !== ArcHistoryOpcode.STREAM ||
      data[1] !== ARC_HISTORY_PROTOCOL_VERSION ||
      data[3] !== 0) {
    throw new Error(`Invalid ARC history stream frame (${data.length} bytes).`);
  }
  const count = data[2];
  if (count < 2 ||
      count > ARC_HISTORY_STREAM_MAX_RECORDS ||
      data.length !== 4 + count * ARC_HISTORY_RECORD_BYTES) {
    throw new Error(`Invalid ARC history stream record count/length (${count}, ${data.length}).`);
  }

  const records: ArcHistoryRecord[] = [];
  for (let index = 0; index < count; index += 1) {
    const envelope = new Uint8Array(4 + ARC_HISTORY_RECORD_BYTES);
    envelope[0] = ArcHistoryOpcode.RECORD;
    envelope[1] = ARC_HISTORY_PROTOCOL_VERSION;
    envelope[2] = ARC_HISTORY_RECORD_BYTES;
    envelope.set(
      data.subarray(4 + index * ARC_HISTORY_RECORD_BYTES, 4 + (index + 1) * ARC_HISTORY_RECORD_BYTES),
      4,
    );
    const record = decodeArcHistoryRecord(envelope);
    if (record === null) {
      throw new Error(`Unexpected empty record in ARC history stream at index ${index}.`);
    }
    records.push(record);
  }
  return records;
};

export const encodeArcHistoryAck = (sequence: number) => {
  const data = Uint8Array.of(ArcHistoryOpcode.ACK, 1, 0, 0, 0, 0);
  putU32(data, 2, sequence);
  return data;
};

export const decodeArcHistoryAck = (data: Uint8Array) => requireHeader(data, ArcHistoryOpcode.ACK, 2);

export const arcHistoryRecordToProbeStatus = (record: ArcProbeHistoryRecord): ProbeSensorStatus => ({
  source: 'gateway-thread',
  updatedAt: record.timestampValid ? record.unixTimeSeconds * 1000 : Date.now(),
  batteryPct: record.batteryPct,
  batteryEstimateValid: record.batteryPct !== null,
  temperatureC: record.ambientTemperatureC,
  humidityPct: record.ambientHumidityPct,
  pressureHpa: record.pressureHpa,
  gasOhms: record.gasOhms,
  sht45TemperatureC: record.ambientTemperatureC,
  sht45HumidityPct: record.ambientHumidityPct,
  bme690PressureHpa: record.pressureHpa,
  bme690GasOhms: record.gasOhms,
  earthTemperatureC: record.soilTemperatureC,
  tscDepth0Raw: record.soilDepth0Raw,
  tscDepth1Raw: record.soilDepth1Raw,
  tscDepth2Raw: record.soilDepth2Raw,
  lightIntensityRaw: record.lightIntensityRaw,
});
