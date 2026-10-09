import type { ArcHistoryRecord, ArcHistoryStatus } from '../mesh/arcHistoryProtocol';

export const DEBUG_HISTORY_MAX_RECORDS = 4096;
export const DEBUG_HISTORY_BATCH_LIMIT = 32;
export type DebugMailboxState = 'idle' | 'starting' | 'dumping' | 'cancelling' | 'complete' | 'error';
export type DebugRecord = { runId?: number; record: ArcHistoryRecord; receivedMs: number; crc: 'OK'; invalidFields: string[] };
export type DebugGap = {
  expected: number; actual: number; size: number; previousTimestamp: number | null;
  nextTimestamp: number | null; previousType: string | null; nextType: string;
  classification: 'MAILBOX_SEQUENCE_GAP_SOURCE_UNCONFIRMED'; receivedRecord: ArcHistoryRecord;
};
export type DebugPass = {
  index: number; from: number; through: number; requestedMs: number;
  firstMs: number | null; lastMs: number | null; doneMs: number | null; nextRequestMs: number | null;
};
export type DebugSourceCheck = {
  sequence: number;
  outcome: 'checking' | 'source_present_mailbox_missed' | 'source_skipped_sequence' | 'outside_current_fram_window' | 'unconfirmed';
  currentOldest?: number; currentHead?: number; returnedSequence?: number;
  record?: DebugRecord; detail?: string;
};
export type DebugMailboxSnapshot = {
  debugRunId: number; stage: string; discardedAfterCancel: number;
  state: DebugMailboxState; busy: boolean; lampId: string | null; records: readonly DebugRecord[];
  oldest: number | null; frozenHead: number | null; expected: number; received: number;
  elapsedMs: number; firstRecordMs: number | null; streamRate: number; averageRate: number;
  batches: number; interBatchGapLastMs: number; interBatchGapMaxMs: number; interBatchGapTotalMs: number;
  duplicates: number; outOfOrder: number; sequenceGaps: number; timestampGaps: number; invalidFields: number;
  sourceCheck: DebugSourceCheck | null;
  gaps: readonly DebugGap[]; passes: readonly DebugPass[]; error: string | null;
};
export type DebugHistoryDependencies = {
  sessionState: (lampId: string) => Promise<string>;
  acquire: (lampId: string, signal: AbortSignal) => Promise<void>;
  release: (lampId: string) => void;
  requestStatus: (lampId: string) => Promise<void>;
  requestBatch: (lampId: string, after: number, head: number, limit: number) => Promise<void>;
  requestAfter: (lampId: string, after: number) => Promise<void>;
  log: (message: string, lampId: string) => void;
  now?: () => number;
  inactivityMs?: number;
};
export const debugRecordFields = (record: ArcHistoryRecord): Record<string, unknown> => {
  const { sequence: _sequence, schemaVersion: _schema, recordType: _type,
    timestampValid: _valid, unixTimeSeconds: _time, ...fields } = record;
  return fields;
};
const plottedFields = (record: ArcHistoryRecord): string[] => record.recordType === 'probe_environment'
  ? ['batteryPct', 'ambientTemperatureC', 'ambientHumidityPct', 'pressureHpa', 'gasOhms', 'soilTemperatureC',
      'soilDepth0Raw', 'soilDepth1Raw', 'soilDepth2Raw', 'lightIntensityRaw']
  : ['coreTemperatureC', 'boardTemperatureC', 'mcuTemperatureC', 'currentMa', 'powerWatts', 'fan1Rpm', 'fan2Rpm'];
export const invalidDebugFields = (record: ArcHistoryRecord): string[] => {
  const fields = record as unknown as Record<string, unknown>;
  return plottedFields(record).filter(key => typeof fields[key] !== 'number' || !Number.isFinite(fields[key]));
};

/** Disposable copies only. Its dependency interface deliberately has no durable/cloud/ACK API. */
export class DebugHistoryMailbox {
  private readonly now: () => number;
  private listeners = new Set<(snapshot: DebugMailboxSnapshot) => void>();
  private generation = 0;
  private discardedAfterCancel = 0;
  private acquired = false;
  private acquisition: AbortController | null = null;
  private phase: 'none' | 'acquiring' | 'status' | 'batch' | 'between' | 'fence_status' | 'fence' | 'probe_status' | 'probe_record' = 'none';
  private state: DebugMailboxState = 'idle';
  private lampId: string | null = null;
  private rows: DebugRecord[] = [];
  private cachedRows: readonly DebugRecord[] = [];
  private rowsChanged = false;
  private status: ArcHistoryStatus | null = null;
  private startedMs: number | null = null;
  private firstMs: number | null = null;
  private lastMs: number | null = null;
  private finishedMs: number | null = null;
  private after = 0;
  private passes: DebugPass[] = [];
  private gaps: DebugGap[] = [];
  private sequences = new Set<number>();
  private timestamps = new Map<string, number>();
  private counters = { duplicates: 0, outOfOrder: 0, sequenceGaps: 0, timestampGaps: 0, invalidFields: 0 };
  private error: string | null = null;
  private sourceCheck: DebugSourceCheck | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private refresh: ReturnType<typeof setTimeout> | null = null;
  private continuation: ReturnType<typeof setTimeout> | null = null;
  private progressLoggedMs = 0;
  private fenceAttempts = 0;
  private fenceAfter: number | null = null;
  private gapLast = 0; private gapMax = 0; private gapTotal = 0;
  constructor(private readonly dependencies: DebugHistoryDependencies) {
    this.now = dependencies.now ?? (() => performance.now());
  }
  get busy() { return this.phase !== 'none'; }
  get debugRunId() { return this.generation; }
  owns(lampId: string) { return this.acquired && this.lampId === lampId; }
  snapshot(): DebugMailboxSnapshot {
    if (this.rowsChanged) { this.cachedRows = this.rows.slice(); this.rowsChanged = false; }
    const elapsedMs = this.startedMs === null ? 0 : Math.max(0, (this.finishedMs ?? this.now()) - this.startedMs);
    // Flow time sums per-pass first->last intervals, excluding startup and pass transitions.
    const flowMs = this.passes.reduce((total, pass) => total + (pass.firstMs === null || pass.lastMs === null ? 0 : pass.lastMs - pass.firstMs), 0);
    const flowRecords = this.passes.reduce((total, pass) =>
      total + Math.max(0, Math.min(this.after, pass.through) - pass.from), 0);
    return {
      debugRunId: this.generation, stage: this.phase, discardedAfterCancel: this.discardedAfterCancel,
      state: this.state, busy: this.busy, lampId: this.lampId, records: this.cachedRows,
      oldest: this.status?.oldestSequence ?? null, frozenHead: this.status?.newestSequence ?? null,
      expected: this.status?.count ?? 0, received: this.rows.length, elapsedMs,
      firstRecordMs: this.startedMs !== null && this.firstMs !== null ? this.firstMs - this.startedMs : null,
      streamRate: flowMs >= 1 ? flowRecords * 1000 / flowMs : 0,
      averageRate: elapsedMs > 0 ? this.rows.length * 1000 / elapsedMs : 0,
      batches: this.passes.length, interBatchGapLastMs: this.gapLast, interBatchGapMaxMs: this.gapMax,
      interBatchGapTotalMs: this.gapTotal, ...this.counters, sourceCheck: this.sourceCheck ? { ...this.sourceCheck } : null, gaps: this.gaps.slice(), passes: this.passes.map(pass => ({ ...pass })), error: this.error,
    };
  }
  subscribe(listener: (snapshot: DebugMailboxSnapshot) => void) {
    this.listeners.add(listener); listener(this.snapshot());
    return () => { this.listeners.delete(listener); };
  }
  private emit(immediate = false) {
    if (immediate) {
      if (this.refresh) clearTimeout(this.refresh); this.refresh = null;
      const snapshot = this.snapshot(); this.listeners.forEach(listener => listener(snapshot)); return;
    }
    if (!this.refresh) this.refresh = setTimeout(() => { this.refresh = null; this.emit(true); }, 120);
  }
  private log(event: string, fields = '') { if (this.lampId) this.dependencies.log(`[DebugHistory][${event}] runId=${this.generation} ${fields}`.trim(), this.lampId); }
  private clearTimers() {
    if (this.watchdog) clearTimeout(this.watchdog); this.watchdog = null;
    if (this.continuation) clearTimeout(this.continuation); this.continuation = null;
  }
  private armTimeout() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      if (this.phase === 'fence' || this.phase === 'fence_status') {
        if (this.fenceAttempts < 2) void this.requestFence();
        else { this.error = 'Transport stop was not confirmed. Reconnect the Lamp before another dump.'; this.state = 'error'; this.emit(true); }
      } else if (this.phase === 'probe_status' || this.phase === 'probe_record') {
        if (this.sourceCheck) this.sourceCheck = { ...this.sourceCheck, outcome: 'unconfirmed', detail: 'Source verification timed out.' };
        void this.requestFence();
      } else this.fail(`inactivity_timeout expectedSeq=${this.after + 1}`);
    }, this.dependencies.inactivityMs ?? 8000);
  }
  private resetData() {
    this.rows = []; this.cachedRows = []; this.rowsChanged = false; this.status = null;
    this.startedMs = this.firstMs = this.lastMs = this.finishedMs = null;
    this.after = 0; this.passes = []; this.gaps = []; this.sequences.clear(); this.timestamps.clear();
    this.counters = { duplicates: 0, outOfOrder: 0, sequenceGaps: 0, timestampGaps: 0, invalidFields: 0 };
    this.gapLast = this.gapMax = this.gapTotal = 0; this.error = null; this.sourceCheck = null; this.progressLoggedMs = 0;
  }
  async start(lampId: string) {
    if (this.busy) throw new Error('Wait for the current history operation to stop safely.');
    this.resetData(); this.fenceAfter = null; this.lampId = lampId; this.state = 'starting'; this.phase = 'acquiring';
    const generation = ++this.generation; this.discardedAfterCancel = 0; this.acquisition = new AbortController(); this.emit(true);
    try {
      if (await this.dependencies.sessionState(lampId) !== 'SESSION_READY') throw new Error('Lamp session is not ready. Reconnect and enable Loader TX notifications.');
      if (generation !== this.generation) return;
      await this.dependencies.acquire(lampId, this.acquisition.signal);
      this.acquired = true;
      if (generation !== this.generation) { this.release(); return; }
      this.state = 'starting'; this.phase = 'status'; this.log('STATUS_REQUEST'); this.armTimeout(); this.emit(true);
      await this.dependencies.requestStatus(lampId);
    } catch (error) { if (generation === this.generation) this.fail(error instanceof Error ? error.message : String(error)); }
  }
  onStatus(lampId: string, status: ArcHistoryStatus, debugRunId: number) {
    if (debugRunId !== this.generation || !this.owns(lampId)) return;
    if (this.phase === 'fence_status') {
      this.fenceAfter = (status.newestSequence + 0x100000) >>> 0;
      this.phase = 'fence'; this.armTimeout();
      void this.dependencies.requestAfter(lampId, this.fenceAfter).catch(error => {
        this.error = `Could not stop transport: ${String(error)}. Reconnect Lamp.`; this.state = 'error'; this.emit(true);
      });
      return;
    }
    if (this.phase === 'probe_status' && this.sourceCheck) {
      const sequence = this.sourceCheck.sequence;
      this.sourceCheck = { ...this.sourceCheck, currentOldest: status.oldestSequence, currentHead: status.newestSequence };
      this.fenceAfter = (status.newestSequence + 0x100000) >>> 0;
      if (!status.ready || !status.count || sequence < status.oldestSequence || sequence > status.newestSequence) {
        this.sourceCheck = { ...this.sourceCheck, outcome: 'outside_current_fram_window', detail: 'The source window changed; absence in the old dump cannot be attributed to transport.' };
        void this.requestFence(); return;
      }
      this.phase = 'probe_record'; this.armTimeout();
      void this.dependencies.requestAfter(lampId, sequence - 1).catch(error => {
        this.sourceCheck = { ...this.sourceCheck!, outcome: 'unconfirmed', detail: String(error) }; void this.requestFence();
      });
      return;
    }
    if (this.phase !== 'status') return;
    this.status = Object.freeze({ ...status });
    if (!status.ready || status.recordBytes !== 32 || ![1, 2].includes(status.recordVersion) ||
        !Number.isInteger(status.count) || status.count < 0 || status.count > status.capacity || status.count > DEBUG_HISTORY_MAX_RECORDS ||
        (status.count > 0 && (status.oldestSequence < 0 || status.newestSequence < status.oldestSequence ||
          status.newestSequence - status.oldestSequence + 1 !== status.count))) {
      this.fail('invalid_or_noncontiguous_fram_snapshot'); return;
    }
    this.status = Object.freeze({ ...status }); this.after = status.count ? status.oldestSequence - 1 : 0;
    this.log('STATUS', `count=${status.count} oldest=${status.oldestSequence} head=${status.newestSequence}`);
    if (!status.count) { this.state = 'complete'; this.log('COMPLETE', 'records=0 expected=0 batches=0'); this.release(); return; }
    this.state = 'dumping'; this.log('START', `oldest=${status.oldestSequence} head=${status.newestSequence} expected=${status.count}`);
    void this.nextPass();
  }
  private async nextPass() {
    if (!this.status || !this.lampId || !this.acquired) return;
    const generation = this.generation;
    const now = this.now(); const previous = this.passes.at(-1);
    if (previous?.doneMs !== null && previous?.doneMs !== undefined) {
      previous.nextRequestMs = now; this.gapLast = Math.max(0, now - previous.doneMs);
      this.gapMax = Math.max(this.gapMax, this.gapLast); this.gapTotal += this.gapLast;
    }
    const through = Math.min(this.status.newestSequence, this.after + DEBUG_HISTORY_BATCH_LIMIT);
    const pass: DebugPass = { index: this.passes.length + 1, from: this.after + 1, through, requestedMs: now, firstMs: null, lastMs: null, doneMs: null, nextRequestMs: null };
    this.passes.push(pass); this.startedMs ??= now; this.phase = 'batch'; this.armTimeout();
    this.log('BATCH', `index=${pass.index} after=${this.after} through=${through} head=${this.status.newestSequence} limit=32`); this.emit(true);
    try { await this.dependencies.requestBatch(this.lampId, this.after, this.status.newestSequence, DEBUG_HISTORY_BATCH_LIMIT); }
    catch (error) { if (generation === this.generation && this.state === 'dumping') this.fail(error instanceof Error ? error.message : String(error)); }
  }
  onRecord(lampId: string, record: ArcHistoryRecord | null, debugRunId: number) {
    // A frame captures its debug generation at ingress. Never reinterpret its
    // remaining records as a different run or as production after Clear.
    if (debugRunId !== this.generation) { this.discardedAfterCancel++; return; }
    if (!this.owns(lampId)) return;
    if (this.phase === 'fence_status' || (this.phase === 'fence' && record !== null)) this.discardedAfterCancel++;
    if (this.phase === 'fence') { if (record === null) this.release(); return; }
    if (this.phase === 'probe_record' && this.sourceCheck) {
      if (record && record.sequence < this.sourceCheck.sequence) return;
      const outcome = !record ? 'unconfirmed' : record.sequence === this.sourceCheck.sequence ? 'source_present_mailbox_missed' : 'source_skipped_sequence';
      this.sourceCheck = { ...this.sourceCheck, outcome, returnedSequence: record?.sequence,
        record: record ? { record: Object.freeze({ ...record }), runId: this.generation, receivedMs: this.now(), crc: 'OK', invalidFields: invalidDebugFields(record) } : undefined,
        detail: !record ? 'Source returned empty despite the current status; indexing/window behavior needs review.' : undefined };
      this.log('SOURCE_CHECK', `sequence=${this.sourceCheck.sequence} outcome=${outcome} returnedSequence=${record?.sequence ?? 'empty'}`);
      void this.requestFence(); return;
    }
    if (this.phase !== 'batch') return; // status/transition replies never enter the mailbox
    if (!record) { this.fail(`unexpected_empty expectedSeq=${this.after + 1}`); return; }
    const pass = this.passes.at(-1)!;
    const expected = this.after + 1;
    if (!Number.isInteger(record.sequence) || record.sequence < 0 || record.sequence > 0xffffffff ||
        ![1, 2].includes(record.schemaVersion) || !['probe_environment', 'lamp_operational'].includes(record.recordType)) {
      this.fail('invalid_decoded_record'); return;
    }
    if (record.sequence > pass.through || record.sequence > this.status!.newestSequence) {
      this.fail(`outside_frozen_batch receivedSeq=${record.sequence}`); return;
    }
    if (this.sequences.has(record.sequence)) { this.counters.duplicates++; this.fail(`duplicate_seq expectedSeq=${expected} receivedSeq=${record.sequence}`); return; }
    if (record.sequence < expected) { this.counters.outOfOrder++; this.fail(`out_of_order expectedSeq=${expected} receivedSeq=${record.sequence}`); return; }
    if (record.sequence !== expected) {
      this.counters.sequenceGaps += record.sequence - expected;
      const previous = this.rows.at(-1)?.record;
      this.gaps.push({ expected, actual: record.sequence, size: record.sequence - expected,
        previousTimestamp: previous?.timestampValid ? previous.unixTimeSeconds : null,
        nextTimestamp: record.timestampValid ? record.unixTimeSeconds : null,
        previousType: previous?.recordType ?? null, nextType: record.recordType,
        classification: 'MAILBOX_SEQUENCE_GAP_SOURCE_UNCONFIRMED', receivedRecord: Object.freeze({ ...record }) });
      this.fail(`sequence_gap expectedSeq=${expected} receivedSeq=${record.sequence} sourcePresence=unconfirmed`); return;
    }
    if (record.sequence > pass.through || record.sequence > this.status!.newestSequence || this.rows.length >= this.status!.count) {
      this.fail(`outside_frozen_batch receivedSeq=${record.sequence}`); return;
    }
    const now = this.now(); this.firstMs ??= now; this.lastMs = now;
    pass.firstMs ??= now; pass.lastMs = now;
    const invalidFields = invalidDebugFields(record); this.counters.invalidFields += invalidFields.length;
    const key = record.recordType === 'probe_environment' ? `${record.recordType}:${record.probeIndex}` : record.recordType;
    const cadence = record.recordType === 'probe_environment' || this.status!.lampFollowsProbe
      ? this.status!.probeIntervalSeconds : this.status!.lampIntervalSeconds;
    if (record.timestampValid) {
      const previous = this.timestamps.get(key);
      if (previous !== undefined && cadence !== null && cadence > 0 && record.unixTimeSeconds - previous > cadence * 2.5) this.counters.timestampGaps++;
      this.timestamps.set(key, record.unixTimeSeconds);
    }
    this.rows.push({ runId: this.generation, record: Object.freeze({ ...record }), receivedMs: now, crc: 'OK', invalidFields });
    this.rowsChanged = true; this.sequences.add(record.sequence); this.after = record.sequence; this.armTimeout(); this.emit();
    if (now - this.progressLoggedMs >= 1000) {
      this.progressLoggedMs = now; this.log('PROGRESS', `received=${this.rows.length} expected=${this.status!.count} elapsedMs=${Math.round(now - this.startedMs!)}`);
    }
    if (record.sequence !== pass.through) return;
    pass.doneMs = now;
    if (record.sequence === this.status!.newestSequence) {
      const continuous = this.rows.length === this.status!.count && this.rows[0]?.record.sequence === this.status!.oldestSequence &&
        this.rows.at(-1)?.record.sequence === this.status!.newestSequence && !this.counters.sequenceGaps && !this.counters.duplicates && !this.counters.outOfOrder;
      if (!continuous) { this.fail('incomplete_frozen_dump'); return; }
      this.finishedMs = now; this.state = 'complete'; const result = this.snapshot();
      this.log('COMPLETE', `records=${result.received} expected=${result.expected} batches=${result.batches} sequenceGaps=0 duplicates=0 outOfOrder=0 timestampGaps=${result.timestampGaps} invalidFields=${result.invalidFields} firstRecordMs=${Math.round(result.firstRecordMs ?? 0)} streamRate=${result.streamRate.toFixed(1)} elapsedMs=${Math.round(result.elapsedMs)} averageRate=${result.averageRate.toFixed(1)} interBatchGapTotalMs=${result.interBatchGapTotalMs.toFixed(1)} interBatchGapMaxMs=${result.interBatchGapMaxMs.toFixed(1)}`);
      void this.requestFence(); return;
    }
    this.phase = 'between'; this.clearTimers();
    // Macrotask boundary exits the packed-notification callback, not a poll interval.
    this.continuation = setTimeout(() => { this.continuation = null; void this.nextPass(); }, 0);
  }
  onError(lampId: string, error: Error, debugRunId: number) { if (debugRunId !== this.generation) return; if (this.owns(lampId) && this.phase !== 'fence' && this.phase !== 'fence_status') this.fail(`decode_or_transport: ${error.message}`); }
  onDisconnect(lampId: string) {
    if (this.lampId !== lampId || !this.busy) return;
    this.finishedMs ??= this.now(); this.state = 'error'; this.error = 'Lamp disconnected; dump incomplete.';
    this.generation++; this.acquisition?.abort(); this.release();
  }
  private fail(reason: string) {
    this.finishedMs ??= this.now(); this.error = reason; this.state = 'error'; this.log('ERROR', `reason=${reason}`);
    if (this.acquired) void this.requestFence();
    else { this.phase = 'none'; this.emit(true); }
  }
  private async requestFence() {
    if (!this.acquired || !this.lampId) { this.release(); return; }
    this.clearTimers(); this.phase = 'fence_status'; this.fenceAttempts++; this.emit(true); this.armTimeout();
    // Existing v1 GET cancels WBA transient batch state. A future read returns
    // EMPTY without writing FRAM or sending an ACK. Wait for that boundary
    // before routing anything back to production. This is not a stored cursor.
    try { await this.dependencies.requestStatus(this.lampId); }
    catch (error) { this.error = `Could not confirm safe stop: ${error instanceof Error ? error.message : String(error)}. Reconnect Lamp.`; this.state = 'error'; this.emit(true); }
  }
  async verifyMissingSequence(sequence: number) {
    if (this.busy || !this.lampId || !Number.isInteger(sequence) || sequence < 0) return;
    const generation = ++this.generation; this.acquisition = new AbortController();
    this.sourceCheck = { sequence, outcome: 'checking' }; this.phase = 'acquiring'; this.emit(true);
    try {
      if (await this.dependencies.sessionState(this.lampId) !== 'SESSION_READY') throw new Error('Lamp session is not ready.');
      if (generation !== this.generation) return;
      await this.dependencies.acquire(this.lampId, this.acquisition.signal); this.acquired = true;
      if (generation !== this.generation) { this.release(); return; }
      this.phase = 'probe_status'; this.armTimeout();
      await this.dependencies.requestStatus(this.lampId);
    } catch (error) {
      if (generation !== this.generation) return;
      this.sourceCheck = { sequence, outcome: 'unconfirmed', detail: String(error) };
      if (this.acquired) void this.requestFence(); else { this.phase = 'none'; this.emit(true); }
    }
  }

  clear() {
    const hadOwnership = this.acquired;
    if (hadOwnership) this.fenceAfter ??= ((this.status?.newestSequence ?? this.after) + 0x100000) >>> 0;
    this.generation++; this.acquisition?.abort(); this.clearTimers();
    this.resetData(); this.state = hadOwnership ? 'cancelling' : 'idle'; this.log('CLEAR'); this.emit(true);
    if (hadOwnership) { this.fenceAttempts = 0; void this.requestFence(); }
    else { this.phase = 'none'; this.emit(true); }
  }
  cancel() {
    if (!this.busy || this.phase === 'fence' || this.phase === 'fence_status') return;
    this.generation++; this.acquisition?.abort(); this.clearTimers();
    this.finishedMs ??= this.now(); this.state = this.acquired ? 'cancelling' : 'error'; this.error = 'Dump cancelled before completion.';
    this.log('CANCEL');
    if (this.acquired) void this.requestFence();
    else { this.phase = 'none'; this.emit(true); }
  }
  private release() {
    this.clearTimers(); this.phase = 'none'; this.fenceAttempts = 0;
    if (this.state === 'cancelling') this.state = this.error ? 'error' : 'idle';
    if (this.acquired && this.lampId) this.dependencies.release(this.lampId);
    this.acquired = false; this.emit(true);
  }
  dispose() { this.acquisition?.abort(); this.clearTimers(); if (this.refresh) clearTimeout(this.refresh); this.listeners.clear(); }
}
