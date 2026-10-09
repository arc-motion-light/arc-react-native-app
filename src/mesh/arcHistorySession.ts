import type { ArcHistoryStatus } from './arcHistoryProtocol';

// Capture ownership at callback ingress, before asynchronous app work can change
// the request. The wire has no request ID: retain validated witness fingerprints
// to recognize late repeats while recovery requests an earlier sequence.
export class HistoryRequestPhase {
  private generation = 0;
  private phase: 'witness' | 'recovery' | null = null;
  private after = 0;
  private witnesses = new Set<string>();

  begin(phase: 'witness' | 'recovery', after: number) {
    this.generation++;
    this.phase = phase;
    this.after = after;
  }
  rememberWitness(record: { sequence: number }) {
    this.witnesses.add(JSON.stringify(record));
  }
  capture(record: { sequence: number } | null) {
    const witnessCandidate = this.phase === 'recovery' &&
      record !== null &&
      this.witnesses.has(JSON.stringify(record));
    return {
      generation: this.generation,
      oldPhase: false,
      witnessCandidate,
      sequence: record?.sequence ?? null,
    };
  }
  owns(callback: ReturnType<HistoryRequestPhase['capture']>) {
    return this.phase !== null &&
      !callback.oldPhase &&
      callback.generation === this.generation &&
      !(callback.witnessCandidate &&
        this.phase === 'recovery' &&
        callback.sequence !== this.after + 1);
  }
  advance(sequence: number) {
    if (this.phase === 'recovery' && sequence === this.after + 1) {
      this.after = sequence;
    }
  }
  stop(preserveWitnesses = false) {
    this.generation++;
    this.phase = null;
    if (!preserveWitnesses) this.witnesses.clear();
  }
}

// Recovery always freezes the STATUS head. Transport may return one record
// per request or a bounded batch; recovery must never chase a moving head.
export function historyRange(status: ArcHistoryStatus, cursor: number) {
  if (!status.ready || !status.count) return null;
  if (cursor > status.newestSequence) throw new Error('history sequence regression; generation/reset requires review');
  if (cursor === status.newestSequence) return null;
  const after = Math.max(cursor, status.oldestSequence - 1);
  return { after, head: status.newestSequence, overwritten: after > cursor };
}
export function acceptHistorySequence(after: number, head: number, sequence: number) {
  if (sequence <= after) return 'duplicate' as const;
  if (sequence > head) return 'beyond_head' as const;
  if (sequence !== after + 1) return 'gap' as const;
  return 'accept' as const;
}

export type HistorySequenceRange = { from: number; through: number };
export type CloudHistoryCoverage = {
  streamId: string; lampId: string; framOldest: number; framNewest: number;
  coveredRanges: HistorySequenceRange[];
  contiguousFromFramOldestThrough: number | null; newestSeen: number | null;
};
export function mergeSequenceRanges(ranges: HistorySequenceRange[]): HistorySequenceRange[] {
  const result: HistorySequenceRange[] = [];
  for (const range of ranges.filter(r => Number.isInteger(r.from) && Number.isInteger(r.through) && r.from >= 0 && r.through >= r.from && r.through <= 0xffffffff).sort((a,b) => a.from-b.from)) {
    const tail = result[result.length-1];
    if (tail && range.from <= tail.through+1) tail.through = Math.max(tail.through, range.through);
    else result.push({ ...range });
  }
  return result;
}
export function planHistoryRecovery(status: ArcHistoryStatus, cursor: number, localRanges: HistorySequenceRange[], cloud?: CloudHistoryCoverage | null, expectedLampId?: string) {
  const validRange = (r: HistorySequenceRange) => Boolean(r && Number.isInteger(r.from) && Number.isInteger(r.through) && r.from >= 0 && r.through >= r.from && r.through <= 0xffffffff);
  const localStateAhead = cursor > status.newestSequence || localRanges.some(r => validRange(r) && r.through > status.newestSequence);
  const localValid = Number.isInteger(cursor) && cursor >= -1 && cursor <= 0xffffffff && localRanges.every(validRange) && !localStateAhead;
  const safeCursor = localValid ? cursor : -1;
  const base = historyRange(status, safeCursor);
  const identityMatches = Boolean(cloud && expectedLampId && cloud.lampId === expectedLampId && cloud.streamId === `lamp:${expectedLampId}:history`);
  const windowMatches = Boolean(cloud && cloud.framOldest === status.oldestSequence && cloud.framNewest === status.newestSequence);
  // A different phone may already have uploaded records produced after STATUS.
  // This invalidates the captured snapshot; it does not prove a device reset.
  const cloudAhead = Boolean(identityMatches && windowMatches && cloud && Number.isInteger(cloud.newestSeen) && cloud.newestSeen! > status.newestSequence);
  const rangesValid = Boolean(cloud && Array.isArray(cloud.coveredRanges) && cloud.coveredRanges.length <= 4096 && cloud.coveredRanges.every(r =>
    validRange(r) && r.from >= status.oldestSequence && r.through <= status.newestSequence));
  const validCloud = Boolean(localValid && identityMatches && windowMatches && !cloudAhead && rangesValid && cloud &&
    (cloud.newestSeen === null ? cloud.coveredRanges.length === 0 : Number.isInteger(cloud.newestSeen) && cloud.newestSeen >= 0 && cloud.newestSeen <= status.newestSequence && cloud.coveredRanges.every(r => r.through <= cloud.newestSeen!)));
  if (!base) return { missingRanges: [] as HistorySequenceRange[], after: null, head: null, cloudTrusted: false, cloudAhead, localStateAhead, retryFreshStatus: cloudAhead || localStateAhead, overwritten: false };
  const covered = mergeSequenceRanges([
    ...(safeCursor >= status.oldestSequence ? [{ from: status.oldestSequence, through: safeCursor }] : []),
    ...(localValid ? localRanges : []),
    ...(validCloud ? cloud!.coveredRanges : []),
  ]);
  const missingRanges: HistorySequenceRange[] = [];
  let next = status.oldestSequence;
  for (const range of covered) {
    if (range.through < next || range.from > status.newestSequence) continue;
    if (range.from > next) missingRanges.push({ from: next, through: Math.min(range.from-1, status.newestSequence) });
    next = Math.max(next, range.through+1);
  }
  if (next <= status.newestSequence) missingRanges.push({ from: next, through: status.newestSequence });
  return { missingRanges, after: missingRanges[0] ? missingRanges[0].from-1 : null, head: missingRanges[0]?.through ?? null,
    cloudTrusted: validCloud, cloudAhead, localStateAhead, retryFreshStatus: cloudAhead || localStateAhead, overwritten: base.overwritten };
}

export async function resolveHistoryRecovery(status: ArcHistoryStatus, local: { cursor: number; ranges: HistorySequenceRange[] }, cloudEnabled: boolean, loadCoverage: () => Promise<CloudHistoryCoverage>, expectedLampId?: string) {
  let coverage: CloudHistoryCoverage | null = null;
  let coverageError: unknown = null;
  const localPlan = planHistoryRecovery(status, local.cursor, local.ranges);
  if (cloudEnabled && !localPlan.localStateAhead && localPlan.missingRanges.length) {
    try { coverage = await loadCoverage(); } catch (error) { coverageError = error; }
  }
  return { plan: coverage ? planHistoryRecovery(status, local.cursor, local.ranges, coverage, expectedLampId) : localPlan, coverage, coverageError };
}
