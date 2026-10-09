import type { PortalDeviceSummary } from './portalTypes';
import type { CloudTelemetryUploadRecord } from '../localTelemetryStore';

export function historyDevice(devices: PortalDeviceSummary[], sourceId: string, kind: 'lamp' | 'probe') {
  const matches = devices.filter(device => device.type === kind &&
    (device.id === sourceId || device.telemetrySourceNodeIds?.includes(sourceId)));
  return matches.length === 1 ? matches[0] : null;
}
export function prepareHistoryUpload(record: CloudTelemetryUploadRecord, devices: PortalDeviceSummary[]) {
  const lamp = historyDevice(devices, record.lampId, 'lamp');
  const probe = record.recordType === 'probe_environment' ? historyDevice(devices, record.probeId ?? '', 'probe') : null;
  if (!lamp?.access.canViewHistory || (record.recordType === 'probe_environment' && !probe?.access.canViewHistory)) return null;
  return { ...record, canonicalLampId: lamp.id, canonicalProbeId: probe?.id };
}

// Prefer the durable local representation over its cloud projection, once per
// physical sequence. Legacy cloud samples retain their existing fallback IDs.
export function mergeHistoryRecords<T extends { recordId: string }>(cloud: T[], local: T[], devices: PortalDeviceSummary[]): T[] {
  const key = (record: T) => {
    const match = /^lamp:(.+):history:(\d+)$/.exec(record.recordId);
    if (!match) return record.recordId;
    const lamp = historyDevice(devices, match[1], 'lamp');
    return `lamp:${lamp?.id ?? match[1]}:history:${match[2]}`;
  };
  return [...new Map([...cloud, ...local].map(record => [key(record), record])).values()];
}
