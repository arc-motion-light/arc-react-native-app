import type { MeshNode } from '../mesh/meshTypes';
import type { LampStatus } from '../ble/bleTypes';
import type { PortalDeviceSummary } from './portalTypes';
import { portalLatestToProbeStatus } from './portalTelemetry';

export type ConfirmedScheduleSnapshot = {
  schemaVersion: 3;
  deviceId: string;
  configVersion: number;
  enabled: boolean;
  observedAt: string;
  source: 'local_lamp_response';
  config: {
    onMinutes: number; sunriseFadeMinutes: number;
    daylightStartMinutes: number; daylightFadeMinutes: number;
    eveningStartMinutes: number; eveningFadeMinutes: number;
    offMinutes: number; nightFadeMinutes: number;
    sunriseTarget: [number, number, number, number];
    daylightTarget: [number, number, number, number];
    eveningTarget: [number, number, number, number];
  };
};

export const cloudRecordTime = (device?: PortalDeviceSummary | null) => {
  const time = Date.parse(device?.latestTelemetry?.sampledAt || device?.latestTelemetry?.receivedAt || '');
  return Number.isFinite(time) ? time : null;
};

export type DeviceViewNode = MeshNode & { canonicalDeviceId?: string };
// BLE MAC case/separator differences are formatting, not different devices.
// Do not normalize opaque UUIDs or infer identity from matching display names.
const identityKey = (id: string) => {
  const compact = id.replace(/[:-]/g, '');
  return /^[0-9a-f]{12}$/i.test(compact) ? compact.toUpperCase() : id;
};
const sameIdentity = (left: string, right: string) => identityKey(left) === identityKey(right);
export function canonicalDeviceForNode(node: MeshNode | null, inventory: PortalDeviceSummary[]) {
  if (!node) return null;
  const direct = inventory.find(device => device.id === ((node as DeviceViewNode).canonicalDeviceId ?? node.id));
  if (direct) return direct;
  const matches = inventory.filter(device => device.type === node.nodeKind &&
    device.telemetrySourceNodeIds?.some(id => sameIdentity(id, node.id) || Boolean(node.blePeripheralId && sameIdentity(id, node.blePeripheralId))));
  return matches.length === 1 ? matches[0] : null; // Never guess by name or ambiguous route IDs.
}

export function canonicalDeviceNodes(local: MeshNode[], inventory: PortalDeviceSummary[], kind: 'lamp' | 'probe', knownCanonicalIds: ReadonlySet<string> = new Set()): DeviceViewNode[] {
  const nodes = new Map<string, DeviceViewNode>(local.filter(node => (!knownCanonicalIds.has(node.id) || Boolean(canonicalDeviceForNode(node, inventory))) && node.nodeKind === kind && (kind === 'lamp' || node.provisioned)).map(node => [node.id, node]));
  for (const device of inventory) {
    if (device.type !== kind || !Object.entries(device.access).some(([key, value]) => key !== 'isOwner' && value === true)) continue;
    const existing = nodes.get(device.id) ?? [...nodes.values()].find(node => canonicalDeviceForNode(node, inventory)?.id === device.id);
    nodes.set(existing?.id ?? device.id, existing ? { ...existing, name: device.displayName, canonicalDeviceId: device.id } : {
      id: device.id, canonicalDeviceId: device.id, name: device.displayName, nodeKind: kind,
      abbreviation: kind === 'lamp' ? 'L' : 'P', color: '#305748',
      provisioned: false, connected: false,
    });
  }
  return [...nodes.values()].sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name));
}

export function deviceView(node: MeshNode | null, inventory: PortalDeviceSummary[], grantsCurrent: boolean, knownCanonicalIds: ReadonlySet<string> = new Set()) {
  const device = canonicalDeviceForNode(node, inventory);
  const telemetryAllowed = device ? device.access.canViewTelemetry : !knownCanonicalIds.has(node?.id ?? '');
  const localAt = node?.nodeKind === 'probe' ? node.probeStatus?.updatedAt : node?.lastSeen;
  const cloudAt = cloudRecordTime(device);
  // An absent timestamp cannot outrank an actual record; connected native state
  // is current. Disconnected records compete by sample time, never by owner/radio.
  const localCurrent = Boolean(node && (node.connected || (node.nodeKind === 'probe' && localAt && Date.now() - localAt < 60_000)));
  const cloud = Boolean(telemetryAllowed && device?.latestTelemetry && (!localCurrent && (!localAt || (cloudAt !== null && cloudAt >= localAt))));
  const localPath = Boolean(node?.connected);
  const grant = (flag: 'canControl' | 'canEditSettings' | 'canViewHistory') => device
    ? device.access[flag] && (flag === 'canViewHistory' || grantsCurrent)
    : Boolean(node?.provisioned && !knownCanonicalIds.has(node.id));
  return {
    node, device, owner: device?.owner ?? null, access: device?.access ?? null,
    provenance: cloud ? 'cloud' as const : localCurrent ? 'local' as const : 'last_known_local' as const,
    sampledAt: cloud ? cloudAt : localAt ?? null,
    telemetryAllowed,
    lampStatus: telemetryAllowed ? cloud ? portalLatestToLampStatus(device!) : node?.status ?? null : null,
    probeStatus: telemetryAllowed ? cloud ? portalLatestToProbeStatus(device?.latestTelemetry) : node?.probeStatus ?? null : null,
    canControl: localPath && grant('canControl'),
    canEditSettings: localPath && grant('canEditSettings'),
    canViewHistory: grant('canViewHistory'),
    schedule: telemetryAllowed ? device?.confirmedSchedule ?? null : null,
  };
}

export function portalLatestToLampStatus(device: PortalDeviceSummary): LampStatus | null {
  if (!device.access.canViewTelemetry || !device.latestTelemetry) return null;
  const values = device.latestTelemetry.values;
  const number = (key: string) => typeof values[key] === 'number' && Number.isFinite(values[key]) ? values[key] as number : NaN;
  const core = number('lamp_core_temp_c'), board = number('lamp_board_temp_c'), watts = number('lamp_power_w');
  const fan1 = number('lamp_fan1_rpm'), fan2 = number('lamp_fan2_rpm');
  return {
    power: values.lamp_output_enabled === true,
    intensity: Number.isFinite(watts) ? watts : 0, hue: 0.5, pwmFreq: NaN,
    timerOn: NaN, timerOff: NaN, hueTime: NaN, hueFade: NaN, timerEnabled: false,
    lampTimeEpoch: 0, lampTimeSynced: false,
    tempMcu: number('lamp_mcu_temp_c'), tempBoard: board, tempHeatsink: core,
    currentDraw: number('lamp_current_ma'), inputPowerWatts: Number.isFinite(watts) ? watts : undefined,
    telemetryValidity: { coreTemp: Number.isFinite(core), boardTemp: Number.isFinite(board), power: Number.isFinite(watts) },
    fan: { dutyPercent: NaN, rpm: fan1, tachPresent: Number.isFinite(fan1), tach2Rpm: fan2,
      tach2Present: Number.isFinite(fan2), automatic: false, rpmControl: false, targetRpm: NaN },
  };
}

export function scheduleRing(snapshot: ConfirmedScheduleSnapshot | null) {
  if (!snapshot || snapshot.schemaVersion !== 3) return null;
  const config = snapshot.config;
  return { on: config.onMinutes, off: config.offMinutes, hueFadeStart: config.eveningStartMinutes,
    hueFadeDuration: config.eveningFadeMinutes, morningFade: config.sunriseFadeMinutes, nightFade: config.nightFadeMinutes };
}

/** Fresh grants/ownership always win; an older response must not erase newer permitted observations. */
export function mergePortalInventory(previous: PortalDeviceSummary[], incoming: PortalDeviceSummary[]): PortalDeviceSummary[] {
  return incoming.map(device => {
    if (!device.access.canViewTelemetry) return { ...device, latestTelemetry: undefined, confirmedSchedule: undefined };
    const old = previous.find(item => item.id === device.id);
    const oldTime = cloudRecordTime(old), newTime = cloudRecordTime(device);
    const oldScheduleTime = Date.parse(old?.confirmedSchedule?.observedAt ?? '');
    const newScheduleTime = Date.parse(device.confirmedSchedule?.observedAt ?? '');
    return { ...device,
      latestTelemetry: oldTime !== null && (newTime === null || oldTime > newTime) ? old?.latestTelemetry : device.latestTelemetry,
      confirmedSchedule: Number.isFinite(oldScheduleTime) && (!Number.isFinite(newScheduleTime) || oldScheduleTime > newScheduleTime) ? old?.confirmedSchedule : device.confirmedSchedule,
    };
  });
}
