/** ARC Hardware History v4 upload contract, aligned with deployed hardwareHistory.ts.
 * Pure conversion only. It never infers ownership from a public silicon UID.
 * This module MUST NOT initiate network access. */
import type { LampOperationalRecord } from '../lampLogger';
import type { ProbeLogEnvelope } from '../probeDataFormat';
import type { HardwareHistoryProvenance } from '../mesh/iosHardwareHistoryProtocol';

export type HardwareHistoryUploadRecord = {
  recordId: string;
  recordType: 'lamp_operational' | 'probe_environment';
  lampId: string;
  canonicalLampId?: string;
  probeId?: string;
  canonicalProbeId?: string;
  lampHardwareUid: string;
  sourceHardwareUid: string;
  journalGeneration: string;
  lampSequence: number;
  nodeGeneration: string;
  nodeSequence: number;
  measurementTimeValid: boolean;
  measurementTimestampMs: number | null;
  collectionTimeValid: boolean;
  collectionTimestampMs: number | null;
  phoneReceivedAtMs: number;
  payload: LampOperationalRecord | ProbeLogEnvelope;
};

const validUid = (uid: string) => /^[0-9A-F]{24}$/.test(uid) &&
  uid !== '0'.repeat(24) && uid !== 'F'.repeat(24);
const validGeneration = (value: string) => /^[0-9A-F]{16}$/.test(value) && value !== '0'.repeat(16);
const uint32 = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
const validPhoneTime = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;

function absoluteTime(valid: boolean, seconds: number, millis: number): number | null | undefined {
  if (!Number.isSafeInteger(seconds) || !Number.isSafeInteger(millis) || millis < 0 || millis > 999) return undefined;
  if (!valid) return seconds === 0 && millis === 0 ? null : undefined;
  const value = seconds * 1000 + millis;
  return validPhoneTime(value) ? value : undefined;
}

export function isHardwareUploadRecord(record: { recordId: string; journalGeneration?: string }):
  record is HardwareHistoryUploadRecord {
  return typeof record.journalGeneration === 'string';
}

export function buildHardwareHistoryUpload(record: LampOperationalRecord | ProbeLogEnvelope): HardwareHistoryUploadRecord | null {
  const p: HardwareHistoryProvenance | undefined = record.hardwareProvenance;
  if (!p) return null;
  const expectedId = `lamp:${p.lampHardwareUid}:generation:${p.journalGeneration}:history:${p.lampSequence}`;
  if (!validUid(p.lampHardwareUid) || !validUid(p.sourceHardwareUid) ||
      !validGeneration(p.journalGeneration) || !validGeneration(p.nodeGeneration) ||
      !uint32(p.lampSequence) || !uint32(p.nodeSequence) ||
      record.recordId !== expectedId) return null;
  const measurementTimestampMs = absoluteTime(p.measurementTimestampValid, p.measurementUnixTimeSeconds, p.measurementMilliseconds);
  const collectionTimestampMs = absoluteTime(p.collectionTimestampValid, p.collectionUnixTimeSeconds, p.collectionMilliseconds);
  if (measurementTimestampMs === undefined || collectionTimestampMs === undefined ||
      !validPhoneTime(record.timeline.receivedAtMs)) return null;
  const isLamp = 'recordType' in record && record.recordType === 'lamp_operational';
  if (isLamp && (p.sourceHardwareUid !== p.lampHardwareUid || p.nodeGeneration !== p.journalGeneration)) return null;
  if (!isLamp && (!('probeId' in record) || !record.probeId)) return null;
  return {
    recordId: record.recordId,
    recordType: isLamp ? 'lamp_operational' : 'probe_environment',
    // For Probe history, the collector is resolved from the independently confirmed UID binding.
    // This is a LOCAL placeholder; prepareHistoryUpload replaces it with the canonical Lamp ID.
    lampId: isLamp ? (record as LampOperationalRecord).lampId : p.lampHardwareUid,
    ...(isLamp ? {} : { probeId: (record as ProbeLogEnvelope).probeId }),
    lampHardwareUid: p.lampHardwareUid,
    sourceHardwareUid: p.sourceHardwareUid,
    journalGeneration: p.journalGeneration,
    lampSequence: p.lampSequence,
    nodeGeneration: p.nodeGeneration,
    nodeSequence: p.nodeSequence,
    measurementTimeValid: p.measurementTimestampValid,
    measurementTimestampMs,
    collectionTimeValid: p.collectionTimestampValid,
    collectionTimestampMs,
    phoneReceivedAtMs: record.timeline.receivedAtMs,
    payload: record,
  };
}
