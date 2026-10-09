import type { MeshNode, MeshNodeKind } from '../mesh/meshTypes';

export type ArcDeviceKind = 'gateway' | 'lamp' | 'probe' | 'unknown';

export type ArcAppFacingRole =
  | 'standalone_probe'
  | 'gateway_sleepy_child'
  | 'lamp_sleepy_child'
  | 'lamp_local_bridge'
  | 'gateway_app_cloud_link'
  | 'thread_node_only'
  | 'fallback_service';

export type ArcTransport = 'ble' | 'thread_via_lamp' | 'thread_via_gateway' | 'cloud_gateway';

export type ArcCommissioningState = 'uncommissioned' | 'commissioning' | 'commissioned' | 'needs_migration' | 'service';

export type ArcRoutePreference = 'auto' | 'direct_ble' | 'lamp_bridge' | 'gateway_local' | 'gateway_cloud';

export type ArcDeviceRegistryEntry = {
  id: string;
  name: string;
  deviceKind: ArcDeviceKind;
  appFacingRole: ArcAppFacingRole;
  commissioningState: ArcCommissioningState;
  preferredTransport: ArcTransport;
  routePreference: ArcRoutePreference;
  connected: boolean;
  appFacing: boolean;
  assignedGatewayId?: string | null;
  assignedBridgeId?: string | null;
  lastSeen?: number | null;
  updatedAt: number;
};

const toDeviceKind = (nodeKind?: MeshNodeKind | null): ArcDeviceKind => {
  if (nodeKind === 'gateway' || nodeKind === 'lamp' || nodeKind === 'probe') return nodeKind;
  return 'unknown';
};

export const recommendArcRole = (deviceKind: ArcDeviceKind, hasGateway: boolean, hasLampBridge: boolean): ArcAppFacingRole => {
  if (deviceKind === 'gateway') return 'gateway_app_cloud_link';
  // The Lamp's WBA5 is the direct, app-facing BLE endpoint until a Gateway is
  // explicitly assigned to this individual Lamp.
  if (deviceKind === 'lamp') return 'lamp_local_bridge';
  if (deviceKind === 'probe') return 'standalone_probe';
  return 'fallback_service';
};

export const selectArcTransport = (role: ArcAppFacingRole, routePreference: ArcRoutePreference): ArcTransport => {
  if (routePreference === 'gateway_cloud') return 'cloud_gateway';
  if (routePreference === 'gateway_local') return 'thread_via_gateway';
  if (routePreference === 'lamp_bridge') return 'thread_via_lamp';
  if (role === 'gateway_app_cloud_link' || role === 'standalone_probe' || role === 'lamp_local_bridge' || role === 'fallback_service') {
    return 'ble';
  }
  return 'thread_via_gateway';
};

const selectRoutePreference = (node: MeshNode, role: ArcAppFacingRole, hasGateway: boolean, hasLampBridge: boolean): ArcRoutePreference => {
  if (role === 'gateway_app_cloud_link') return 'gateway_local';
  if (role === 'lamp_local_bridge') return 'lamp_bridge';
  if (role === 'standalone_probe') return 'direct_ble';
  if (node.assignedGatewayId || hasGateway) return 'gateway_local';
  if (hasLampBridge) return 'lamp_bridge';
  return 'auto';
};

export const buildArcRegistryFromNodes = (nodes: MeshNode[]): ArcDeviceRegistryEntry[] => {
  const provisioned = nodes.filter((node) => node.provisioned);
  const hasGateway = provisioned.some((node) => node.nodeKind === 'gateway');
  const hasLampBridge = provisioned.some((node) => node.nodeKind === 'lamp' && node.connected);
  const connectedLampBridge = provisioned.find((node) => node.nodeKind === 'lamp' && node.connected) ?? null;
  const now = Date.now();

  return nodes.map((node) => {
    const deviceKind = toDeviceKind(node.nodeKind);
    const routedSeenAt = node.assignedGatewayId ? node.lastSeenViaGatewayAt : node.assignedBridgeId ? node.lastSeenViaLampAt : null;
    const routedTelemetryRecent = deviceKind === 'probe' && typeof routedSeenAt === 'number' && now - routedSeenAt <= 5 * 60 * 1000;
    const isAssignedGatewayChild = deviceKind === 'probe' && Boolean(node.assignedGatewayId);
    const isAssignedLampChild = deviceKind === 'probe' && Boolean(node.assignedBridgeId);
    const assignedBridgeConnected = isAssignedLampChild && provisioned.some(
      (candidate) => candidate.id === node.assignedBridgeId && candidate.connected
    );
    const assignedGatewayConnected = isAssignedGatewayChild && provisioned.some(
      (candidate) => candidate.id === node.assignedGatewayId && candidate.connected
    );
    const role = isAssignedGatewayChild
      ? 'gateway_sleepy_child'
      : isAssignedLampChild
        ? 'lamp_sleepy_child'
        : deviceKind === 'lamp' && Boolean(node.assignedGatewayId)
          ? 'thread_node_only'
          : recommendArcRole(deviceKind, hasGateway, hasLampBridge);
    const routePreference = selectRoutePreference(node, role, hasGateway, hasLampBridge);
    return {
      id: node.id,
      name: node.name,
      deviceKind,
      appFacingRole: role,
      commissioningState: node.provisioned ? 'commissioned' : 'uncommissioned',
      preferredTransport: selectArcTransport(role, routePreference),
      routePreference,
      // `node.connected` is the direct CoreBluetooth link. A sleepy child is
      // reachable once its assigned bridge is connected; fresh telemetry is
      // then a sample-age signal, not a prerequisite for rendering the route.
      connected: node.connected || routedTelemetryRecent || assignedBridgeConnected || assignedGatewayConnected,
      appFacing: role === 'gateway_app_cloud_link' || role === 'lamp_local_bridge' || role === 'standalone_probe' || role === 'fallback_service',
      assignedGatewayId: node.assignedGatewayId ?? null,
      assignedBridgeId: node.assignedBridgeId ?? (role === 'lamp_sleepy_child' ? connectedLampBridge?.id ?? null : role === 'lamp_local_bridge' ? node.id : null),
      lastSeen: node.lastSeen ?? node.probeStatus?.updatedAt ?? null,
      updatedAt: now,
    };
  });
};

export const getPreferredArcAppLink = (registry: ArcDeviceRegistryEntry[]) => {
  const connectedGateway = registry.find((entry) => entry.appFacingRole === 'gateway_app_cloud_link' && entry.connected);
  if (connectedGateway) return connectedGateway;

  const connectedLampBridge = registry.find((entry) => entry.appFacingRole === 'lamp_local_bridge' && entry.connected);
  if (connectedLampBridge) return connectedLampBridge;

  const connectedStandaloneProbe = registry.find((entry) => entry.appFacingRole === 'standalone_probe' && entry.connected);
  if (connectedStandaloneProbe) return connectedStandaloneProbe;

  return registry.find((entry) => entry.appFacing) ?? null;
};

export const arcRoleLabel = (role: ArcAppFacingRole) => {
  switch (role) {
    case 'gateway_app_cloud_link':
      return 'Gateway app/cloud link';
    case 'gateway_sleepy_child':
      return 'Gateway sleepy child';
    case 'lamp_sleepy_child':
      return 'Lamp sleepy child';
    case 'lamp_local_bridge':
      return 'Lamp local bridge';
    case 'standalone_probe':
      return 'Standalone Probe';
    case 'thread_node_only':
      return 'Thread node';
    case 'fallback_service':
      return 'Service fallback';
    default:
      return 'ARC role';
  }
};

export const arcTransportLabel = (transport: ArcTransport) => {
  switch (transport) {
    case 'ble':
      return 'BLE';
    case 'thread_via_lamp':
      return 'Thread via Lamp';
    case 'thread_via_gateway':
      return 'Thread via Gateway';
    case 'cloud_gateway':
      return 'Cloud via Gateway';
    default:
      return 'ARC route';
  }
};
