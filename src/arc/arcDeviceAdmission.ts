import type { MeshNode, MeshNodeKind, MeshScanResult } from '../mesh/meshTypes';

// Discovery names are role hints, never identity or ownership evidence.
export const arcAdvertisementRole = (name?: string | null): MeshNodeKind => {
  const value = String(name ?? '').trim();
  if (/^ARC Lamp(?:\b|_)/i.test(value)) return 'lamp';
  if (/^ARC Probe(?:\b|_)/i.test(value) || value === 'ARC_T') return 'probe';
  if (/^ARC Gateway(?:\b|_)/i.test(value)) return 'gateway';
  if (value === 'ARC_R') return 'remote';
  return 'other';
};

export const isLegacyMeshNode = (node: MeshNode): boolean => Boolean(
  node.uuid || node.unicastAddress || node.unicastHex || /^nRF Mesh(?:\b|_)/i.test(node.name)
);

export const isArcScanCandidate = (scan: MeshScanResult): boolean => Boolean(
  !scan.uuid && (
    (scan.arcLocalRoleAdvertised && arcAdvertisementRole(scan.localName ?? scan.name ?? scan.cachedName) !== 'other') ||
    // Native Android WBA transport has already validated this BLE address in
    // an earlier session. Its name may now be user-customized; do not infer a
    // role from that name or accept an arbitrary/unverified MAC address.
    (scan.arcPreviouslyValidated && scan.blePeripheralId === scan.id &&
      ['lamp', 'probe', 'gateway'].includes(scan.nodeKind ?? ''))
  )
);

// Persisted role/provisioned flags alone are insufficient: old versions mapped
// arbitrary Mesh nodes (including the provisioner itself) to Lamp. Keep those
// records on disk, but exclude them from selectors, reconnects and controls.
export const isCurrentArcLamp = (node: MeshNode): boolean => Boolean(
  node.nodeKind === 'lamp' && !isLegacyMeshNode(node) && node.provisioned &&
  (node.blePeripheralId || node.status)
);
