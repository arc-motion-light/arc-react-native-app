import { getArcFirebaseAuth } from './arcCloud';
import type {
  ArcUserSummary,
  DeviceGrant,
  DeviceGrantInput,
  DeviceTransfer,
  PortalConnection,
  PortalDeviceDetail,
  PortalDeviceSummary,
  PortalHistorySample,
  PortalMessage,
  PortalPost,
  PortalProjectDetail,
  PortalProjectFile,
  PortalProjectKnowledgeItem,
  PortalProjectSummary,
  PortalTask,
  ProjectDeviceGrantView,
  PortalRoom,
  OwnProfile,
} from './portalTypes';

declare const process: { env?: Record<string, string | undefined> } | undefined;

const DEFAULT_ARC_API_ORIGIN = 'https://remote-gateway-cloud-rrhlh3gwla-ew.a.run.app';

export class PortalApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'PortalApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type PortalRequestOptions = RequestInit & {
  idempotencyKey?: string;
  retryAuth?: boolean;
};

const portalOrigin = () => {
  const configuredOrigin = typeof process !== 'undefined'
    ? process.env?.EXPO_PUBLIC_ARC_API_ORIGIN
    : undefined;
  return (configuredOrigin ?? DEFAULT_ARC_API_ORIGIN).replace(/\/$/, '');
};

const absolutePortalUrl = (path: string) =>
  /^https?:\/\//i.test(path) ? path : `${portalOrigin()}${path.startsWith('/') ? path : `/${path}`}`;

let idempotencyCounter = 0;
export const createPortalIdempotencyKey = () => {
  const cryptoObject = (globalThis as typeof globalThis & { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  idempotencyCounter = (idempotencyCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `arc-${Date.now()}-${idempotencyCounter}`;
};

const parsePayload = async (response: Response): Promise<any> => {
  if (response.status === 204) return {};
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

const portalFetch = async <T>(path: string, options: PortalRequestOptions = {}): Promise<T> => {
  const auth = await getArcFirebaseAuth();
  const user = auth?.currentUser;
  if (!user) throw new PortalApiError('Authentication required', 401, 'AUTH_REQUIRED');

  const { idempotencyKey, retryAuth = true, headers: providedHeaders, ...init } = options;
  const send = async (forceRefresh: boolean) => {
    const token = await user.getIdToken(forceRefresh);
    const headers = new Headers(providedHeaders ?? {});
    headers.set('accept', 'application/json');
    headers.set('authorization', `Bearer ${token}`);
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);
    return fetch(absolutePortalUrl(path), { ...init, headers });
  };

  let response = await send(false);
  if (response.status === 401 && retryAuth) response = await send(true);
  const payload = await parsePayload(response);
  if (!response.ok) {
    throw new PortalApiError(
      String(payload?.error ?? payload?.message ?? `Portal request failed (${response.status})`),
      response.status,
      typeof payload?.code === 'string' ? payload.code : undefined,
      payload
    );
  }
  return payload as T;
};

const encoded = (value: string) => encodeURIComponent(value);

import type { CloudHistoryCoverage } from '../mesh/arcHistorySession';

export const portalClient = {
  historyCoverage: async (lampId: string, framOldest: number, framNewest: number): Promise<CloudHistoryCoverage> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(new Error('History coverage timeout'));
    }, 5000); });
    try {
      const result = await Promise.race([portalFetch<{ ok: true; coverage: CloudHistoryCoverage }>(
        `/api/app/telemetry/history/coverage?lampId=${encodeURIComponent(lampId)}&framOldest=${framOldest}&framNewest=${framNewest}`,
        { signal: controller.signal, retryAuth: false }), timeout]);
      if (result.coverage.lampId !== lampId || result.coverage.streamId !== `lamp:${lampId}:history`) throw new Error('History coverage stream mismatch');
      return result.coverage;
    } finally { clearTimeout(timer!); }
  },
  peopleSearch: (query: string) =>
    portalFetch<{ ok: true; users: ArcUserSummary[] }>(`/api/portal/people/search?q=${encoded(query)}`).then((r) => r.users),
  ownProfile: () =>
    portalFetch<{ ok: true; profile: OwnProfile }>('/api/portal/people/me').then((r) => r.profile),
  updateOwnProfile: (input: { displayName: string; searchableByName: boolean; searchableByEmail: boolean }) =>
    portalFetch<{ ok: true; profile: OwnProfile }>('/api/portal/people/me', { method: 'PUT', body: JSON.stringify(input) }).then((r) => r.profile),
  devices: () =>
    portalFetch<{ ok: true; devices: PortalDeviceSummary[] }>('/api/portal/devices').then((r) => r.devices),
  device: (deviceId: string) =>
    portalFetch<{ ok: true; device: PortalDeviceDetail }>(`/api/portal/devices/${encoded(deviceId)}`).then((r) => r.device),
  recordConfirmedSchedule: (deviceId: string, snapshot: import('./deviceView').ConfirmedScheduleSnapshot) =>
    portalFetch<{ ok: true; snapshot: import('./deviceView').ConfirmedScheduleSnapshot }>(`/api/portal/devices/${encoded(deviceId)}/schedule-observations`, {
      method: 'POST', body: JSON.stringify(snapshot),
    }).then(result => result.snapshot),
  deviceHistory: (deviceId: string, limit = 500) =>
    portalFetch<{ ok: true; history: PortalHistorySample[] }>(
      `/api/portal/devices/${encoded(deviceId)}/history?limit=${Math.max(1, Math.min(limit, 2000))}`
    ).then((r) => r.history),
  claimDevice: (claimCode: string, idempotencyKey = createPortalIdempotencyKey()) =>
    portalFetch<{ ok: true; device: PortalDeviceSummary }>('/api/portal/devices/claim', {
      method: 'POST',
      body: JSON.stringify({ claimCode }),
      idempotencyKey,
    }).then((r) => r.device),
  deviceTransfers: () =>
    portalFetch<{ ok: true; transfers: DeviceTransfer[] }>('/api/portal/devices/transfers').then((r) => r.transfers),
  createDeviceTransfer: (
    deviceId: string,
    recipientUid: string,
    idempotencyKey = createPortalIdempotencyKey()
  ) =>
    portalFetch<{ ok: true; transfer: DeviceTransfer }>(`/api/portal/devices/${encoded(deviceId)}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ recipientUid }),
      idempotencyKey,
    }).then((r) => r.transfer),
  resolveDeviceTransfer: (
    transferId: string,
    action: 'accept' | 'reject' | 'cancel',
    idempotencyKey = createPortalIdempotencyKey()
  ) =>
    portalFetch<{ ok: true; transfer: DeviceTransfer }>(`/api/portal/devices/transfers/${encoded(transferId)}`, {
      method: 'POST',
      body: JSON.stringify({ action }),
      idempotencyKey,
    }).then((r) => r.transfer),

  deviceGrants: (deviceId: string) =>
    portalFetch<{ ok: true; grants: DeviceGrant[] }>(`/api/portal/devices/${encoded(deviceId)}/grants`).then((r) => r.grants),
  createDeviceGrant: (
    deviceId: string,
    input: DeviceGrantInput,
    idempotencyKey = createPortalIdempotencyKey()
  ) =>
    portalFetch<{ ok: true; grant: DeviceGrant }>(`/api/portal/devices/${encoded(deviceId)}/grants`, {
      method: 'POST',
      body: JSON.stringify(input),
      idempotencyKey,
    }).then((r) => r.grant),
  /** PATCH response body is deliberately ignored; refresh the authoritative grant list after mutation. */
  updateDeviceGrant: async (deviceId: string, grantId: string, input: Partial<DeviceGrantInput>) => {
    await portalFetch<unknown>(`/api/portal/devices/${encoded(deviceId)}/grants/${encoded(grantId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  deleteDeviceGrant: async (deviceId: string, grantId: string) => {
    await portalFetch<unknown>(`/api/portal/devices/${encoded(deviceId)}/grants/${encoded(grantId)}`, {
      method: 'DELETE',
    });
  },

  projects: () =>
    portalFetch<{ ok: true; projects: PortalProjectSummary[] }>('/api/portal/projects').then((r) => r.projects),
  project: (projectId: string) =>
    portalFetch<{ ok: true; project: PortalProjectDetail }>(`/api/portal/projects/${encoded(projectId)}`).then((r) => r.project),
  addProjectMember: (projectId: string, uid: string, role: 'member' | 'admin' = 'member') =>
    portalFetch<{ ok: true; project: PortalProjectDetail }>(`/api/portal/projects/${encoded(projectId)}/members`, {
      method: 'POST',
      body: JSON.stringify({ uid, role }),
    }).then((r) => r.project),
  projectDeviceGrants: (projectId: string) =>
    portalFetch<{ ok: true; deviceGrants: ProjectDeviceGrantView[] }>(
      `/api/portal/projects/${encoded(projectId)}/device-grants`
    ).then((r) => r.deviceGrants),
  createProjectDeviceGrant: (
    deviceId: string,
    projectId: string,
    input: Pick<DeviceGrantInput, 'canViewTelemetry' | 'canViewHistory' | 'canTrack' | 'canControl' | 'canEditSettings'>,
    idempotencyKey = createPortalIdempotencyKey()
  ) =>
    portalFetch<{ ok: true; grant: DeviceGrant }>(`/api/portal/devices/${encoded(deviceId)}/grants`, {
      method: 'POST',
      body: JSON.stringify({ projectId, ...input, canShare: false }),
      idempotencyKey,
    }).then((r) => r.grant),

  projectPosts: (projectId: string) =>
    portalFetch<{ ok: true; posts: PortalPost[] }>(`/api/portal/projects/${encoded(projectId)}/posts`).then((r) => r.posts),
  createProjectPost: (
    projectId: string,
    input: { type: string; body: string; attachmentIds?: string[] },
    idempotencyKey = createPortalIdempotencyKey()
  ) =>
    portalFetch<{ ok: true; post: PortalPost }>(`/api/portal/projects/${encoded(projectId)}/posts`, {
      method: 'POST',
      body: JSON.stringify({ ...input, attachmentIds: input.attachmentIds ?? [] }),
      idempotencyKey,
    }).then((r) => r.post),
  projectTasks: (projectId: string) =>
    portalFetch<{ ok: true; tasks: PortalTask[] }>(`/api/portal/projects/${encoded(projectId)}/tasks`).then((r) => r.tasks),
  createProjectTask: (
    projectId: string,
    input: { title: string; description?: string; dueAt?: string; startsAt?: string; endsAt?: string; assigneeUid?: string; relatedDeviceId?: string }
  ) =>
    portalFetch<{ ok: true; task: PortalTask }>(`/api/portal/projects/${encoded(projectId)}/tasks`, {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((r) => r.task),
  updateProjectTask: (projectId: string, taskId: string, action: 'claim' | 'done' | 'reopen') =>
    portalFetch<{ ok: true; task: PortalTask }>(`/api/portal/projects/${encoded(projectId)}/tasks/${encoded(taskId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    }).then((r) => r.task),
  projectFiles: (projectId: string) =>
    portalFetch<{ ok: true; files: PortalProjectFile[] }>(`/api/portal/projects/${encoded(projectId)}/files`).then((r) => r.files),
  projectKnowledge: (projectId: string) =>
    portalFetch<{ ok: true; knowledge: PortalProjectKnowledgeItem[] }>(`/api/portal/projects/${encoded(projectId)}/knowledge`).then((r) => r.knowledge),

  connections: () =>
    portalFetch<{ ok: true; connections: PortalConnection[] }>('/api/portal/connections').then((r) => r.connections),
  connectionRequests: () =>
    portalFetch<{ ok: true; incoming: PortalConnection[]; outgoing: PortalConnection[] }>(
      '/api/portal/connections/requests'
    ),
  requestConnection: (targetUid: string, idempotencyKey = createPortalIdempotencyKey()) =>
    portalFetch<{ ok: true; connection: PortalConnection }>('/api/portal/connections', {
      method: 'POST',
      body: JSON.stringify({ targetUid }),
      idempotencyKey,
    }).then((r) => r.connection),
  updateConnection: (connectionId: string, status: 'accepted' | 'declined' | 'blocked') =>
    portalFetch<{ ok: true; connection: PortalConnection }>(
      `/api/portal/connections/${encoded(connectionId)}`,
      { method: 'PATCH', body: JSON.stringify({ status }) }
    ).then((r) => r.connection),
  deleteConnection: async (connectionId: string) => {
    await portalFetch<unknown>(`/api/portal/connections/${encoded(connectionId)}`, { method: 'DELETE' });
  },

  rooms: () => portalFetch<{ ok: true; rooms: PortalRoom[] }>('/api/portal/rooms').then((r) => r.rooms),
  room: (roomId: string) =>
    portalFetch<{ ok: true; room: PortalRoom }>(`/api/portal/rooms/${encoded(roomId)}`).then((r) => r.room),
  createGroupRoom: (
    title: string,
    memberUids: string[],
    idempotencyKey = createPortalIdempotencyKey()
  ) =>
    portalFetch<{ ok: true; room: PortalRoom }>('/api/portal/rooms', {
      method: 'POST',
      body: JSON.stringify({ type: 'group', title, memberUids }),
      idempotencyKey,
    }).then((r) => r.room),
  messages: (roomId: string) =>
    portalFetch<{ ok: true; messages: PortalMessage[] }>(
      `/api/portal/rooms/${encoded(roomId)}/messages`
    ).then((r) => r.messages),
  sendMessage: (
    roomId: string,
    body: string,
    idempotencyKey = createPortalIdempotencyKey()
  ) =>
    portalFetch<{ ok: true; message: PortalMessage }>(`/api/portal/rooms/${encoded(roomId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
      idempotencyKey,
    }).then((r) => r.message),
};
