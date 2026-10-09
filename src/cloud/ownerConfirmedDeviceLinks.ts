import type { MeshNode } from '../mesh/meshTypes';
import type { PortalDeviceSummary } from './portalTypes';
import { canonicalDeviceForNode, type DeviceViewNode } from './deviceView';

/** Local, account-scoped associations made after the owner visually identifies
 * both records. Not cryptographic identity proof or backend source registration.
 * Transport IDs, server grants and history remain unchanged.
 */
export type OwnerConfirmedDeviceLinks = Record<string, string>;

// Only Android-style BLE addresses qualify as local transport endpoints.
const macKey = (value: string | null | undefined): string | null => {
  const compact = (value ?? '').replace(/[:-]/g, '');
  return /^[0-9a-f]{12}$/i.test(compact) ? compact.toUpperCase() : null;
};
export const ownerLinkKey = (node: MeshNode): string =>
  `${node.nodeKind}:${macKey(node.blePeripheralId) ?? 'invalid'}`;

export function ownerLinkTargets(node: MeshNode, inventory: PortalDeviceSummary[], accountUid: string | null): PortalDeviceSummary[] {
  // A legacy Nordic record, stale role-only cache, or an iOS UUID must not
  // acquire a cloud association through this Android-only feature.
  if (!accountUid || !node.provisioned || (node.nodeKind !== 'lamp' && node.nodeKind !== 'probe') ||
      !macKey(node.id) || macKey(node.id) !== macKey(node.blePeripheralId) ||
      node.uuid || node.unicastAddress || node.unicastHex) return [];
  return inventory.filter(device => device.type === node.nodeKind &&
    device.access.isOwner === true && device.owner.uid === accountUid);
}

/** A verified backend source registration overrides a local assertion.
 * Every candidate is rechecked against current owner grants and collisions.
 */
export function applyOwnerConfirmedDeviceLinks(
  nodes: MeshNode[], inventory: PortalDeviceSummary[],
  links: OwnerConfirmedDeviceLinks, accountUid: string | null,
): DeviceViewNode[] {
  const usedTargets = Object.values(links);
  return nodes.map(node => {
    const target = links[ownerLinkKey(node)];
    if (!target || usedTargets.filter(id => id === target).length !== 1 ||
        !ownerLinkTargets(node, inventory, accountUid).some(device => device.id === target)) return node;
    const serverMatches = inventory.filter(device => device.type === node.nodeKind &&
      device.telemetrySourceNodeIds?.some(id => {
        const other = macKey(id);
        return other ? other === macKey(node.blePeripheralId) : id === node.id;
      }));
    if (serverMatches.length > 1 || (serverMatches.length === 1 && serverMatches[0].id !== target)) return node;
    const backend = canonicalDeviceForNode(node, inventory);
    if (backend && backend.id !== target) return node;
    return { ...node, canonicalDeviceId: target };
  });
}

/** A confirmed local association is valid only for this signed-in owner and
 * this fresh backend inventory. A scan, a matching name, or a cached document
 * does not authorize a BLE connection. */
export function validatedOwnerLinkId(
  node: MeshNode, inventory: PortalDeviceSummary[],
  links: OwnerConfirmedDeviceLinks, accountUid: string | null,
): string | null {
  const chosen = links[ownerLinkKey(node)];
  if (!chosen || !ownerLinkTargets(node, inventory, accountUid).some(device => device.id === chosen)) return null;
  const resolved = applyOwnerConfirmedDeviceLinks([node], inventory, links, accountUid)[0];
  return resolved.canonicalDeviceId === chosen ? chosen : null;
}

/** In-memory transport alias for existing history-grant checks; server grants
 * remain authoritative and the backend identity/source map is not changed. */
export function linkedHistoryInventory(
  nodes: MeshNode[], inventory: PortalDeviceSummary[],
  links: OwnerConfirmedDeviceLinks, accountUid: string | null,
): PortalDeviceSummary[] {
  const aliases = new Map<string, string[]>();
  for (const node of nodes) {
    const canonical = validatedOwnerLinkId(node, inventory, links, accountUid);
    if (!canonical) continue;
    const ids = aliases.get(canonical) ?? [];
    ids.push(node.id);
    aliases.set(canonical, ids);
  }
  if (!aliases.size) return inventory;
  return inventory.map(device => {
    const ids = aliases.get(device.id);
    return ids?.length ? {
      ...device,
      telemetrySourceNodeIds: [...new Set([...(device.telemetrySourceNodeIds ?? []), ...ids])],
    } : device;
  });
}
