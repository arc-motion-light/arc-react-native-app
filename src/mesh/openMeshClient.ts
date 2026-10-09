import {
  decodeOpenMeshErrorFrame,
  encodeOpenMeshHomeScreenControlFrame,
  decodeOpenMeshStatusFrame,
  encodeOpenMeshGetStatusFrame,
  encodeOpenMeshSetLampConfigFrame,
  encodeOpenMeshSetTimeFrame,
  encodeOpenMeshStatusFrame,
  OpenMeshErrorCode,
  OpenMeshHomeScreenControlFrame,
  OpenMeshLampConfig,
  OpenMeshOpcode,
  OpenMeshSetTimeFrame,
  OpenMeshStatusFrame,
  openMeshErrorCodeLabel,
} from './openMeshProtocol';
import { OpenMeshCommandQueue, OPEN_MESH_DEFAULT_MAX_RETRIES, OPEN_MESH_DEFAULT_TIMEOUT_MS } from './openMeshQueue';

export type OpenMeshTransport = {
  send: (params: {
    nodeId: string;
    opcode: number;
    payload: Uint8Array;
    responseExpected?: boolean;
  }) => Promise<void>;
  readStatus: (params: { nodeId: string; opcode: number }) => Promise<Uint8Array | null>;
};

export type OpenMeshClientOptions = {
  commandTimeoutMs?: number;
  maxRetries?: number;
};

const DEFAULT_OPTIONS: Required<OpenMeshClientOptions> = {
  commandTimeoutMs: OPEN_MESH_DEFAULT_TIMEOUT_MS,
  maxRetries: OPEN_MESH_DEFAULT_MAX_RETRIES,
};

const STATUS_BUSY_RETRY_MS = 80;
const STATUS_BUSY_MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const parseErrorPayload = (payload: Uint8Array | null) => {
  if (!payload) return null;
  try {
    return decodeOpenMeshErrorFrame(payload);
  } catch {
    return null;
  }
};

const createProtocolError = (message: string, errorCode?: OpenMeshErrorCode) => {
  const suffix = typeof errorCode === 'number' ? ` (${openMeshErrorCodeLabel(errorCode)})` : '';
  return new Error(`${message}${suffix}`);
};

export const createOpenMeshClient = (transport: OpenMeshTransport, options?: OpenMeshClientOptions) => {
  const queue = new OpenMeshCommandQueue();
  const cfg = { ...DEFAULT_OPTIONS, ...options };

  const sendFrame = async (nodeId: string, frame: Uint8Array, responseExpected = false) => {
    await transport.send({
      nodeId,
      opcode: frame[0] ?? 0,
      payload: frame,
      responseExpected,
    });
  };

  const readStatusWithGuard = async (nodeId: string, opcode: number) => {
    let attempt = 0;
    while (attempt < STATUS_BUSY_MAX_ATTEMPTS) {
      try {
        return await transport.readStatus({ nodeId, opcode });
      } catch (error: any) {
        const message = String(error?.message ?? '').toLowerCase();
        const busy = message.includes('status request already in progress');
        attempt += 1;
        if (!busy || attempt >= STATUS_BUSY_MAX_ATTEMPTS) {
          throw error;
        }
        await sleep(STATUS_BUSY_RETRY_MS);
      }
    }
    return null;
  };

  return {
    queue,
    cancelNode: (nodeId: string) => queue.cancelNode(nodeId),
    cancelAll: () => queue.cancelAll(),
    getStatus: (nodeId: string, configVersion: number) =>
      queue.enqueue<OpenMeshStatusFrame | null>({
        nodeId,
        label: 'GET_STATUS',
        timeoutMs: cfg.commandTimeoutMs,
        maxRetries: cfg.maxRetries,
        run: async () => {
          const request = encodeOpenMeshGetStatusFrame(configVersion);
          await sendFrame(nodeId, request, true);

          const statusPayload = await readStatusWithGuard(nodeId, OpenMeshOpcode.STATUS);
          if (statusPayload) {
            return decodeOpenMeshStatusFrame(statusPayload);
          }

          const errorPayload = await readStatusWithGuard(nodeId, OpenMeshOpcode.ERROR);
          const errorFrame = parseErrorPayload(errorPayload);
          if (errorFrame) {
            throw createProtocolError('GET_STATUS failed', errorFrame.errorCode);
          }
          return null;
        },
      }),
    setStatus: (nodeId: string, status: Omit<OpenMeshStatusFrame, 'opcode'>) =>
      queue.enqueue<void>({
        nodeId,
        label: 'SET_STATUS',
        timeoutMs: cfg.commandTimeoutMs,
        maxRetries: cfg.maxRetries,
        run: async () => {
          const payload = encodeOpenMeshStatusFrame({ ...status, opcode: OpenMeshOpcode.SET_STATUS });
          await sendFrame(nodeId, payload, false);
        },
      }),
    setTime: (nodeId: string, input: Omit<OpenMeshSetTimeFrame, 'opcode'>) =>
      queue.enqueue<void>({
        nodeId,
        label: 'SET_TIME',
        timeoutMs: cfg.commandTimeoutMs,
        maxRetries: cfg.maxRetries,
        run: async () => {
          const payload = encodeOpenMeshSetTimeFrame({ ...input, opcode: OpenMeshOpcode.SET_TIME });
          await sendFrame(nodeId, payload, false);
        },
      }),
    setLampConfigAtomic: (nodeId: string, configVersion: number, config: OpenMeshLampConfig) =>
      queue.enqueue<void>({
        nodeId,
        label: 'SET_LAMP_CONFIG',
        timeoutMs: cfg.commandTimeoutMs,
        maxRetries: cfg.maxRetries,
        run: async () => {
          const payload = encodeOpenMeshSetLampConfigFrame(configVersion, config);
          await sendFrame(nodeId, payload, false);
        },
      }),
    setHomeScreenControl: (nodeId: string, input: Omit<OpenMeshHomeScreenControlFrame, 'opcode'>) =>
      queue.enqueue<void>({
        nodeId,
        label: 'HOMESCREEN_CONTROL',
        timeoutMs: cfg.commandTimeoutMs,
        maxRetries: cfg.maxRetries,
        run: async () => {
          const payload = encodeOpenMeshHomeScreenControlFrame({
            ...input,
            opcode: OpenMeshOpcode.HOMESCREEN_CONTROL,
          });
          await sendFrame(nodeId, payload, false);
        },
      }),
  };
};
