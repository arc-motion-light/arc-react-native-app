export type ArcUserSummary = {
  uid: string;
  displayName: string;
  avatarUrl?: string;
  secondaryLabel?: string;
};

export type OwnProfile = ArcUserSummary & {
  searchableByName: boolean;
  searchableByEmail: boolean;
};

export type DeviceAccess = {
  isOwner: boolean;
  canViewTelemetry: boolean;
  canViewHistory: boolean;
  canTrack: boolean;
  canControl: boolean;
  canEditSettings: boolean;
  canShare: boolean;
};

export type LatestTelemetrySummary = {
  sampledAt: string;
  receivedAt?: string;
  values: Record<string, number | string | boolean | null>;
};

/**
 * Canonical cloud inventory entry returned by GET /api/portal/devices.
 * Connectivity is intentionally not encoded as ownership or access.
 */
export type PortalDeviceSummary = {
  /** Observational read model; never a source for native configuration writes. */
  confirmedSchedule?: import('./deviceView').ConfirmedScheduleSnapshot;
  /** Exact IDs from the backend's registered canonical telemetry-source mappings. */
  telemetrySourceNodeIds?: string[];
  id: string;
  type: 'lamp' | 'probe' | 'gateway' | 'remote';
  displayName: string;
  owner: ArcUserSummary;
  access: DeviceAccess;
  latestTelemetry?: LatestTelemetrySummary;
  latestSampleAt?: string;
  freshness: 'live' | 'recent' | 'stale' | 'unknown';
  /** Future canonical security metadata. Optional until the backend exposes it. */
  security?: PortalDeviceSecurityMetadata;
};

export type PortalDeviceSecurityMetadata = {
  protocolVersion?: number;
  deviceKeyId?: string;
  devicePublicKey?: string;
  deviceKeyFingerprint?: string;
  trustedIssuerIds?: string[];
};

export type PortalDeviceDetail = PortalDeviceSummary;

export type DeviceGrant = {
  id: string;
  deviceId: string;
  granteeUid?: string;
  grantee?: ArcUserSummary;
  roomId?: string;
  projectId?: string;
  grantedByUid: string;
  canViewTelemetry: boolean;
  canViewHistory: boolean;
  canTrack: boolean;
  canControl: boolean;
  canEditSettings: boolean;
  canShare: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DeviceGrantInput = Pick<
  DeviceGrant,
  'canViewTelemetry' | 'canViewHistory' | 'canTrack' | 'canControl' | 'canEditSettings' | 'canShare'
> & {
  granteeUid?: string;
  roomId?: string;
  projectId?: string;
};


export type PortalProjectSummary = {
  id: string;
  spaceId: string;
  title: string;
  summary: string;
  status: string;
  visibility: string;
  projectType: string;
  updatedAt: string;
  memberCount: number;
  deviceCount: number;
  permissions: string[];
};

export type PortalProjectDetail = PortalProjectSummary & {
  purpose: string;
  participantOrganizationIds: string[];
  tags: string[];
  createdBy: string;
  owner: ArcUserSummary;
  members: Array<{ user: ArcUserSummary; role: 'owner' | 'admin' | 'member' }>;
  createdAt: string;
  linkedDevices: Array<{ id: string; label: string; dashboardUrl: string }>;
};

export type ProjectDeviceGrantView = {
  grant: DeviceGrant;
  device: PortalDeviceSummary;
};

export type PortalPost = {
  id: string;
  projectId: string;
  type: string;
  body: string;
  author: { uid: string; email?: string; displayName?: string };
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  attachmentIds: string[];
};

export type PortalTask = {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  assigneeUid?: string;
  assignee?: ArcUserSummary;
  dueAt?: string;
  startsAt?: string;
  endsAt?: string;
  completedAt?: string;
  relatedDeviceId?: string;
  createdAt: string;
  createdBy: string;
  creator?: ArcUserSummary;
};

export type PortalProjectFile = {
  id: string;
  projectId: string;
  name: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: { uid: string; email?: string; displayName?: string };
};

export type PortalProjectKnowledgeItem = {
  id: string;
  projectId: string;
  title: string;
  kind: string;
  summary: string;
  updatedAt: string;
};

export type DeviceTransfer = {
  id: string;
  deviceId: string;
  fromUid: string;
  toUid: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
};

export type ConnectionStatus = 'pending' | 'accepted' | 'declined' | 'blocked';

export type PortalConnection = {
  id: string;
  userA: ArcUserSummary;
  userB: ArcUserSummary;
  requestedByUid: string;
  status: ConnectionStatus;
  createdAt: string;
  updatedAt: string;
};

export type PortalConnectionRequest = PortalConnection;

export type PortalRoomMember = {
  roomId: string;
  user: ArcUserSummary;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
};

export type PortalRoom = {
  id: string;
  type: 'direct' | 'group';
  title?: string;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
  members: PortalRoomMember[];
  lastSenderUid?: string;
  nextSenderUid?: string;
  canSend: boolean;
  waitingForReply: boolean;
};

export type PortalMessage = {
  id: string;
  roomId: string;
  sender: ArcUserSummary;
  body: string;
  createdAt: string;
};

export type PortalHistorySample = {
  recordId?: string;
  sampledAt: string;
  receivedAt?: string;
  values: Record<string, number | string | boolean | null>;
};
