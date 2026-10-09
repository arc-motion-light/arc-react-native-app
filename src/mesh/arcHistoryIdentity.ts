import type { PortalDeviceSummary } from '../cloud/portalTypes';
import { historyDevice } from '../cloud/historyGateway';

/** Resolve a stored G4 Probe index only from an explicit backend source
 * registration. A phone BLE-MAC -> canonical-ID link is not evidence that a
 * particular historical probe_index belongs to that device. */
export function registeredProbeForHistoryIndex(
  inventory: PortalDeviceSummary[], lampId: string, probeIndex: number,
): PortalDeviceSummary | null {
  if (!Number.isInteger(probeIndex) || probeIndex < 0 || probeIndex > 255) return null;
  const lamp = historyDevice(inventory, lampId, 'lamp');
  const lampSources = new Set([lampId, ...(lamp ? [lamp.id, ...(lamp.telemetrySourceNodeIds ?? [])] : [])]);
  const sourceIds = new Set([...lampSources].map(id => `lamp-history:${id}:probe-${probeIndex}`));
  const matches = inventory.filter(device => device.type === 'probe' &&
    [...sourceIds].some(source => device.id === source || device.telemetrySourceNodeIds?.includes(source)));
  return matches.length === 1 ? matches[0] : null;
}

export type BlockedProbeHistory = {
  accountUid: string;
  probeIndex: number;
  lastHintSeenAt: number;
  probeIntervalMs: number;
  conflictingRegisteredId?: string | null;
  conflictingWitnessedId?: string | null;
};

/** A blocked historical index may be reconsidered only after verified
 * identity/grants become available or a NEW live Probe hint could allow the
 * existing timestamp witness to bind the correct index. No timed replays. */
export function canRetryBlockedProbeHistory(
  block: BlockedProbeHistory,
  options: {
    accountUid: string | null;
    now: number;
    registeredProbeId: string | null;
    registeredHasHistoryGrant: boolean;
    witnessedProbeId: string | null;
    witnessHasHistoryGrant: boolean;
    hintSeenAt: number | null;
    hintHasHistoryGrant: boolean;
  },
): boolean {
  if (!options.accountUid || block.accountUid !== options.accountUid) return false;
  // A conflicting authoritative registration cannot be retried merely because
  // the same conflicting registration remains authorized.
  if (block.conflictingRegisteredId && block.conflictingWitnessedId &&
      block.conflictingRegisteredId === options.registeredProbeId &&
      block.conflictingWitnessedId === options.witnessedProbeId) return false;
  if (options.registeredProbeId && options.registeredHasHistoryGrant) return true;
  if (options.witnessedProbeId && options.witnessHasHistoryGrant) return true;
  return Boolean(options.hintHasHistoryGrant && options.hintSeenAt !== null &&
    options.hintSeenAt > block.lastHintSeenAt &&
    options.now - options.hintSeenAt <= 15_000 &&
    options.hintSeenAt - block.lastHintSeenAt >= block.probeIntervalMs);
}
