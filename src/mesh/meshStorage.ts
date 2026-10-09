import * as FileSystem from 'expo-file-system/legacy';
import type { MeshNode, MeshNodeKind, ProbeActiveTelemetryRoute, ProbeGatewayChildState, ProbeNodePowerRole } from './meshTypes';

const MESH_NODES_FILE = `${FileSystem.documentDirectory ?? ''}mesh_nodes.json`;
const MESH_NODES_TEMP_FILE = `${FileSystem.documentDirectory ?? ''}mesh_nodes.next.json`;
const MESH_NODES_BACKUP_FILE = `${FileSystem.documentDirectory ?? ''}mesh_nodes.backup.json`;

const NODE_KINDS: MeshNodeKind[] = ['lamp', 'probe', 'gateway', 'remote', 'other'];
const PROBE_ACTIVE_ROUTES: ProbeActiveTelemetryRoute[] = ['direct', 'viaGateway', 'viaLamp', 'none', 'unknown'];
const PROBE_POWER_ROLES: ProbeNodePowerRole[] = ['activeBle', 'sleepyChild', 'routerCapable', 'standalone', 'unknown'];
const PROBE_CHILD_STATES: ProbeGatewayChildState[] = ['recent', 'sleeping', 'missedWindow', 'stale', 'unknown'];

const sanitizeNodeKind = (value: unknown): MeshNodeKind =>
  NODE_KINDS.includes(value as MeshNodeKind) ? (value as MeshNodeKind) : 'lamp';

const enumValue = <T extends string>(value: unknown, options: T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

const optionalTimestamp = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const sanitizeNode = (node: MeshNode, restoring = false): MeshNode => ({
  id: String(node.id),
  uuid: node.uuid ?? null,
  unicastAddress: typeof node.unicastAddress === 'number' && Number.isFinite(node.unicastAddress) ? node.unicastAddress : null,
  unicastHex: node.unicastHex ?? null,
  nodeKind: sanitizeNodeKind(node.nodeKind),
  name: String(node.name || 'Lamp'),
  abbreviation: String(node.abbreviation || 'LP'),
  color: String(node.color || '#22c55e'),
  provisioned: Boolean(node.provisioned),
  connected: restoring ? false : Boolean(node.connected),
  lastKnownConnected: Boolean(node.connected || node.lastKnownConnected),
  blePeripheralId: typeof node.blePeripheralId === 'string' ? node.blePeripheralId : null,
  metadataUpdatedAt: typeof node.metadataUpdatedAt === 'number' ? node.metadataUpdatedAt : Date.now(),
  // Provisioning/OOB material does not belong in the JavaScript metadata file.
  staticOobHex: null,
  lastSeen: node.lastSeen,
  // A restored sample is cache, never proof of a live BLE link.  It is still
  // valuable on a cold launch: a sleepy child can take minutes to report, and
  // showing its last timestamped sample avoids an empty dashboard meanwhile.
  // `connected` remains false above until the Lamp/Probe transport proves the
  // current link is available.
  status: node.status ?? null,
  probeStatus: node.probeStatus ?? null,
  assignedGatewayId: node.assignedGatewayId ?? null,
  assignedBridgeId: node.assignedBridgeId ?? null,
  probeGatewayRoute: node.probeGatewayRoute ?? null,
  probeActiveTelemetryRoute: enumValue(node.probeActiveTelemetryRoute, PROBE_ACTIVE_ROUTES, 'unknown'),
  probePowerRole: enumValue(node.probePowerRole, PROBE_POWER_ROLES, 'unknown'),
  gatewayChildState: enumValue(node.gatewayChildState, PROBE_CHILD_STATES, 'unknown'),
  lastSeenViaGatewayAt: optionalTimestamp(node.lastSeenViaGatewayAt),
  lastSeenViaLampAt: optionalTimestamp(node.lastSeenViaLampAt),
  lastDirectBleSeenAt: optionalTimestamp(node.lastDirectBleSeenAt),
});

export const loadMeshNodes = async (): Promise<MeshNode[]> => {
  for (const path of [MESH_NODES_FILE, MESH_NODES_BACKUP_FILE, MESH_NODES_TEMP_FILE]) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) continue;
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(path));
      if (Array.isArray(parsed)) return parsed.map((item) => sanitizeNode(item, true));
    } catch {
      // Try the previous durable generation.
    }
  }
  return [];
};

export const saveMeshNodes = async (nodes: MeshNode[]): Promise<void> => {
  try {
    const payload = JSON.stringify(nodes.map((node) => sanitizeNode(node)));
    await FileSystem.deleteAsync(MESH_NODES_TEMP_FILE, { idempotent: true });
    await FileSystem.writeAsStringAsync(MESH_NODES_TEMP_FILE, payload);
    await FileSystem.deleteAsync(MESH_NODES_BACKUP_FILE, { idempotent: true });
    const previous = await FileSystem.getInfoAsync(MESH_NODES_FILE);
    if (previous.exists) await FileSystem.moveAsync({ from: MESH_NODES_FILE, to: MESH_NODES_BACKUP_FILE });
    await FileSystem.moveAsync({ from: MESH_NODES_TEMP_FILE, to: MESH_NODES_FILE });
    await FileSystem.deleteAsync(MESH_NODES_BACKUP_FILE, { idempotent: true });
  } catch (err) {
    // ignore storage failures
  }
};
