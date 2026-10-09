export type HistoryOwner = 'NONE' | 'PRODUCTION' | 'DEBUG_MAILBOX';

/** App-side lease: no wire protocol, firmware ACK or storage side effects. */
export class HistoryTransportOwner {
  owner: HistoryOwner = 'NONE';
  lampId: string | null = null;
  private epoch = 0;
  private productionClosing = false;
  get leaseId() { return this.epoch; }
  private pending: { lampId: string; resolve: () => void; reject: (error: Error) => void; signal: AbortSignal; abort: () => void } | null = null;
  get debugRequested() { return this.pending !== null || this.owner === 'DEBUG_MAILBOX'; }
  tryProduction(lampId: string) {
    if (this.productionClosing || this.debugRequested || (this.owner !== 'NONE' && this.lampId !== lampId)) return false;
    if (this.owner === 'NONE') this.epoch++;
    this.owner = 'PRODUCTION'; this.lampId = lampId; return true;
  }
  closeProduction(lampId: string, leaseId: number) {
    if (this.owner === 'PRODUCTION' && this.lampId === lampId && this.epoch === leaseId) this.productionClosing = true;
  }
  releaseProduction(lampId: string, leaseId = this.epoch) {
    if (leaseId !== this.epoch) return;
    if (this.owner !== 'PRODUCTION' || this.lampId !== lampId) return;
    this.owner = 'NONE'; this.lampId = null; this.productionClosing = false; this.grantPending();
  }
  acquireDebug(lampId: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new Error('Debug acquisition cancelled.'));
    if (this.pending || this.owner === 'DEBUG_MAILBOX') return Promise.reject(new Error('History transport already has a debug owner.'));
    return new Promise((resolve, reject) => {
      const abort = () => {
        if (this.pending?.signal !== signal) return;
        this.pending = null; signal.removeEventListener('abort', abort);
        reject(new Error('Debug acquisition cancelled.'));
      };
      this.pending = { lampId, resolve, reject, signal, abort };
      signal.addEventListener('abort', abort); this.grantPending();
    });
  }
  private grantPending() {
    if (this.owner !== 'NONE' || !this.pending) return;
    const pending = this.pending; this.pending = null;
    pending.signal.removeEventListener('abort', pending.abort);
    this.epoch++; this.owner = 'DEBUG_MAILBOX'; this.lampId = pending.lampId; pending.resolve();
  }
  releaseDebug(lampId: string) {
    if (this.owner !== 'DEBUG_MAILBOX' || this.lampId !== lampId) return;
    this.owner = 'NONE'; this.lampId = null;
  }
  isDebug(lampId: string) { return this.owner === 'DEBUG_MAILBOX' && this.lampId === lampId; }
}
