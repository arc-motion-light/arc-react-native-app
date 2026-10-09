import * as FileSystem from 'expo-file-system/legacy';
import type {
  ArcAppFacingRole,
  ArcCommissioningState,
  ArcDeviceKind,
  ArcDeviceRegistryEntry,
  ArcRoutePreference,
  ArcTransport,
} from './arcRoles';

const ARC_REGISTRY_FILE = `${FileSystem.documentDirectory ?? ''}arc_device_registry.json`;
const ARC_REGISTRY_TEMP_FILE = `${FileSystem.documentDirectory ?? ''}arc_device_registry.next.json`;
const ARC_REGISTRY_BACKUP_FILE = `${FileSystem.documentDirectory ?? ''}arc_device_registry.backup.json`;

const DEVICE_KINDS: ArcDeviceKind[] = ['gateway', 'lamp', 'probe', 'unknown'];
const APP_FACING_ROLES: ArcAppFacingRole[] = [
  'standalone_probe',
  'gateway_sleepy_child',
  'lamp_sleepy_child',
  'lamp_local_bridge',
  'gateway_app_cloud_link',
  'thread_node_only',
  'fallback_service',
];
const COMMISSIONING_STATES: ArcCommissioningState[] = ['uncommissioned', 'commissioning', 'commissioned', 'needs_migration', 'service'];
const TRANSPORTS: ArcTransport[] = ['ble', 'thread_via_lamp', 'thread_via_gateway', 'cloud_gateway'];
const ROUTE_PREFERENCES: ArcRoutePreference[] = ['auto', 'direct_ble', 'lamp_bridge', 'gateway_local', 'gateway_cloud'];

const enumValue = <T extends string>(value: unknown, options: T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

const sanitizeEntry = (entry: ArcDeviceRegistryEntry): ArcDeviceRegistryEntry => ({
  id: String(entry.id),
  name: String(entry.name || 'ARC device'),
  deviceKind: enumValue(entry.deviceKind, DEVICE_KINDS, 'unknown'),
  appFacingRole: enumValue(entry.appFacingRole, APP_FACING_ROLES, 'fallback_service'),
  commissioningState: enumValue(entry.commissioningState, COMMISSIONING_STATES, 'uncommissioned'),
  preferredTransport: enumValue(entry.preferredTransport, TRANSPORTS, 'ble'),
  routePreference: enumValue(entry.routePreference, ROUTE_PREFERENCES, 'auto'),
  connected: Boolean(entry.connected),
  appFacing: Boolean(entry.appFacing),
  assignedGatewayId: entry.assignedGatewayId ?? null,
  assignedBridgeId: entry.assignedBridgeId ?? null,
  lastSeen: typeof entry.lastSeen === 'number' ? entry.lastSeen : null,
  updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
});

export const loadArcDeviceRegistry = async (): Promise<ArcDeviceRegistryEntry[]> => {
  for (const path of [ARC_REGISTRY_FILE, ARC_REGISTRY_BACKUP_FILE, ARC_REGISTRY_TEMP_FILE]) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) continue;
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(path));
      if (Array.isArray(parsed)) return parsed.map((item) => sanitizeEntry(item));
    } catch {
      // Try the previous durable generation.
    }
  }
  return [];
};

export const saveArcDeviceRegistry = async (entries: ArcDeviceRegistryEntry[]): Promise<void> => {
  try {
    await FileSystem.deleteAsync(ARC_REGISTRY_TEMP_FILE, { idempotent: true });
    await FileSystem.writeAsStringAsync(ARC_REGISTRY_TEMP_FILE, JSON.stringify(entries.map((entry) => sanitizeEntry(entry))));
    await FileSystem.deleteAsync(ARC_REGISTRY_BACKUP_FILE, { idempotent: true });
    const previous = await FileSystem.getInfoAsync(ARC_REGISTRY_FILE);
    if (previous.exists) await FileSystem.moveAsync({ from: ARC_REGISTRY_FILE, to: ARC_REGISTRY_BACKUP_FILE });
    await FileSystem.moveAsync({ from: ARC_REGISTRY_TEMP_FILE, to: ARC_REGISTRY_FILE });
    await FileSystem.deleteAsync(ARC_REGISTRY_BACKUP_FILE, { idempotent: true });
  } catch {
    // ignore storage failures
  }
};
