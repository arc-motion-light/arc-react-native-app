import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import {
  clearLampOperationalRecords,
  deleteLampOperationalRecords,
  getLampLoggingStats,
  loadAllLampOperationalRecords,
} from './lampLogger';
import type { LampOperationalRecord } from './lampLogger';
import {
  clearProbeLogRecords,
  deleteProbeLogRecords,
  getProbeLoggingStats,
  loadAllProbeLogRecords,
} from './probeLogger';
import type { ProbeLogEnvelope } from './probeDataFormat';
import { buildHardwareHistoryUpload, isHardwareUploadRecord } from './cloud/hardwareHistoryV4';
import type { HardwareHistoryUploadRecord } from './cloud/hardwareHistoryV4';

const cloudSyncPreferenceKey = 'arc:cloud-sync:enabled:v1';
const syncDirectory = `${FileSystem.documentDirectory ?? ''}arc-local-telemetry`;
const syncStatePath = `${syncDirectory}/cloud-sync-state.json`;
const uploadBatchSize = 25;

export type LocalTelemetryKind = 'lamp' | 'probe';
export type CloudRecordState = 'queued' | 'uploading' | 'synced' | 'retry';

type CloudSyncRecordState = {
  state: CloudRecordState;
  queuedAtMs: number;
  uploadedAtMs?: number;
  attempts?: number;
  nextAttemptAtMs?: number;
  lastError?: string;
};

type CloudSyncIndex = Record<string, CloudSyncRecordState>;

export type LocalTelemetryDeviceStats = {
  key: string;
  kind: LocalTelemetryKind;
  deviceId: string;
  recordCount: number;
  oldestTimestampMs: number | null;
  newestTimestampMs: number | null;
};

export type LocalTelemetryStats = {
  totalRecords: number;
  lampRecords: number;
  probeRecords: number;
  oldestTimestampMs: number | null;
  newestTimestampMs: number | null;
  fileSizeBytes: number;
  pendingCloudRecords: number;
  syncedCloudRecords: number;
  unsyncedCloudRecords: number;
  devices: LocalTelemetryDeviceStats[];
};

export type LocalTelemetryDeleteOptions = {
  fromMs: number;
  toMs: number;
  deviceKey?: string | null;
};

export type LegacyCloudTelemetryUploadRecord = {
  recordId: string;
  recordType: 'lamp_operational' | 'probe_environment';
  lampId: string;
  probeId?: string;
  canonicalLampId?: string;
  canonicalProbeId?: string;
  historySequence: number;
  measurementTimestampMs: number;
  timestampOrigin: 'lamp_g4_rtc' | 'lamp_g4_receive_rtc';
  phoneReceivedAtMs: number;
  payload: LampOperationalRecord | ProbeLogEnvelope;
};

export type CloudTelemetryUploadRecord = LegacyCloudTelemetryUploadRecord | HardwareHistoryUploadRecord;

export type CloudTelemetryBatchResult = {
  acceptedRecordIds: string[];
  duplicateRecordIds?: string[];
};

type LocalRecord = {
  kind: LocalTelemetryKind;
  deviceId: string;
  recordId: string;
  timestampMs: number;
  eligible: boolean;
  uploadRecord: CloudTelemetryUploadRecord | null;
};

let syncStateQueue: Promise<void> = Promise.resolve();
let drainInFlight: Promise<{ queued: number; uploaded: number; failed: number }> | null = null;

const ensureSyncDirectory = async () => {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(syncDirectory);
  if (!info.exists) await FileSystem.makeDirectoryAsync(syncDirectory, { intermediates: true });
};

const loadSyncIndex = async (): Promise<CloudSyncIndex> => {
  try {
    await ensureSyncDirectory();
    const info = await FileSystem.getInfoAsync(syncStatePath);
    if (!info.exists) return {};
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(syncStatePath));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const normalized: CloudSyncIndex = {};
    Object.entries(parsed as CloudSyncIndex).forEach(([recordId, value]) => {
      if (!value || typeof value !== 'object') return;
      normalized[recordId] = value.state === 'uploading' ? { ...value, state: 'queued' } : value;
    });
    return normalized;
  } catch {
    return {};
  }
};

const saveSyncIndex = async (index: CloudSyncIndex): Promise<void> => {
  syncStateQueue = syncStateQueue.catch(() => undefined).then(async () => {
    await ensureSyncDirectory();
    await FileSystem.writeAsStringAsync(syncStatePath, JSON.stringify(index), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  });
  return syncStateQueue;
};

const historyIdentity = (recordId: string) => {
  const match = /^lamp:(.+):history:(\d+)$/.exec(recordId);
  if (!match) return null;
  const sequence = Number(match[2]);
  return Number.isInteger(sequence) ? { lampId: match[1], sequence } : null;
};

const lampLocalRecord = (record: LampOperationalRecord): LocalRecord => {
  const hardware = buildHardwareHistoryUpload(record);
  const identity = historyIdentity(record.recordId);
  const measurementTimestampMs = record.timeline.lampSampledAtMs;
  const eligible = Boolean(hardware || (
    !record.hardwareProvenance &&
    identity &&
    measurementTimestampMs != null &&
    record.timeline.timestampOrigin === 'lamp_g4_rtc'
  ));
  return {
    kind: 'lamp',
    deviceId: record.lampId,
    recordId: record.recordId,
    timestampMs: measurementTimestampMs ?? record.timeline.receivedAtMs,
    eligible,
    uploadRecord: hardware ?? (eligible && identity && measurementTimestampMs != null
      ? {
          recordId: record.recordId,
          recordType: 'lamp_operational',
          lampId: identity.lampId,
          historySequence: identity.sequence,
          measurementTimestampMs,
          timestampOrigin: 'lamp_g4_rtc',
          phoneReceivedAtMs: record.timeline.receivedAtMs,
          payload: record,
        }
      : null),
  };
};

const probeLocalRecord = (record: ProbeLogEnvelope): LocalRecord => {
  const hardware = buildHardwareHistoryUpload(record);
  const identity = historyIdentity(record.recordId);
  const measurementTimestampMs = record.timeline.deviceTimestampMs;
  const eligible = Boolean(hardware || (
    !record.hardwareProvenance &&
    identity &&
    measurementTimestampMs != null &&
    record.timeline.timestampValid !== false &&
    record.timeline.timestampOrigin === 'lamp_g4_receive_rtc'
  ));
  return {
    kind: 'probe',
    deviceId: record.probeId,
    recordId: record.recordId,
    timestampMs: measurementTimestampMs ?? record.timeline.receivedAtMs,
    eligible,
    uploadRecord: hardware ?? (eligible && identity && measurementTimestampMs != null
      ? {
          recordId: record.recordId,
          recordType: 'probe_environment',
          lampId: identity.lampId,
          probeId: record.probeId,
          historySequence: identity.sequence,
          measurementTimestampMs,
          timestampOrigin: 'lamp_g4_receive_rtc',
          phoneReceivedAtMs: record.timeline.receivedAtMs,
          payload: record,
        }
      : null),
  };
};

const loadLocalRecords = async (): Promise<LocalRecord[]> => {
  const [lampRecords, probeRecords] = await Promise.all([
    loadAllLampOperationalRecords(),
    loadAllProbeLogRecords(),
  ]);
  return [
    ...lampRecords.map(lampLocalRecord),
    ...probeRecords.map(probeLocalRecord),
  ].sort((a, b) => a.timestampMs - b.timestampMs || a.recordId.localeCompare(b.recordId));
};

export const loadCloudSyncEnabled = async (): Promise<boolean> => {
  const stored = await AsyncStorage.getItem(cloudSyncPreferenceKey);
  // Cloud Sync starts Local for a fresh install; enable it after local verification. Preserve any explicit user
  // choice already stored on this device, including an explicit OFF.
  return stored === '1';
};

export const saveCloudSyncEnabled = async (enabled: boolean): Promise<void> => {
  await AsyncStorage.setItem(cloudSyncPreferenceKey, enabled ? '1' : '0');
  console.log(`[CloudSync][STATE] enabled=${enabled ? 1 : 0}`);
};

export const loadLocalTelemetryStats = async (): Promise<LocalTelemetryStats> => {
  const [records, lampStats, probeStats, syncIndex] = await Promise.all([
    loadLocalRecords(),
    getLampLoggingStats(),
    getProbeLoggingStats(),
    loadSyncIndex(),
  ]);
  const timestamps = records.map((record) => record.timestampMs).filter(Number.isFinite);
  const eligible = records.filter((record) => record.eligible);
  const devices = new Map<string, LocalTelemetryDeviceStats>();
  records.forEach((record) => {
    const key = `${record.kind}:${record.deviceId}`;
    const current = devices.get(key) ?? {
      key,
      kind: record.kind,
      deviceId: record.deviceId,
      recordCount: 0,
      oldestTimestampMs: null,
      newestTimestampMs: null,
    };
    current.recordCount += 1;
    current.oldestTimestampMs = current.oldestTimestampMs === null
      ? record.timestampMs
      : Math.min(current.oldestTimestampMs, record.timestampMs);
    current.newestTimestampMs = current.newestTimestampMs === null
      ? record.timestampMs
      : Math.max(current.newestTimestampMs, record.timestampMs);
    devices.set(key, current);
  });
  const syncedCloudRecords = eligible.filter((record) => syncIndex[record.recordId]?.state === 'synced').length;
  const pendingCloudRecords = eligible.length - syncedCloudRecords;
  return {
    totalRecords: records.length,
    lampRecords: lampStats.sampleCount,
    probeRecords: probeStats.sampleCount,
    oldestTimestampMs: timestamps.length ? Math.min(...timestamps) : null,
    newestTimestampMs: timestamps.length ? Math.max(...timestamps) : null,
    fileSizeBytes: lampStats.fileSizeBytes + probeStats.fileSizeBytes,
    pendingCloudRecords,
    syncedCloudRecords,
    unsyncedCloudRecords: pendingCloudRecords,
    devices: [...devices.values()].sort((a, b) => b.recordCount - a.recordCount),
  };
};

const matchesDeleteOptions = (
  kind: LocalTelemetryKind,
  deviceId: string,
  timestampMs: number,
  options: LocalTelemetryDeleteOptions
) => timestampMs >= options.fromMs && timestampMs <= options.toMs &&
  (!options.deviceKey || options.deviceKey === `${kind}:${deviceId}`);

const removeSyncState = async (recordIds: string[]) => {
  if (!recordIds.length) return;
  const index = await loadSyncIndex();
  recordIds.forEach((recordId) => delete index[recordId]);
  await saveSyncIndex(index);
};

export const countUnsyncedLocalRecords = async (options: LocalTelemetryDeleteOptions): Promise<number> => {
  const [records, index] = await Promise.all([loadLocalRecords(), loadSyncIndex()]);
  return records.filter((record) =>
    record.eligible &&
    index[record.recordId]?.state !== 'synced' &&
    matchesDeleteOptions(record.kind, record.deviceId, record.timestampMs, options)
  ).length;
};

export const deleteLocalTelemetry = async (options: LocalTelemetryDeleteOptions): Promise<number> => {
  const [lampDeleted, probeDeleted] = await Promise.all([
    deleteLampOperationalRecords((record) => matchesDeleteOptions(
      'lamp',
      record.lampId,
      record.timeline.lampSampledAtMs ?? record.timeline.receivedAtMs,
      options
    )),
    deleteProbeLogRecords((record) => matchesDeleteOptions(
      'probe',
      record.probeId,
      record.timeline.deviceTimestampMs ?? record.timeline.receivedAtMs,
      options
    )),
  ]);
  const deleted = [...lampDeleted, ...probeDeleted];
  await removeSyncState(deleted);
  console.log(`[LocalStore][DELETE] from=${options.fromMs} to=${options.toMs} deleted=${deleted.length}`);
  return deleted.length;
};

export const clearAllLocalTelemetry = async (): Promise<number> => {
  const [lampDeleted, probeDeleted] = await Promise.all([
    clearLampOperationalRecords(),
    clearProbeLogRecords(),
  ]);
  const deleted = [...lampDeleted, ...probeDeleted];
  await removeSyncState(deleted);
  console.log(`[LocalStore][DELETE] from=all to=all deleted=${deleted.length}`);
  return deleted.length;
};

// A 403 before a Lamp is claimed is expected. Once a claim succeeds, retry
// immediately instead of retaining the old exponential-backoff deadline.
export const retryCloudTelemetryNow = async (): Promise<number> => {
  const index = await loadSyncIndex();
  let reset = 0;
  Object.values(index).forEach((state) => {
    if (state.state !== 'retry' && state.state !== 'uploading') return;
    state.state = 'queued';
    state.nextAttemptAtMs = undefined;
    state.lastError = undefined;
    reset += 1;
  });
  if (reset) await saveSyncIndex(index);
  console.log(`[CloudSync][RETRY_NOW] records=${reset}`);
  return reset;
};

export const drainCloudTelemetry = async (
  uploader: (records: CloudTelemetryUploadRecord[]) => Promise<CloudTelemetryBatchResult>,
  canUpload: (record: CloudTelemetryUploadRecord) => boolean = () => true
): Promise<{ queued: number; uploaded: number; failed: number }> => {
  if (drainInFlight) return drainInFlight;
  drainInFlight = (async () => {
    const records = (await loadLocalRecords()).filter(
      (record): record is LocalRecord & { uploadRecord: CloudTelemetryUploadRecord } => Boolean(record.uploadRecord)
    );
    const index = await loadSyncIndex();
    const now = Date.now();
    let newlyQueued = 0;
    records.forEach((record) => {
      if (!index[record.recordId]) {
        index[record.recordId] = { state: 'queued', queuedAtMs: now, attempts: 0 };
        newlyQueued += 1;
      }
    });
    if (newlyQueued) console.log(`[CloudSync][QUEUE] added=${newlyQueued} eligible=${records.length}`);
    await saveSyncIndex(index);

    const pending = records.filter((record) => {
      const state = index[record.recordId];
      return canUpload(record.uploadRecord) && state.state !== 'synced' && (state.nextAttemptAtMs ?? 0) <= now;
    });
    let uploaded = 0;
    let failed = 0;
    // Never combine the strict hardware-v4 schema with the legacy v3 schema in one HTTP batch.
    // A retried v4 event is idempotent even if another group was already acknowledged.
    const groups = [
      pending.filter(record => !isHardwareUploadRecord(record.uploadRecord)),
      pending.filter(record => isHardwareUploadRecord(record.uploadRecord)),
    ];
    const batches = groups.flatMap(group => {
      const chunks: typeof group[] = [];
      for (let offset = 0; offset < group.length; offset += uploadBatchSize) {
        chunks.push(group.slice(offset, offset + uploadBatchSize));
      }
      return chunks;
    });
    for (const batch of batches) {
      batch.forEach((record) => { index[record.recordId] = { ...index[record.recordId], state: 'uploading' }; });
      await saveSyncIndex(index);
      try {
        const result = await uploader(batch.map((record) => record.uploadRecord));
        const accepted = new Set([...(result.acceptedRecordIds ?? []), ...(result.duplicateRecordIds ?? [])]);
        let batchUploaded = 0;
        batch.forEach((record) => {
          if (!accepted.has(record.recordId)) return;
          index[record.recordId] = {
            ...index[record.recordId],
            state: 'synced',
            uploadedAtMs: Date.now(),
            nextAttemptAtMs: undefined,
            lastError: undefined,
          };
          uploaded += 1;
          batchUploaded += 1;
        });
        console.log(
          `[CloudSync][UPLOAD][OK] batch=${batch.length} acknowledged=${batchUploaded} accepted=${result.acceptedRecordIds?.length ?? 0} duplicates=${result.duplicateRecordIds?.length ?? 0}`
        );
      } catch (error: any) {
        const reason = error?.message ?? String(error);
        batch.forEach((record) => {
          const attempts = (index[record.recordId]?.attempts ?? 0) + 1;
          index[record.recordId] = {
            ...index[record.recordId],
            state: 'retry',
            attempts,
            nextAttemptAtMs: Date.now() + Math.min(300_000, 2 ** Math.min(attempts, 8) * 1000),
            lastError: reason.slice(0, 200),
          };
          failed += 1;
        });
        console.log(`[CloudSync][UPLOAD][RETRY] batch=${batch.length} attempts=${index[batch[0]?.recordId]?.attempts ?? 0} reason=${reason}`);
        await saveSyncIndex(index);
        break;
      }
      await saveSyncIndex(index);
    }
    const summary = { queued: pending.length, uploaded, failed };
    console.log(`[CloudSync][DRAIN] queued=${summary.queued} uploaded=${uploaded} failed=${failed}`);
    return summary;
  })().finally(() => { drainInFlight = null; });
  return drainInFlight;
};
