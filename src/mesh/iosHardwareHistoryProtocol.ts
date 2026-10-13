import type { ProbeSensorStatus } from './meshTypes';

export const ARC_HISTORY_PROTOCOL_VERSION = 3;
export const ARC_HISTORY_RECORD_BYTES = 88;
export const ARC_HISTORY_STREAM_MAX_RECORDS = 2;

export enum ArcHistoryOpcode {
  STATUS_GET = 0x62,
  STATUS = 0x63,
  GET_AFTER = 0x64,
  RECORD = 0x65,
  ACK = 0x66,
  STREAM = 0x67,
}

export type ArcHistoryStatus = {
  journalGeneration: string;
  lampHardwareUid: string;
  resetRequired: boolean;
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
  sourceHardwareUid: string;
  lampHardwareUid: string;
  nodeGeneration: string;
  journalGeneration: string;
  nodeSequence: number;
  measurementTimestampValid: boolean;
  measurementUnixTimeSeconds: number;
  measurementMilliseconds: number;
  collectionMilliseconds: number;
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

export type HardwareHistoryProvenance = Pick<ArcHistoryRecord,
  'sourceHardwareUid' | 'lampHardwareUid' | 'nodeGeneration' | 'journalGeneration' | 'nodeSequence' |
  'measurementTimestampValid' | 'measurementUnixTimeSeconds' | 'measurementMilliseconds' | 'collectionMilliseconds'> & {
    lampSequence: number; collectionTimestampValid: boolean; collectionUnixTimeSeconds: number;
  };
export const hardwareHistoryProvenance=(record:ArcHistoryRecord):HardwareHistoryProvenance|undefined=>record.schemaVersion===3?({
  sourceHardwareUid:record.sourceHardwareUid,lampHardwareUid:record.lampHardwareUid,
  nodeGeneration:record.nodeGeneration,journalGeneration:record.journalGeneration,nodeSequence:record.nodeSequence,
  lampSequence:record.sequence,measurementTimestampValid:record.measurementTimestampValid,
  measurementUnixTimeSeconds:record.measurementUnixTimeSeconds,measurementMilliseconds:record.measurementMilliseconds,
  collectionTimestampValid:record.timestampValid,collectionUnixTimeSeconds:record.unixTimeSeconds,collectionMilliseconds:record.collectionMilliseconds,
}):undefined;
export const hardwareHistoryRecordId=(record:ArcHistoryRecord,lampId?:string)=>record.schemaVersion===3?`lamp:${record.lampHardwareUid}:generation:${record.journalGeneration}:history:${record.sequence}`:`lamp:${lampId}:history:${record.sequence}`;

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

const uidHex = (data: Uint8Array, offset: number) => {
  const value=Array.from(data.subarray(offset,offset+12)).map(byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase();
  if(/^(0{24}|F{24})$/.test(value))throw new Error('Invalid history hardware UID');
  return value;
};
const generationHex = (data: Uint8Array,offset: number) => Array.from(data.subarray(offset,offset+8)).reverse().map(byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase();
const putGeneration = (data: Uint8Array,offset: number,generation: string) => {
  if(!/^[0-9A-F]{16}$/i.test(generation) || /^0{16}$/.test(generation))throw new Error('History generation is required');
  for(let i=0;i<8;++i)data[offset+i]=parseInt(generation.slice(14-i*2,16-i*2),16);
};
const requireHeader = (data: Uint8Array, opcode: ArcHistoryOpcode, length: number) => {
  if (data.length !== length || data[0] !== opcode || data[1] !== ARC_HISTORY_PROTOCOL_VERSION) {
    throw new Error(`Invalid ARC history 0x${opcode.toString(16)} frame (${data.length} bytes).`);
  }
};

export const encodeArcHistoryStatusGet = () => Uint8Array.of(ArcHistoryOpcode.STATUS_GET, 3);

export const decodeArcHistoryStatus = (data: Uint8Array): ArcHistoryStatus => {
  if(data.length!==50 || data[0]!==ArcHistoryOpcode.STATUS || data[1]!==3 || data[2]!==5 || data[3]!==3 || u16(data,4)!==88 || data[11]>2) {
    throw new Error('Unsupported ARC history layout; new firmware/reset required');
  }
  const generation=generationHex(data,30);
  if(data[11]===1 && /^0{16}$/.test(generation))throw new Error('Invalid ready journal generation');
  return {
    journalGeneration:generation, lampHardwareUid:uidHex(data,38),resetRequired:data[11]===2,
    layoutVersion: data[2], recordVersion: data[3], recordBytes: u16(data, 4),
    capacity: u16(data, 6), count: u16(data, 8), mappingCount: data[10], ready: data[11] === 1,
    oldestSequence: u32(data, 12), newestSequence: u32(data, 16), acknowledgedSequence: u32(data, 20),
    probeIntervalSeconds: data.length >= 30 ? u16(data, 24) : null,
    lampIntervalSeconds: data.length >= 30 ? u16(data, 26) : null,
    lampFollowsProbe: data.length >= 30 ? (data[29] & 0x01) !== 0 : false,
  };
};

export const encodeArcHistoryGetAfter = (sequence: number, generation: string) => {
  const data = new Uint8Array(14);data.set([ArcHistoryOpcode.GET_AFTER,3]);putGeneration(data,6,generation);
  putU32(data, 2, sequence);
  return data;
};

/** WBA-owned v3 bounded history request, 1..32 records; generation guards resets. */
export const encodeArcHistoryGetBatch = (
  afterSequence: number,
  headSequence: number,
  limit: number,
  generation: string,
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

  const data = new Uint8Array(19);data.set([ArcHistoryOpcode.GET_AFTER,3]);data[10]=limit;
  putGeneration(data,11,generation);

  putU32(data, 2, afterSequence);
  putU32(data, 6, headSequence);

  return data;
};

export const decodeArcHistoryRecord = (data: Uint8Array): ArcHistoryRecord | null => {
  if(data.length<4 || data[0]!==ArcHistoryOpcode.RECORD || data[1]!==3 || data[3]!==0)throw new Error('Invalid history response or stale generation');
  if(data[2]===0 && data.length===4)return null;
  if(data.length!==92 || data[2]!==88)throw new Error('Unsupported history record size');
  const stored=data.subarray(4);
  if(u16(stored,62)!==arcHistoryCrc16(stored,62))throw new Error('ARC history record CRC mismatch');
  if(![0x31,0x32].includes(stored[0]) || stored[3] || stored[61] || (stored[2]&~7) || !(stored[2]&4) ||
     u16(stored,36)>999 || u16(stored,38)>999 || (stored[0]===0x31?stored[1]>=3:stored[1]!==255))throw new Error('Invalid provenance record');
  if((!(stored[2]&1) && (u32(stored,32) || u16(stored,38))) || (!(stored[2]&2) && (u32(stored,28) || u16(stored,36))))throw new Error('Invalid time-validity fields');
  const provenance={sourceHardwareUid:uidHex(stored,64),lampHardwareUid:uidHex(stored,76),
    nodeGeneration:generationHex(stored,16),journalGeneration:generationHex(stored,8),nodeSequence:u32(stored,24),
    measurementTimestampValid:Boolean(stored[2]&1),measurementUnixTimeSeconds:u32(stored,32),measurementMilliseconds:u16(stored,38),collectionMilliseconds:u16(stored,36)};
  if(/^0{16}$/.test(provenance.nodeGeneration) || /^0{16}$/.test(provenance.journalGeneration) ||
     (stored[0]===0x32 && (provenance.sourceHardwareUid!==provenance.lampHardwareUid || provenance.nodeGeneration!==provenance.journalGeneration)))throw new Error('Invalid source/generation');
  /* Sensor quantization remains the unchanged G4/live input representation.
   * The only accepted history wire format is the v3 envelope above. */
  const raw=new Uint8Array(32);raw[1]=stored[60];raw[2]=stored[58];raw[3]=stored[59];raw.set(stored.subarray(40,58),12);
  const schemaVersion=3,type=stored[0]&15,sequence=u32(stored,4),unixTimeSeconds=u32(stored,28),timestampValid=Boolean(stored[2]&2);
  if (type === 2) {
    const valid = raw[2];
    const state = raw[3];
    const packedHealth = raw[27];
    const channelNibbles = [raw[28] & 0x0f, raw[28] >>> 4, raw[29] & 0x0f, raw[29] >>> 4] as const;
    return {
      ...provenance, schemaVersion,
      recordType: 'lamp_operational',
      sequence,
      timestampValid,
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
    ...provenance, schemaVersion,
    recordType: 'probe_environment',
    probeIndex: stored[1], validityFlags: valid, sequence,
    timestampValid, unixTimeSeconds,
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

export const encodeArcHistoryAck = (sequence: number, generation: string) => {
  const data=new Uint8Array(14);data.set([ArcHistoryOpcode.ACK,3]);putGeneration(data,6,generation);
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
