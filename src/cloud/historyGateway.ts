import type { PortalDeviceSummary } from './portalTypes';
import type { CloudTelemetryUploadRecord } from '../localTelemetryStore';
import { isHardwareUploadRecord } from './hardwareHistoryV4';
import { resolveHardwareBinding, type HardwareBinding } from '../mesh/hardwareIdentity';

export function historyDevice(devices: PortalDeviceSummary[], sourceId: string, kind: 'lamp' | 'probe') {
  const matches = devices.filter(device => device.type === kind &&
    (device.id === sourceId || device.telemetrySourceNodeIds?.includes(sourceId)));
  return matches.length === 1 ? matches[0] : null;
}
export function prepareHistoryUpload(
  record: CloudTelemetryUploadRecord, devices: PortalDeviceSummary[],
  bindings: HardwareBinding[] = [], accountUid?: string | null
): CloudTelemetryUploadRecord | null {
  if (isHardwareUploadRecord(record)) {
    // A UID alone is public. Require an explicit, unambiguous local association,
    // fresh canonical device inventory and History grants. The backend independently
    // checks its authoritative Firestore binding and grants again.
    const allowedBindings = accountUid ? bindings.filter(b => b.confirmedBy === accountUid) : bindings;
    if (!accountUid) return null; // Never upload v4 on an unscoped/stale account.
    const lampBinding = resolveHardwareBinding(allowedBindings, record.lampHardwareUid);
    if (lampBinding.state !== 'known') return null;
    const lamps = devices.filter(d => d.type === 'lamp' && d.id === lampBinding.arcDeviceId && d.access.canViewHistory);
    if (lamps.length !== 1) return null;
    const lamp = lamps[0];
    // A contradictory registered transport alias cannot be overridden by a UID.
    const nativeLamp = historyDevice(devices, record.lampId, 'lamp');
    if (nativeLamp && nativeLamp.id !== lamp.id) return null;
    if (record.recordType === 'lamp_operational') {
      if (record.sourceHardwareUid !== record.lampHardwareUid || record.nodeGeneration !== record.journalGeneration) return null;
      return { ...record, lampId: lamp.id, canonicalLampId: lamp.id,
        payload: { ...record.payload, lampId: lamp.id } };
    }
    const sourceBinding = resolveHardwareBinding(allowedBindings, record.sourceHardwareUid);
    if (sourceBinding.state !== 'known') return null;
    const probes = devices.filter(d => d.type === 'probe' && d.id === sourceBinding.arcDeviceId && d.access.canViewHistory);
    if (probes.length !== 1) return null;
    const probe = probes[0];
    const nativeProbe = historyDevice(devices, record.probeId ?? '', 'probe');
    if (nativeProbe && nativeProbe.id !== probe.id) return null;
    return { ...record, lampId: lamp.id, canonicalLampId: lamp.id,
      probeId: probe.id, canonicalProbeId: probe.id,
      payload: { ...record.payload, probeId: probe.id } };
  }
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
