import * as FileSystem from 'expo-file-system/legacy';

import type { ProbeSensorStatus } from './mesh/meshTypes';
import { buildProbeLogEnvelope } from './probeDataFormat';
import type { ProbeCloudSyncMode, ProbeLogEnvelope } from './probeDataFormat';

export type ProbeLoggingSyncMode = ProbeCloudSyncMode;

export type ProbeLoggingSettings = {
  loggingEnabled: boolean;
  loggingIntervalSec: number;
  sensorReadIntervalSec: number;
  gasReadIntervalSec: number;
  retentionDays: number;
  storageBudgetMb: number;
  rawPayloadRetention: boolean;
  highFrequencyLogging: boolean;
  syncMode: ProbeLoggingSyncMode;
};

export type ProbeLogRecord = {
  probeId: string;
  recordId?: string;
  deviceTimestampMs?: number | null;
  timestampValid?: boolean;
  timestampOrigin?: 'lamp_g4_receive_rtc' | 'phone_received' | 'probe_device' | 'unknown';
  receivedAtMs: number;
  source: ProbeSensorStatus['source'];
  snapshot: ProbeSensorStatus;
  syncMode?: ProbeLoggingSyncMode;
};

export type ProbeLogRetentionPolicy = Pick<ProbeLoggingSettings, 'retentionDays' | 'storageBudgetMb'>;

export type ProbeLoggingStats = {
  sampleCount: number;
  fileSizeBytes: number;
};

export type ProbeLogQueryOptions = {
  limit?: number;
  probeId?: string | null;
};

export const DEFAULT_PROBE_LOGGING_SETTINGS: ProbeLoggingSettings = {
  loggingEnabled: true,
  loggingIntervalSec: 30,
  sensorReadIntervalSec: 30,
  gasReadIntervalSec: 300,
  retentionDays: 7,
  storageBudgetMb: 25,
  rawPayloadRetention: false,
  highFrequencyLogging: false,
  syncMode: 'local_only',
};

const directory = `${FileSystem.documentDirectory ?? ''}probe-logger`;
const segmentsDirectory = `${directory}/segments`;
const settingsPath = `${directory}/settings.json`;
// Retained for records created by older app versions.
const legacyLogPath = `${directory}/probe-log.jsonl`;
const segmentPrefix = 'probe-log-';
const segmentSuffix = '.jsonl';
const maxSegmentBytes = 64 * 1024;

let activeSegmentUri: string | null = null;
let appendQueue: Promise<void> = Promise.resolve();
let knownRecordIds: Set<string> | null = null;

const ensureDirectory = async () => {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const segmentsInfo = await FileSystem.getInfoAsync(segmentsDirectory);
  if (!segmentsInfo.exists) await FileSystem.makeDirectoryAsync(segmentsDirectory, { intermediates: true });
};

const clampPositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isProbeLogEnvelope = (value: unknown): value is ProbeLogEnvelope => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ProbeLogEnvelope> & { timeline?: { receivedAtMs?: unknown } };
  return (
    typeof record.probeId === 'string' &&
    typeof record.recordId === 'string' &&
    typeof record.schemaVersion === 'number' &&
    typeof record.timeline?.receivedAtMs === 'number'
  );
};

const segmentTimestamp = (name: string) => {
  const match = /^probe-log-(\d+)-\d+\.jsonl$/.exec(name);
  return match ? Number(match[1]) : 0;
};

const listSegmentNames = async () => {
  await ensureDirectory();
  const names = await FileSystem.readDirectoryAsync(segmentsDirectory);
  return names
    .filter((name) => name.startsWith(segmentPrefix) && name.endsWith(segmentSuffix))
    .sort((a, b) => segmentTimestamp(a) - segmentTimestamp(b) || a.localeCompare(b));
};

const createSegmentUri = (timestamp: number) =>
  `${segmentsDirectory}/${segmentPrefix}${timestamp}-${Math.floor(Math.random() * 1_000_000)}${segmentSuffix}`;

const getActiveSegment = async () => {
  if (activeSegmentUri) return activeSegmentUri;
  const segments = await listSegmentNames();
  activeSegmentUri = segments.length ? `${segmentsDirectory}/${segments[segments.length - 1]}` : createSegmentUri(Date.now());
  return activeSegmentUri;
};

const readRecords = (raw: string) =>
  raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        return null;
      }
    })
    .filter(isProbeLogEnvelope);

const getKnownRecordIds = async () => {
  if (knownRecordIds) return knownRecordIds;
  const ids = new Set<string>();
  for (const name of await listSegmentNames()) {
    readRecords(await FileSystem.readAsStringAsync(`${segmentsDirectory}/${name}`)).forEach((record) => ids.add(record.recordId));
  }
  const legacyInfo = await FileSystem.getInfoAsync(legacyLogPath);
  if (legacyInfo.exists) {
    readRecords(await FileSystem.readAsStringAsync(legacyLogPath)).forEach((record) => ids.add(record.recordId));
  }
  knownRecordIds = ids;
  return ids;
};

const pruneSegments = async (policy: ProbeLogRetentionPolicy) => {
  const retentionMs = clampPositiveInteger(policy.retentionDays, DEFAULT_PROBE_LOGGING_SETTINGS.retentionDays) * 86_400_000;
  const budgetBytes = clampPositiveInteger(policy.storageBudgetMb, DEFAULT_PROBE_LOGGING_SETTINGS.storageBudgetMb) * 1024 * 1024;
  const cutoff = Date.now() - retentionMs;
  const segments = await listSegmentNames();
  const kept: Array<{ name: string; size: number }> = [];
  let total = 0;

  for (const name of segments) {
    const uri = `${segmentsDirectory}/${name}`;
    const info = await FileSystem.getInfoAsync(uri);
    const size = info.exists && typeof info.size === 'number' ? info.size : 0;
    if (segmentTimestamp(name) < cutoff) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      if (activeSegmentUri === uri) activeSegmentUri = null;
      continue;
    }
    kept.push({ name, size });
    total += size;
  }

  for (const segment of kept) {
    if (total <= budgetBytes || `${segmentsDirectory}/${segment.name}` === activeSegmentUri) break;
    await FileSystem.deleteAsync(`${segmentsDirectory}/${segment.name}`, { idempotent: true });
    total -= segment.size;
  }
};

export const normalizeProbeLoggingSettings = (
  partial: Partial<ProbeLoggingSettings> | null | undefined
): ProbeLoggingSettings => ({
  loggingEnabled: partial?.loggingEnabled ?? DEFAULT_PROBE_LOGGING_SETTINGS.loggingEnabled,
  loggingIntervalSec: clampPositiveInteger(partial?.loggingIntervalSec, DEFAULT_PROBE_LOGGING_SETTINGS.loggingIntervalSec),
  sensorReadIntervalSec: clampPositiveInteger(partial?.sensorReadIntervalSec, DEFAULT_PROBE_LOGGING_SETTINGS.sensorReadIntervalSec),
  gasReadIntervalSec: clampPositiveInteger(partial?.gasReadIntervalSec, DEFAULT_PROBE_LOGGING_SETTINGS.gasReadIntervalSec),
  retentionDays: clampPositiveInteger(partial?.retentionDays, DEFAULT_PROBE_LOGGING_SETTINGS.retentionDays),
  storageBudgetMb: clampPositiveInteger(partial?.storageBudgetMb, DEFAULT_PROBE_LOGGING_SETTINGS.storageBudgetMb),
  rawPayloadRetention: partial?.rawPayloadRetention ?? DEFAULT_PROBE_LOGGING_SETTINGS.rawPayloadRetention,
  highFrequencyLogging: partial?.highFrequencyLogging ?? DEFAULT_PROBE_LOGGING_SETTINGS.highFrequencyLogging,
  syncMode: partial?.syncMode === 'cloud_later' ? 'cloud_later' : DEFAULT_PROBE_LOGGING_SETTINGS.syncMode,
});

export const loadProbeLoggingSettings = async (): Promise<ProbeLoggingSettings> => {
  try {
    await ensureDirectory();
    const info = await FileSystem.getInfoAsync(settingsPath);
    return info.exists
      ? normalizeProbeLoggingSettings(JSON.parse(await FileSystem.readAsStringAsync(settingsPath)))
      : DEFAULT_PROBE_LOGGING_SETTINGS;
  } catch {
    return DEFAULT_PROBE_LOGGING_SETTINGS;
  }
};

export const saveProbeLoggingSettings = async (settings: ProbeLoggingSettings): Promise<void> => {
  await ensureDirectory();
  await FileSystem.writeAsStringAsync(settingsPath, JSON.stringify(normalizeProbeLoggingSettings(settings), null, 2));
};

export const appendProbeLogRecord = async (
  record: ProbeLogRecord,
  policy: ProbeLogRetentionPolicy = DEFAULT_PROBE_LOGGING_SETTINGS
): Promise<void> => {
  // Simultaneous telemetry events must not overwrite each other's record.
  appendQueue = appendQueue.catch(() => undefined).then(async () => {
    await ensureDirectory();
    const ids = record.recordId ? await getKnownRecordIds() : null;
    if (record.recordId && ids?.has(record.recordId)) return;
    const envelope = buildProbeLogEnvelope(
      record.probeId,
      record.snapshot,
      record.syncMode ?? DEFAULT_PROBE_LOGGING_SETTINGS.syncMode,
      {
        recordId: record.recordId,
        deviceTimestampMs: record.deviceTimestampMs,
        receivedAtMs: record.receivedAtMs,
        timestampValid: record.timestampValid,
        timestampOrigin: record.timestampOrigin,
      }
    );
    const line = `${JSON.stringify(envelope)}\n`;
    let uri = await getActiveSegment();
    const info = await FileSystem.getInfoAsync(uri);
    const currentSize = info.exists && typeof info.size === 'number' ? info.size : 0;
    if (currentSize > 0 && currentSize + line.length > maxSegmentBytes) {
      uri = createSegmentUri(Date.now());
      activeSegmentUri = uri;
      await FileSystem.writeAsStringAsync(uri, line, { encoding: FileSystem.EncodingType.UTF8 });
      ids?.add(envelope.recordId);
      await pruneSegments(policy);
      console.log(`[LocalStore][WRITE][OK] recordId=${envelope.recordId}`);
      return;
    }
    const current = info.exists ? await FileSystem.readAsStringAsync(uri) : '';
    await FileSystem.writeAsStringAsync(uri, `${current}${line}`, { encoding: FileSystem.EncodingType.UTF8 });
    ids?.add(envelope.recordId);
    console.log(`[LocalStore][WRITE][OK] recordId=${envelope.recordId}`);
  });
  return appendQueue;
};

export const loadRecentProbeLogRecords = async (options: ProbeLogQueryOptions = {}): Promise<ProbeLogEnvelope[]> => {
  try {
    const limit = options.limit ?? 120;
    const matches: ProbeLogEnvelope[] = [];
    const segmentNames = await listSegmentNames();
    for (const name of segmentNames.reverse()) {
      const records = readRecords(await FileSystem.readAsStringAsync(`${segmentsDirectory}/${name}`));
      for (let index = records.length - 1; index >= 0 && matches.length < limit; index -= 1) {
        if (!options.probeId || records[index].probeId === options.probeId) matches.push(records[index]);
      }
      if (matches.length >= limit) return matches;
    }
    const legacyInfo = await FileSystem.getInfoAsync(legacyLogPath);
    if (legacyInfo.exists) {
      const records = readRecords(await FileSystem.readAsStringAsync(legacyLogPath));
      for (let index = records.length - 1; index >= 0 && matches.length < limit; index -= 1) {
        if (!options.probeId || records[index].probeId === options.probeId) matches.push(records[index]);
      }
    }
    return matches;
  } catch {
    return [];
  }
};

export const getProbeLoggingStats = async (): Promise<ProbeLoggingStats> => {
  try {
    let fileSizeBytes = 0;
    let sampleCount = 0;
    const segmentNames = await listSegmentNames();
    for (const name of segmentNames) {
      const uri = `${segmentsDirectory}/${name}`;
      const info = await FileSystem.getInfoAsync(uri);
      fileSizeBytes += info.exists && typeof info.size === 'number' ? info.size : 0;
      sampleCount += readRecords(await FileSystem.readAsStringAsync(uri)).length;
    }
    const legacyInfo = await FileSystem.getInfoAsync(legacyLogPath);
    if (legacyInfo.exists) {
      fileSizeBytes += typeof legacyInfo.size === 'number' ? legacyInfo.size : 0;
      sampleCount += readRecords(await FileSystem.readAsStringAsync(legacyLogPath)).length;
    }
    return { sampleCount, fileSizeBytes };
  } catch {
    return { sampleCount: 0, fileSizeBytes: 0 };
  }
};

export const loadAllProbeLogRecords = async (): Promise<ProbeLogEnvelope[]> => {
  const records: ProbeLogEnvelope[] = [];
  for (const name of await listSegmentNames()) {
    records.push(...readRecords(await FileSystem.readAsStringAsync(`${segmentsDirectory}/${name}`)));
  }
  const legacyInfo = await FileSystem.getInfoAsync(legacyLogPath);
  if (legacyInfo.exists) records.push(...readRecords(await FileSystem.readAsStringAsync(legacyLogPath)));
  return records.sort((a, b) => {
    const aTime = a.timeline.deviceTimestampMs ?? a.timeline.receivedAtMs;
    const bTime = b.timeline.deviceTimestampMs ?? b.timeline.receivedAtMs;
    return aTime - bTime || a.recordId.localeCompare(b.recordId);
  });
};

export const deleteProbeLogRecords = async (
  shouldDelete: (record: ProbeLogEnvelope) => boolean
): Promise<string[]> => {
  const deletedRecordIds: string[] = [];
  appendQueue = appendQueue.catch(() => undefined).then(async () => {
    for (const name of await listSegmentNames()) {
      const uri = `${segmentsDirectory}/${name}`;
      const records = readRecords(await FileSystem.readAsStringAsync(uri));
      const kept = records.filter((record) => {
        if (!shouldDelete(record)) return true;
        deletedRecordIds.push(record.recordId);
        return false;
      });
      if (kept.length === records.length) continue;
      if (!kept.length) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } else {
        await FileSystem.writeAsStringAsync(
          uri,
          `${kept.map((record) => JSON.stringify(record)).join('\n')}\n`,
          { encoding: FileSystem.EncodingType.UTF8 }
        );
      }
    }

    const legacyInfo = await FileSystem.getInfoAsync(legacyLogPath);
    if (legacyInfo.exists) {
      const records = readRecords(await FileSystem.readAsStringAsync(legacyLogPath));
      const kept = records.filter((record) => {
        if (!shouldDelete(record)) return true;
        deletedRecordIds.push(record.recordId);
        return false;
      });
      if (!kept.length) {
        await FileSystem.deleteAsync(legacyLogPath, { idempotent: true });
      } else if (kept.length !== records.length) {
        await FileSystem.writeAsStringAsync(
          legacyLogPath,
          `${kept.map((record) => JSON.stringify(record)).join('\n')}\n`,
          { encoding: FileSystem.EncodingType.UTF8 }
        );
      }
    }
    activeSegmentUri = null;
    knownRecordIds = null;
  });
  await appendQueue;
  return [...new Set(deletedRecordIds)];
};

export const clearProbeLogRecords = async (): Promise<string[]> =>
  deleteProbeLogRecords(() => true);
