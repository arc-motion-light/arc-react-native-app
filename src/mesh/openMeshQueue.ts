export const OPEN_MESH_DEFAULT_PACING_MS = 60;
export const OPEN_MESH_DEFAULT_TIMEOUT_MS = 1500;
export const OPEN_MESH_DEFAULT_MAX_RETRIES = 2;

export class OpenMeshQueueCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenMeshQueueCancelledError';
  }
}

export type OpenMeshQueueTask<T> = {
  nodeId: string;
  label: string;
  run: (attempt: number) => Promise<T>;
  timeoutMs?: number;
  maxRetries?: number;
  pacingMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

type PendingTask<T> = {
  task: OpenMeshQueueTask<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  cancelled: boolean;
};

type AnyPendingTask = PendingTask<unknown>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  if (timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`OpenMesh queue timeout after ${timeoutMs} ms.`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
};

export class OpenMeshCommandQueue {
  private readonly queuesByNode = new Map<string, AnyPendingTask[]>();
  private readonly runningNodes = new Set<string>();
  private readonly activeTaskByNode = new Map<string, AnyPendingTask>();

  enqueue<T>(task: OpenMeshQueueTask<T>): Promise<T> {
    const nodeId = task.nodeId.trim();
    if (!nodeId) {
      return Promise.reject(new Error('OpenMeshCommandQueue.enqueue: nodeId is required.'));
    }

    return new Promise<T>((resolve, reject) => {
      const pending: PendingTask<T> = {
        task,
        resolve,
        reject,
        cancelled: false,
      };

      const queue = this.queuesByNode.get(nodeId) ?? [];
      queue.push(pending as AnyPendingTask);
      this.queuesByNode.set(nodeId, queue);

      void this.drainNode(nodeId);
    });
  }

  cancelNode(nodeId: string, reason = 'Node queue cancelled.') {
    const key = nodeId.trim();
    if (!key) return;

    const queued = this.queuesByNode.get(key) ?? [];
    queued.forEach((item) => {
      item.cancelled = true;
      item.reject(new OpenMeshQueueCancelledError(reason));
    });
    this.queuesByNode.set(key, []);

    const active = this.activeTaskByNode.get(key);
    if (active) {
      active.cancelled = true;
    }
  }

  cancelAll(reason = 'All OpenMesh queues cancelled.') {
    Array.from(this.queuesByNode.keys()).forEach((nodeId) => this.cancelNode(nodeId, reason));
  }

  getPendingCount(nodeId?: string) {
    if (nodeId) {
      return (this.queuesByNode.get(nodeId.trim()) ?? []).length;
    }

    let count = 0;
    this.queuesByNode.forEach((queue) => {
      count += queue.length;
    });
    return count;
  }

  private async drainNode(nodeId: string) {
    if (this.runningNodes.has(nodeId)) {
      return;
    }
    this.runningNodes.add(nodeId);

    try {
      while (true) {
        const queue = this.queuesByNode.get(nodeId) ?? [];
        const item = queue.shift();
        this.queuesByNode.set(nodeId, queue);

        if (!item) {
          break;
        }

        if (item.cancelled) {
          continue;
        }

        this.activeTaskByNode.set(nodeId, item);

        try {
          const value = await this.executeWithRetry(item);
          if (item.cancelled) {
            item.reject(new OpenMeshQueueCancelledError('Task cancelled during execution.'));
          } else {
            item.resolve(value);
          }
        } catch (error) {
          item.reject(error);
        } finally {
          this.activeTaskByNode.delete(nodeId);
        }

        const pacingMs = Math.max(0, item.task.pacingMs ?? OPEN_MESH_DEFAULT_PACING_MS);
        if (pacingMs > 0) {
          await sleep(pacingMs);
        }
      }
    } finally {
      this.runningNodes.delete(nodeId);
      if ((this.queuesByNode.get(nodeId) ?? []).length > 0) {
        void this.drainNode(nodeId);
      }
    }
  }

  private async executeWithRetry<T>(item: PendingTask<T>): Promise<T> {
    const timeoutMs = Math.max(0, item.task.timeoutMs ?? OPEN_MESH_DEFAULT_TIMEOUT_MS);
    const maxRetries = Math.max(0, item.task.maxRetries ?? OPEN_MESH_DEFAULT_MAX_RETRIES);

    let attempt = 0;
    while (attempt <= maxRetries) {
      if (item.cancelled) {
        throw new OpenMeshQueueCancelledError('Task cancelled before execution.');
      }

      try {
        return await withTimeout(item.task.run(attempt), timeoutMs);
      } catch (error) {
        const isLastAttempt = attempt >= maxRetries;
        const shouldRetry = item.task.shouldRetry ? item.task.shouldRetry(error, attempt) : true;
        if (isLastAttempt || !shouldRetry || item.cancelled) {
          throw error;
        }
      }

      attempt += 1;
    }

    throw new Error('OpenMeshCommandQueue: reached unreachable retry state.');
  }
}
