import * as FileSystem from 'expo-file-system/legacy';

import type { LampStatus } from './ble/bleTypes';
import type { ArcLampHistoryRecord } from './mesh/arcHistoryProtocol';

export type LampOperationalRecord = {
  schemaVersion: 1;
  recordType: 'lamp_operational';
  recordId: string;
  lampId: string;
  timeline: {
    lampSampledAtMs: number | null;
    receivedAtMs: number;
    timestampOrigin: 'phone_receive_live' | 'lamp_g4_rtc' | 'portal_sample' | 'unknown';
    timestampQuality: 'transport_receive_estimate' | 'edge_timestamp' | 'unavailable';
  };
  measured: {
    coreTemperatureC: number | null;
    boardTemperatureC: number | null;
    mcuTemperatureC: number | null;
    currentMa: number | null;
    fan1Rpm: number | null;
    fan2Rpm: number | null;
  };
  commanded: {
    lampOn: boolean;
    fanDutyPercent: number | null;
    fanTargetRpm: number | null;
    requestedChannelsPercent: [number, number, number, number] | null;
    powerTargetWatts: number | null;
    targetPwmHz: number | null;
  };
  derived: {
    inputPowerWatts: number | null;
    filteredDisplayPowerWatts: number | null;
  };
  state: {
    appliedChannelsPercent: [number, number, number, number] | null;
    outputsEnabled: boolean | null;
    fanAutomatic: boolean | null;
    fanRpmControl: boolean | null;
    activePwmHz: number | null;
    thermalLimitReached: boolean;
    thermalShutdown: boolean;
    healthSeverity: 'nominal' | 'warning' | 'error' | null;
    healthCode: number | null;
    flagsRaw: number | null;
  };
  provenance: {
    sourcePath: 'lamp_ble_phone_bridge' | 'lamp_g4_fram_history' | 'portal_canonical';
    power: 'derived_12v_times_measured_current' | 'unavailable' | 'reported_cloud_record';
  };
  history?: {
    sequence: number;
    eventKind: 'periodic' | 'state_change' | 'fault_change';
  };
};

export type LampLoggingStats = {
  sampleCount: number;
  fileSizeBytes: number;
};

const directory = `${FileSystem.documentDirectory ?? ''}lamp-logger`;
const segmentsDirectory = `${directory}/segments`;
const segmentPrefix = 'lamp-operational-';
const segmentSuffix = '.jsonl';
const maxSegmentBytes = 64 * 1024;
const periodicIntervalMs = 60_000;
const defaultRetentionDays = 7;
const defaultStorageBudgetMb = 25;

let activeSegmentUri: string | null = null;
let appendQueue: Promise<void> = Promise.resolve();
const lastStoredAt = new Map<string, number>();
const lastStateSignature = new Map<string, string>();
const knownRecordIds = new Set<string>();
let knownRecordIdsLoaded = false;

const ensureDirectory = async () => {
  if (!FileSystem.documentDirectory) return;
  const directoryInfo = await FileSystem.getInfoAsync(directory);
  if (!directoryInfo.exists) await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const segmentsInfo = await FileSystem.getInfoAsync(segmentsDirectory);
  if (!segmentsInfo.exists) await FileSystem.makeDirectoryAsync(segmentsDirectory, { intermediates: true });
};

const listSegments = async () => {
  await ensureDirectory();
  return (await FileSystem.readDirectoryAsync(segmentsDirectory))
    .filter((name) => name.startsWith(segmentPrefix) && name.endsWith(segmentSuffix))
    .sort();
};

const segmentTimestamp = (name: string) => {
  const match = /^lamp-operational-(\d+)-\d+\.jsonl$/.exec(name);
  return match ? Number(match[1]) : 0;
};

const pruneSegments = async (retentionDays: number, storageBudgetMb: number) => {
  const cutoff = Date.now() - Math.max(1, Math.trunc(retentionDays || defaultRetentionDays)) * 86_400_000;
  const budgetBytes = Math.max(1, Math.trunc(storageBudgetMb || defaultStorageBudgetMb)) * 1024 * 1024;
  const kept: Array<{ uri: string; size: number }> = [];
  let total = 0;
  for (const name of await listSegments()) {
    const uri = `${segmentsDirectory}/${name}`;
    const info = await FileSystem.getInfoAsync(uri);
    const size = info.exists && typeof info.size === 'number' ? info.size : 0;
    if (segmentTimestamp(name) < cutoff && uri !== activeSegmentUri) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      continue;
    }
    kept.push({ uri, size });
    total += size;
  }
  for (const segment of kept) {
    if (total <= budgetBytes) break;
    if (segment.uri === activeSegmentUri) continue;
    await FileSystem.deleteAsync(segment.uri, { idempotent: true });
    total -= segment.size;
  }
};

const createSegmentUri = (now: number) =>
  `${segmentsDirectory}/${segmentPrefix}${String(now).padStart(13, '0')}-${Math.floor(Math.random() * 1_000_000)}${segmentSuffix}`;

const currentSegment = async (now: number) => {
  if (activeSegmentUri) return activeSegmentUri;
  const names = await listSegments();
  activeSegmentUri = names.length ? `${segmentsDirectory}/${names[names.length - 1]}` : createSegmentUri(now);
  return activeSegmentUri;
};

const ensureKnownRecordIds = async () => {
  if (knownRecordIdsLoaded) return;
  for (const name of await listSegments()) {
    for (const line of (await FileSystem.readAsStringAsync(`${segmentsDirectory}/${name}`)).split('\n').filter(Boolean)) {
      try {
        const parsed = JSON.parse(line) as { recordId?: unknown };
        if (typeof parsed.recordId === 'string') knownRecordIds.add(parsed.recordId);
      } catch {
        // Ignore a torn JSONL tail and retain every earlier committed record.
      }
    }
  }
  knownRecordIdsLoaded = true;
};

const appendRecord = async (
  record: LampOperationalRecord,
  policy: { retentionDays?: number; storageBudgetMb?: number } = {}
) => {
  await ensureKnownRecordIds();
  if (knownRecordIds.has(record.recordId)) return false;
  const line = `${JSON.stringify(record)}\n`;
  let uri = await currentSegment(record.timeline.receivedAtMs);
  const info = await FileSystem.getInfoAsync(uri);
  const size = info.exists && typeof info.size === 'number' ? info.size : 0;
  if (size > 0 && size + line.length > maxSegmentBytes) {
    uri = createSegmentUri(record.timeline.receivedAtMs);
    activeSegmentUri = uri;
    await FileSystem.writeAsStringAsync(uri, line, { encoding: FileSystem.EncodingType.UTF8 });
  } else {
    const current = info.exists ? await FileSystem.readAsStringAsync(uri) : '';
    await FileSystem.writeAsStringAsync(uri, `${current}${line}`, { encoding: FileSystem.EncodingType.UTF8 });
  }
  knownRecordIds.add(record.recordId);
  await pruneSegments(policy.retentionDays ?? defaultRetentionDays, policy.storageBudgetMb ?? defaultStorageBudgetMb);
  console.log(`[LocalStore][WRITE][OK] recordId=${record.recordId}`);
  return true;
};

const numberOrNull = (value: number | null | undefined, valid = true) =>
  valid && typeof value === 'number' && Number.isFinite(value) ? value : null;

const stateSignature = (status: LampStatus) => JSON.stringify({
  power: status.power,
  flags: status.openMeshFlagsRaw ?? null,
  health: status.health ?? null,
  manualActive: status.manualControl?.active ?? null,
  powerTarget: status.manualControl?.powerTargetWatts ?? null,
  fanAutomatic: status.fan?.automatic ?? null,
  fanRpmControl: status.fan?.rpmControl ?? null,
  fanTargetRpm: status.fan?.targetRpm ?? null,
  outputsEnabled: status.pwmFrequency?.outputsEnabled ?? null,
  targetPwmHz: status.pwmFrequency?.targetHz ?? null,
});

const buildRecord = (lampId: string, status: LampStatus, receivedAtMs: number): LampOperationalRecord => ({
  schemaVersion: 1,
  recordType: 'lamp_operational',
  recordId: `lamp:${lampId}:operational:${receivedAtMs}`,
  lampId,
  timeline: {
    lampSampledAtMs: null,
    receivedAtMs,
    timestampOrigin: 'phone_receive_live',
    timestampQuality: 'transport_receive_estimate',
  },
  measured: {
    coreTemperatureC: numberOrNull(status.tempHeatsink, status.telemetryValidity?.coreTemp !== false),
    boardTemperatureC: numberOrNull(status.tempBoard, status.telemetryValidity?.boardTemp !== false),
    mcuTemperatureC: numberOrNull(status.tempMcu),
    currentMa: numberOrNull(status.currentDraw, status.telemetryValidity?.power !== false),
    fan1Rpm: numberOrNull(status.fan?.rpm, status.fan?.tachPresent === true),
    fan2Rpm: numberOrNull(status.fan?.tach2Rpm, status.fan?.tach2Present === true),
  },
  commanded: {
    lampOn: status.power,
    fanDutyPercent: numberOrNull(status.fan?.dutyPercent),
    fanTargetRpm: numberOrNull(status.fan?.targetRpm),
    requestedChannelsPercent: status.manualControl?.requestedChannels ?? null,
    powerTargetWatts: numberOrNull(status.manualControl?.powerTargetWatts),
    targetPwmHz: numberOrNull(status.pwmFrequency?.targetHz),
  },
  derived: {
    inputPowerWatts: numberOrNull(status.inputPowerWatts, status.telemetryValidity?.power !== false),
    filteredDisplayPowerWatts: numberOrNull(status.displayPowerWatts, status.telemetryValidity?.power !== false),
  },
  state: {
    appliedChannelsPercent: status.manualControl?.appliedChannels ?? null,
    outputsEnabled: status.pwmFrequency?.outputsEnabled ?? null,
    fanAutomatic: status.fan?.automatic ?? null,
    fanRpmControl: status.fan?.rpmControl ?? null,
    activePwmHz: numberOrNull(status.pwmFrequency?.activeHz),
    thermalLimitReached: status.openMeshFlags?.thermalLimitReached ?? false,
    thermalShutdown: status.openMeshFlags?.thermalShutdown ?? false,
    healthSeverity: status.health?.severity ?? null,
    healthCode: numberOrNull(status.health?.code),
    flagsRaw: numberOrNull(status.openMeshFlagsRaw),
  },
  provenance: {
    sourcePath: 'lamp_ble_phone_bridge',
    power: status.telemetryValidity?.power !== false && typeof status.inputPowerWatts === 'number'
      ? 'derived_12v_times_measured_current'
      : 'unavailable',
  },
});

export const appendLampOperationalRecord = async (
  lampId: string,
  status: LampStatus,
  receivedAtMs = Date.now(),
  policy: { retentionDays?: number; storageBudgetMb?: number } = {}
): Promise<boolean> => {
  const signature = stateSignature(status);
  const stateChanged = lastStateSignature.get(lampId) !== signature;
  if (!stateChanged && receivedAtMs - (lastStoredAt.get(lampId) ?? 0) < periodicIntervalMs) return false;
  lastStateSignature.set(lampId, signature);
  lastStoredAt.set(lampId, receivedAtMs);
  const record = buildRecord(lampId, status, receivedAtMs);

  appendQueue = appendQueue.catch(() => undefined).then(async () => {
    await appendRecord(record, policy);
  });
  await appendQueue;
  return true;
};

export const appendRecoveredLampOperationalRecord = async (
  lampId: string,
  history: ArcLampHistoryRecord,
  receivedAtMs = Date.now(),
  policy: { retentionDays?: number; storageBudgetMb?: number } = {}
): Promise<boolean> => {
  const record: LampOperationalRecord = {
    schemaVersion: 1,
    recordType: 'lamp_operational',
    recordId: `lamp:${lampId}:history:${history.sequence}`,
    lampId,
    timeline: {
      lampSampledAtMs: history.timestampValid ? history.unixTimeSeconds * 1000 : null,
      receivedAtMs,
      timestampOrigin: history.timestampValid ? 'lamp_g4_rtc' : 'unknown',
      timestampQuality: history.timestampValid ? 'edge_timestamp' : 'unavailable',
    },
    measured: {
      coreTemperatureC: history.coreTemperatureC,
      boardTemperatureC: history.boardTemperatureC,
      mcuTemperatureC: history.mcuTemperatureC,
      currentMa: history.currentMa,
      fan1Rpm: history.fan1Rpm,
      fan2Rpm: history.fan2Rpm,
    },
    commanded: {
      lampOn: history.lampOn,
      fanDutyPercent: history.fanDutyPercent,
      fanTargetRpm: null,
      requestedChannelsPercent: null,
      powerTargetWatts: null,
      targetPwmHz: null,
    },
    derived: {
      inputPowerWatts: history.powerWatts,
      filteredDisplayPowerWatts: null,
    },
    state: {
      appliedChannelsPercent: history.appliedChannelsPercent,
      outputsEnabled: history.outputsEnabled,
      fanAutomatic: history.fanAutomatic,
      fanRpmControl: history.fanRpmControl,
      activePwmHz: null,
      thermalLimitReached: history.thermalLimitReached,
      thermalShutdown: history.thermalShutdown,
      healthSeverity: history.healthSeverity,
      healthCode: history.healthCode,
      flagsRaw: history.stateFlags,
    },
    provenance: {
      sourcePath: 'lamp_g4_fram_history',
      power: history.powerWatts === null ? 'unavailable' : 'derived_12v_times_measured_current',
    },
    history: { sequence: history.sequence, eventKind: history.eventKind },
  };
  let stored = false;
  appendQueue = appendQueue.catch(() => undefined).then(async () => {
    stored = await appendRecord(record, policy);
  });
  await appendQueue;
  return stored;
};

export const loadRecentLampOperationalRecords = async (lampId: string, limit = 240): Promise<LampOperationalRecord[]> => {
  const records: LampOperationalRecord[] = [];
  for (const name of (await listSegments()).reverse()) {
    const lines = (await FileSystem.readAsStringAsync(`${segmentsDirectory}/${name}`)).split('\n').filter(Boolean);
    for (let index = lines.length - 1; index >= 0 && records.length < limit; index -= 1) {
      try {
        const record = JSON.parse(lines[index]) as LampOperationalRecord;
        if (record.recordType === 'lamp_operational' && record.lampId === lampId) records.push(record);
      } catch {
        // A torn final JSONL line is ignored; earlier committed lines remain usable.
      }
    }
    if (records.length >= limit) break;
  }
  return records.sort((a, b) => a.timeline.receivedAtMs - b.timeline.receivedAtMs || a.recordId.localeCompare(b.recordId));
};

const readLampRecordsFromSegment = async (uri: string): Promise<LampOperationalRecord[]> => {
  const records: LampOperationalRecord[] = [];
  for (const line of (await FileSystem.readAsStringAsync(uri)).split('\n').filter(Boolean)) {
    try {
      const record = JSON.parse(line) as LampOperationalRecord;
      if (record.recordType === 'lamp_operational' && typeof record.recordId === 'string') records.push(record);
    } catch {
      // Ignore a torn JSONL tail. Earlier records remain durable and readable.
    }
  }
  return records;
};

export const loadAllLampOperationalRecords = async (): Promise<LampOperationalRecord[]> => {
  const records: LampOperationalRecord[] = [];
  for (const name of await listSegments()) {
    records.push(...await readLampRecordsFromSegment(`${segmentsDirectory}/${name}`));
  }
  return records.sort((a, b) => {
    const aTime = a.timeline.lampSampledAtMs ?? a.timeline.receivedAtMs;
    const bTime = b.timeline.lampSampledAtMs ?? b.timeline.receivedAtMs;
    return aTime - bTime || a.recordId.localeCompare(b.recordId);
  });
};

export const getLampLoggingStats = async (): Promise<LampLoggingStats> => {
  let sampleCount = 0;
  let fileSizeBytes = 0;
  for (const name of await listSegments()) {
    const uri = `${segmentsDirectory}/${name}`;
    const info = await FileSystem.getInfoAsync(uri);
    fileSizeBytes += info.exists && typeof info.size === 'number' ? info.size : 0;
    sampleCount += (await readLampRecordsFromSegment(uri)).length;
  }
  return { sampleCount, fileSizeBytes };
};

export const deleteLampOperationalRecords = async (
  shouldDelete: (record: LampOperationalRecord) => boolean
): Promise<string[]> => {
  const deletedRecordIds: string[] = [];
  appendQueue = appendQueue.catch(() => undefined).then(async () => {
    for (const name of await listSegments()) {
      const uri = `${segmentsDirectory}/${name}`;
      const records = await readLampRecordsFromSegment(uri);
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
    activeSegmentUri = null;
    knownRecordIds.clear();
    knownRecordIdsLoaded = false;
  });
  await appendQueue;
  return deletedRecordIds;
};

export const clearLampOperationalRecords = async (): Promise<string[]> =>
  deleteLampOperationalRecords(() => true);
