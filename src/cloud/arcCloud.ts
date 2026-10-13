import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as firebaseAuth from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import type { ProbeLogEnvelope } from '../probeDataFormat';
import type { CloudTelemetryBatchResult, CloudTelemetryUploadRecord } from '../localTelemetryStore';
import { isHardwareUploadRecord } from './hardwareHistoryV4';

declare const process: { env?: Record<string, string | undefined> } | undefined;

export type ArcCloudSession = {
  userId: string | null;
  email: string | null;
  emailVerified: boolean;
  orgId: string;
  workspaceLabel: string;
  claimState: 'signed_out' | 'demo_claimed' | 'claimed' | 'unclaimed';
  authProvider: 'firebase_email' | 'demo_local';
  role: 'owner' | 'admin' | 'teacher' | 'parent' | 'child_viewer' | 'signed_out';
  permissions: {
    canViewTelemetry: boolean;
    canEditSettings: boolean;
    canClaimDevices: boolean;
    canManageMembers: boolean;
    canSendCommands: boolean;
  };
};

export type ArcChildAccountDraft = {
  email: string;
  displayName: string;
  relation: 'student' | 'child' | 'family_viewer';
};

export type ArcAccountProfile = {
  displayName: string;
  avatarUrl: string;
  phone: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  country: string;
  billingEmail: string;
  subscriptionStatus: string;
  subscriptionNote: string;
  shopCustomerRef: string;
  paymentNote: string;
};

export type ArcCloudDeviceClaim = {
  gatewayId: string;
  nodeId: string;
  sourcePath: 'gateway_cloud' | 'phone_bridge' | 'lamp_local' | 'demo';
  credentialStatus: 'demo_shared' | 'active' | 'unknown';
};

export type ArcCloudSnapshot = {
  session: ArcCloudSession;
  claim: ArcCloudDeviceClaim;
  records: ProbeLogEnvelope[];
};

export type ArcCloudLampClaimResult = {
  lampId: string;
  claimState: 'claimed';
  alreadyClaimed: boolean;
};

export type ArcCloudClaimedLamp = {
  lampId: string;
  displayName: string | null;
  claimState: 'claimed';
};

// Firebase's web client configuration identifies this public client; it is
// not a server credential. Keep environment overrides for staging/white-label
// builds, but let a normal native build use the same ARC project as the portal.
const firebaseConfig = {
  apiKey: process?.env?.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyD9LRaBmAolnhJvlINSThA7WKefp_dSzvU',
  authDomain: process?.env?.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'arcstore-cloud.firebaseapp.com',
  projectId: process?.env?.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'arcstore-cloud',
  storageBucket: process?.env?.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'arcstore-cloud.firebasestorage.app',
  messagingSenderId: process?.env?.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '619553521366',
  appId: process?.env?.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:619553521366:web:2a36df2faee509f5825377',
};

const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.appId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;

const getReactNativePersistence = (firebaseAuth as unknown as {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => unknown;
}).getReactNativePersistence;

const getFirebaseClients = () => {
  if (!hasFirebaseConfig) return null;
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig);
  if (!auth) {
    if (Platform.OS === 'web') {
      auth = getAuth(app);
    } else {
      if (!getReactNativePersistence) throw new Error('React Native Firebase Auth persistence is unavailable.');
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      } as Parameters<typeof initializeAuth>[1]);
    }
  }
  if (!firestore) firestore = getFirestore(app);
  if (!auth || !firestore) return null;
  return { auth, firestore };
};

export const getArcFirebaseAuth = async (): Promise<Auth | null> => {
  const clients = getFirebaseClients();
  if (!clients) return null;
  if (typeof clients.auth.authStateReady === 'function') await clients.auth.authStateReady();
  return clients.auth;
};

const demoSession = (userId: string | null = null): ArcCloudSession => ({
  userId,
  email: null,
  emailVerified: !hasFirebaseConfig,
  orgId: 'arc-demo-org',
  workspaceLabel: 'ARC Demo Workspace',
  claimState: 'demo_claimed',
  authProvider: hasFirebaseConfig ? 'firebase_email' : 'demo_local',
  role: hasFirebaseConfig ? 'signed_out' : 'owner',
  permissions: hasFirebaseConfig
    ? {
        canViewTelemetry: false,
        canEditSettings: false,
        canClaimDevices: false,
        canManageMembers: false,
        canSendCommands: false,
      }
    : {
        canViewTelemetry: true,
        canEditSettings: true,
        canClaimDevices: true,
        canManageMembers: true,
        canSendCommands: false,
      },
});

export const signedOutArcCloudSession = (): ArcCloudSession => ({
  ...demoSession(),
  claimState: 'signed_out',
  role: 'signed_out',
  permissions: {
    canViewTelemetry: false,
    canEditSettings: false,
    canClaimDevices: false,
    canManageMembers: false,
    canSendCommands: false,
  },
});

const ownerPermissions = {
  canViewTelemetry: true,
  canEditSettings: true,
  canClaimDevices: true,
  canManageMembers: true,
  canSendCommands: false,
};

const childViewerPermissions = {
  canViewTelemetry: true,
  canEditSettings: false,
  canClaimDevices: false,
  canManageMembers: false,
  canSendCommands: false,
};

export const emptyArcAccountProfile: ArcAccountProfile = {
  displayName: '',
  avatarUrl: '',
  phone: '',
  addressLine1: '',
  postalCode: '',
  city: '',
  country: 'DK',
  billingEmail: '',
  subscriptionStatus: 'poc_active',
  subscriptionNote: '',
  shopCustomerRef: '',
  paymentNote: '',
};

const profileFromData = (data: any, user?: User | null): ArcAccountProfile => ({
  displayName: String(data?.display_name ?? user?.displayName ?? emptyArcAccountProfile.displayName),
  avatarUrl: String(data?.avatar_url ?? user?.photoURL ?? emptyArcAccountProfile.avatarUrl),
  phone: String(data?.phone ?? emptyArcAccountProfile.phone),
  addressLine1: String(data?.address?.line1 ?? data?.addressLine1 ?? emptyArcAccountProfile.addressLine1),
  postalCode: String(data?.address?.postal_code ?? data?.postalCode ?? emptyArcAccountProfile.postalCode),
  city: String(data?.address?.city ?? data?.city ?? emptyArcAccountProfile.city),
  country: String(data?.address?.country ?? data?.country ?? emptyArcAccountProfile.country),
  billingEmail: String(data?.billing?.billing_email ?? data?.billingEmail ?? emptyArcAccountProfile.billingEmail),
  subscriptionStatus: String(data?.billing?.subscription_status ?? data?.subscriptionStatus ?? emptyArcAccountProfile.subscriptionStatus),
  subscriptionNote: String(data?.billing?.subscription_note ?? data?.subscriptionNote ?? emptyArcAccountProfile.subscriptionNote),
  shopCustomerRef: String(data?.billing?.shop_customer_ref ?? data?.shopCustomerRef ?? emptyArcAccountProfile.shopCustomerRef),
  paymentNote: String(data?.billing?.payment_note ?? data?.paymentNote ?? emptyArcAccountProfile.paymentNote),
});

const sessionFromUser = async (firestoreClient: Firestore, user: User): Promise<ArcCloudSession> => {
  const memberRef = doc(firestoreClient, 'organizations', 'arc-demo-org', 'members', user.uid);
  const memberDoc = await getDoc(memberRef).catch(() => null);
  const member = memberDoc?.exists() ? memberDoc.data() : null;
  const role = String(member?.role ?? 'owner') as ArcCloudSession['role'];
  const isChild = role === 'child_viewer';

  return {
    userId: user.uid,
    email: user.email ?? null,
    emailVerified: user.emailVerified,
    orgId: String(member?.organization_id ?? 'arc-demo-org'),
    workspaceLabel: String(member?.workspace_label ?? 'ARC Demo Workspace'),
    claimState: user.emailVerified ? 'demo_claimed' : 'unclaimed',
    authProvider: 'firebase_email',
    role,
    permissions: isChild ? childViewerPermissions : ownerPermissions,
  };
};

export const demoClaim: ArcCloudDeviceClaim = {
  gatewayId: 'gw-dev-0001',
  nodeId: 'probe-001',
  sourcePath: 'gateway_cloud',
  credentialStatus: 'demo_shared',
};

const arcCloudSnapshotUrl = 'https://remote-gateway-cloud-rrhlh3gwla-ew.a.run.app/api/dashboard/snapshot';
const arcCloudTelemetryBatchUrl = 'https://remote-gateway-cloud-rrhlh3gwla-ew.a.run.app/api/app/telemetry/batch';
const arcCloudHardwareHistoryBatchUrl = 'https://remote-gateway-cloud-rrhlh3gwla-ew.a.run.app/api/app/telemetry/hardware/batch';
const arcCloudDeviceClaimUrl = 'https://remote-gateway-cloud-rrhlh3gwla-ew.a.run.app/api/app/devices/claim';
const arcCloudDevicesUrl = 'https://remote-gateway-cloud-rrhlh3gwla-ew.a.run.app/api/app/devices';

/** @deprecated Transitional legacy organization inventory. Never use as canonical ownership authority. */
export const loadArcCloudClaimedLamps = async (organizationId: string): Promise<ArcCloudClaimedLamp[]> => {
  const clients = getFirebaseClients();
  const user = clients?.auth.currentUser;
  if (!clients || !user || !user.emailVerified) return [];
  const response = await fetch(`${arcCloudDevicesUrl}?organizationId=${encodeURIComponent(organizationId)}`, {
    headers: { authorization: `Bearer ${await user.getIdToken()}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(body?.error ?? `Could not load claimed Lamps (${response.status})`));
  return Array.isArray(body?.lamps)
    ? body.lamps
      .filter((lamp: unknown) => lamp && typeof lamp === 'object' && typeof (lamp as { lampId?: unknown }).lampId === 'string')
      .map((lamp: { lampId: string; displayName?: unknown }) => ({
        lampId: lamp.lampId,
        displayName: typeof lamp.displayName === 'string' ? lamp.displayName : null,
        claimState: 'claimed' as const,
      }))
    : [];
};

/** @deprecated BLE-presence POC claim. Canonical claims now use /api/portal/devices/claim with claimCode. */
export const claimArcCloudLamp = async (
  organizationId: string,
  input: { lampId: string; displayName: string; blePeripheralId?: string | null }
): Promise<ArcCloudLampClaimResult> => {
  const clients = getFirebaseClients();
  const user = clients?.auth.currentUser;
  if (!clients || !user) throw new Error('Sign in before claiming a Lamp.');
  if (!user.emailVerified) throw new Error('Verify your email before claiming a Lamp.');
  console.log(`[CloudClaim][START] lamp=${input.lampId} organizationId=${organizationId}`);
  const response = await fetch(arcCloudDeviceClaimUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await user.getIdToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      organizationId,
      lampId: input.lampId,
      displayName: input.displayName,
      proof: {
        kind: 'nearby_ble_poc',
        observedAtMs: Date.now(),
        blePeripheralId: input.blePeripheralId ?? undefined,
      },
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = String(body?.error ?? `Lamp claim failed (${response.status})`);
    console.log(`[CloudClaim][ERROR] lamp=${input.lampId} status=${response.status} reason=${reason}`);
    throw new Error(reason);
  }
  const result: ArcCloudLampClaimResult = {
    lampId: String(body?.lampId ?? input.lampId),
    claimState: 'claimed',
    alreadyClaimed: Boolean(body?.alreadyClaimed),
  };
  console.log(`[CloudClaim][OK] lamp=${result.lampId} alreadyClaimed=${result.alreadyClaimed ? 1 : 0}`);
  return result;
};

export const uploadArcCloudTelemetryBatch = async (
  organizationId: string,
  records: CloudTelemetryUploadRecord[]
): Promise<CloudTelemetryBatchResult> => {
  const clients = getFirebaseClients();
  const user = clients?.auth.currentUser;
  if (!clients || !user) {
    console.log('[CloudSync][AUTH] unavailable');
    throw new Error('Sign in before enabling ARC Cloud Sync.');
  }
  if (!user.emailVerified) {
    console.log('[CloudSync][AUTH] email_unverified');
    throw new Error('Verify your email before enabling ARC Cloud Sync.');
  }
  if (!records.length) return { acceptedRecordIds: [], duplicateRecordIds: [] };
  const hardware = isHardwareUploadRecord(records[0]);
  if (records.some(record => isHardwareUploadRecord(record) !== hardware)) {
    throw new Error('Mixed v3/v4 cloud upload batch rejected');
  }
  const endpoint = hardware ? '/api/app/telemetry/hardware/batch' : '/api/app/telemetry/batch';
  const token = await user.getIdToken();
  console.log(`[CloudSync][AUTH] ready organizationId=${organizationId} records=${records.length}`);
  console.log(`[CloudSync][HTTP][START] endpoint=${endpoint} records=${records.length}`);
  const response = await fetch(hardware ? arcCloudHardwareHistoryBatchUrl : arcCloudTelemetryBatchUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ organizationId, records }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = String(body?.error ?? `ARC Cloud upload failed (${response.status})`);
    console.log(`[CloudSync][HTTP][ERROR] status=${response.status} reason=${reason}`);
    throw new Error(reason);
  }
  const result = {
    acceptedRecordIds: Array.isArray(body?.acceptedRecordIds) ? body.acceptedRecordIds.map(String) : [],
    duplicateRecordIds: Array.isArray(body?.duplicateRecordIds) ? body.duplicateRecordIds.map(String) : [],
  };
  console.log(`[CloudSync][HTTP][OK] status=${response.status} accepted=${result.acceptedRecordIds.length} duplicates=${result.duplicateRecordIds.length}`);
  return result;
};

export const subscribeArcCloudSession = (
  onSession: (session: ArcCloudSession) => void,
  onError: (error: Error) => void = () => undefined,
) => {
  let clients: ReturnType<typeof getFirebaseClients>;
  try {
    clients = getFirebaseClients();
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
    return () => undefined;
  }
  if (!clients) {
    onSession(signedOutArcCloudSession());
    return () => undefined;
  }

  let active = true;
  let generation = 0;
  const unsubscribe = onAuthStateChanged(clients.auth, (user: User | null) => {
    const currentGeneration = ++generation;
    const publish = (session: ArcCloudSession) => {
      if (active && currentGeneration === generation) onSession(session);
    };
    if (!user) {
      publish(signedOutArcCloudSession());
      return;
    }
    void sessionFromUser(clients.firestore, user).then(publish).catch(() =>
      publish({
        ...demoSession(user.uid),
        email: user.email ?? null,
        emailVerified: user.emailVerified,
        role: user.emailVerified ? 'owner' : 'signed_out',
        permissions: user.emailVerified ? ownerPermissions : demoSession().permissions,
      })
    );
  }, (error) => {
    ++generation;
    if (active) onError(error);
  });
  return () => {
    active = false;
    ++generation;
    unsubscribe();
  };
};

export const registerArcCloudEmail = async (email: string, password: string) => {
  const clients = getFirebaseClients();
  if (!clients) throw new Error('Firebase is not configured for this build.');
  const credential = await createUserWithEmailAndPassword(clients.auth, email.trim(), password);
  await sendEmailVerification(credential.user);
  return sessionFromUser(clients.firestore, credential.user);
};

export const signInArcCloudEmail = async (email: string, password: string) => {
  const clients = getFirebaseClients();
  if (!clients) throw new Error('Firebase is not configured for this build.');
  const credential = await signInWithEmailAndPassword(clients.auth, email.trim(), password);
  return sessionFromUser(clients.firestore, credential.user);
};

export const resendArcCloudVerification = async () => {
  const clients = getFirebaseClients();
  const user = clients?.auth.currentUser;
  if (!clients || !user) throw new Error('No signed-in user to verify.');
  await sendEmailVerification(user);
};

export const resetArcCloudPassword = async (email: string) => {
  const clients = getFirebaseClients();
  if (!clients) throw new Error('Firebase is not configured for this build.');
  await sendPasswordResetEmail(clients.auth, email.trim());
};

export const signOutArcCloud = async () => {
  const clients = getFirebaseClients();
  if (!clients) return;
  await signOut(clients.auth);
};

export const createArcChildAccountInvite = async (draft: ArcChildAccountDraft) => {
  const clients = getFirebaseClients();
  const user = clients?.auth.currentUser;
  if (!clients || !user) throw new Error('Sign in as an owner, teacher, or parent before creating a child account.');

  return {
    id: `local-invite:${Date.now()}`,
    organizationId: 'arc-demo-org',
    createdByUserId: user.uid,
    email: draft.email.trim(),
    displayName: draft.displayName.trim(),
    relation: draft.relation,
    role: 'child_viewer' as const,
    permissions: childViewerPermissions,
    delivery: 'backend-admin-sdk-required' as const,
  };
};

export const loadArcAccountProfile = async (): Promise<ArcAccountProfile> => {
  const clients = getFirebaseClients();
  const user = clients?.auth.currentUser;
  if (!clients || !user) return emptyArcAccountProfile;
  const profileRef = doc(clients.firestore, 'organizations', 'arc-demo-org', 'profiles', user.uid);
  const profileDoc = await getDoc(profileRef).catch(() => null);
  return profileFromData(profileDoc?.exists() ? profileDoc.data() : null, user);
};

export const saveArcAccountProfile = async (profile: ArcAccountProfile) => {
  const clients = getFirebaseClients();
  const user = clients?.auth.currentUser;
  if (!clients || !user) throw new Error('Sign in before saving account profile.');

  await updateProfile(user, {
    displayName: profile.displayName.trim() || null,
    photoURL: profile.avatarUrl.trim() || null,
  });

  const profileRef = doc(clients.firestore, 'organizations', 'arc-demo-org', 'profiles', user.uid);
  await setDoc(
    profileRef,
    {
      user_id: user.uid,
      email: user.email ?? null,
      display_name: profile.displayName.trim(),
      avatar_url: profile.avatarUrl.trim(),
      phone: profile.phone.trim(),
      address: {
        line1: profile.addressLine1.trim(),
        postal_code: profile.postalCode.trim(),
        city: profile.city.trim(),
        country: profile.country.trim(),
      },
      billing: {
        billing_email: profile.billingEmail.trim(),
        subscription_status: profile.subscriptionStatus.trim(),
        subscription_note: profile.subscriptionNote.trim(),
        shop_customer_ref: profile.shopCustomerRef.trim(),
        payment_note: profile.paymentNote.trim(),
      },
      updated_at_ms: Date.now(),
    },
    { merge: true }
  );
};

const toNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const toHpa = (value: unknown) => {
  const numberValue = toNumber(value);
  if (numberValue === null) return null;
  return numberValue > 2000 ? numberValue / 100 : numberValue;
};
const toTimestampMs = (value: unknown) => {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return Date.now();
};

const mapFirestoreTelemetryRecord = (nodeId: string, raw: any): ProbeLogEnvelope => {
  const payload = raw?.payload ?? raw?.latest_payload ?? raw?.latestPayload ?? raw;
  const metrics = payload?.metrics ?? raw?.metrics ?? {};
  const state = payload?.state ?? raw?.state ?? {};
  const receivedAtMs = toTimestampMs(
    raw?.received_at ?? raw?.receivedAt ?? raw?.last_seen_at ?? raw?.lastSeenAt ?? raw?.updatedAt ?? payload?.sent_at
  );

  return {
    schemaVersion: 1,
    recordId: String(raw?.id ?? `${nodeId}:${receivedAtMs}`),
    probeId: String(payload?.node_id ?? raw?.node_id ?? raw?.nodeId ?? nodeId),
    source: state?.source ?? raw?.source ?? 'cloud-firestore',
    timeline: {
      receivedAtMs,
      deviceTimestampMs: null,
    },
    telemetry: {
      batteryPct: toNumber(metrics.battery_percent),
      charging: null,
      chargeState: null,
      pmicStatusRaw: null,
      pmicFaultRaw: null,
      bme690TemperatureC: toNumber(metrics.bme690_temp_c),
      bme690HumidityPct: toNumber(metrics.bme690_humidity_rh),
      bme690PressureHpa: toNumber(metrics.bme690_pressure_hpa) ?? toHpa(metrics.bme690_pressure_pa),
      bme690GasOhms: toNumber(metrics.bme690_gas_ohms),
      sht45TemperatureC: toNumber(metrics.sht45_temp_c),
      sht45HumidityPct: toNumber(metrics.sht45_humidity_rh),
      earthTemperatureC: toNumber(metrics.soil_temp_c),
      earthTemperatureRaw: toNumber(metrics.soil_temp_raw) ?? toNumber(metrics.soil_thermistor_raw),
      mcuTemperatureC: toNumber(metrics.mcu_temp_c),
      tscDepth0Raw: toNumber(metrics.soil_tsc_depth0_raw),
      tscDepth1Raw: toNumber(metrics.soil_tsc_depth1_raw),
      tscDepth2Raw: toNumber(metrics.soil_tsc_depth2_raw),
      tscDepth0Delta: toNumber(metrics.soil_tsc_depth0_delta),
      tscDepth1Delta: toNumber(metrics.soil_tsc_depth1_delta),
      tscDepth2Delta: toNumber(metrics.soil_tsc_depth2_delta),
      lightLux: toNumber(metrics.light_lux),
      lightIntensityRaw: toNumber(metrics.light_intensity_raw),
      lightRedRaw: toNumber(metrics.light_red_raw),
      lightGreenRaw: toNumber(metrics.light_green_raw),
      lightBlueRaw: toNumber(metrics.light_blue_raw),
      bme690GasDiagRaw: toNumber(metrics.bme690_gas_diag_raw),
      apds9253SampleStatusRaw: toNumber(metrics.apds9253_sample_status_raw),
      linkRssiDbm: toNumber(metrics.link_rssi_dbm),
    },
    raw: {
      snapshot: {
        updatedAt: receivedAtMs,
        source: state?.source ?? payload?.source ?? 'cloud-firestore',
      } as any,
    },
    sync: {
      mode: 'cloud_later',
      state: 'synced',
      provider: 'firebase_candidate',
    },
  };
};

const loadArcCloudSnapshotTelemetry = async (
  session: ArcCloudSession,
  gatewayId: string,
  nodeId: string
): Promise<ArcCloudSnapshot | null> => {
  const response = await fetch(arcCloudSnapshotUrl);
  if (!response.ok) return null;
  const snapshot = await response.json();
  const gateway = (snapshot?.gateways ?? []).find((item: any) => item?.id === gatewayId || item?.gatewayId === gatewayId);
  const node = (gateway?.nodes ?? []).find((item: any) => item?.id === nodeId || item?.nodeId === nodeId);
  if (!gateway || !node) return null;

  const seriesRecords = (snapshot?.telemetrySeries ?? [])
    .filter((point: any) => (point?.gatewayId ?? gatewayId) === gatewayId && (point?.nodeId ?? nodeId) === nodeId)
    .map((point: any) =>
      mapFirestoreTelemetryRecord(nodeId, {
        id: `${nodeId}:${point.receivedAt}`,
        received_at: point.receivedAt,
        payload: {
          metrics: point.metrics,
          state: { source: 'cloud-run-snapshot' },
        },
      })
    );
  const latestRecord = node?.latestPayload
    ? [mapFirestoreTelemetryRecord(nodeId, { id: `${nodeId}:latest`, received_at: node.lastSeenAt, payload: node.latestPayload })]
    : [];
  const records = [...seriesRecords, ...latestRecord].sort((a, b) => a.timeline.receivedAtMs - b.timeline.receivedAtMs);

  return {
    session,
    claim: {
      gatewayId,
      nodeId,
      sourcePath: 'gateway_cloud',
      credentialStatus: 'active',
    },
    records,
  };
};

/** @deprecated Fixed gateway/node cloud path retained only for legacy compatibility. Use Portal device history for canonical devices. */
export const loadArcCloudProbeTelemetry = async (
  gatewayId = demoClaim.gatewayId,
  nodeId = demoClaim.nodeId
): Promise<ArcCloudSnapshot> => {
  const clients = getFirebaseClients();
  const currentUser = clients?.auth.currentUser ?? null;
  const session = currentUser ? await sessionFromUser(clients!.firestore, currentUser) : demoSession(null);
  if (!clients) {
    return { session, claim: demoClaim, records: [] };
  }

  if (!currentUser || !session.emailVerified || !session.permissions.canViewTelemetry) {
    return { session, claim: demoClaim, records: [] };
  }

  const claimRef = doc(clients.firestore, 'organizations', session.orgId, 'devices', gatewayId);
  const claimDoc = await getDoc(claimRef).catch(() => null);
  const claim: ArcCloudDeviceClaim = claimDoc?.exists()
    ? {
        gatewayId,
        nodeId,
        sourcePath: String(claimDoc.data()?.source_path ?? 'gateway_cloud') as ArcCloudDeviceClaim['sourcePath'],
        credentialStatus: String(claimDoc.data()?.credential_status ?? 'active') as ArcCloudDeviceClaim['credentialStatus'],
      }
    : demoClaim;

  const snapshotTelemetry = await loadArcCloudSnapshotTelemetry(session, gatewayId, nodeId).catch(() => null);
  if (snapshotTelemetry?.records.length) {
    return { ...snapshotTelemetry, claim };
  }

  const telemetryRef = collection(clients.firestore, 'gateways', gatewayId, 'nodes', nodeId, 'telemetry');
  const telemetryQuery = query(telemetryRef, orderBy('received_at', 'desc'), limit(240));
  const docs = await getDocs(telemetryQuery).catch(() => null);
  if (!docs) {
    return { session, claim, records: [] };
  }
  const records = docs.docs
    .map((snapshot) => mapFirestoreTelemetryRecord(nodeId, { id: snapshot.id, ...snapshot.data() }))
    .sort((a, b) => a.timeline.receivedAtMs - b.timeline.receivedAtMs);

  if (!records.length) {
    const snapshotFallback = await loadArcCloudSnapshotTelemetry(session, gatewayId, nodeId).catch(() => null);
    if (snapshotFallback) return snapshotFallback;
  }

  return { session, claim, records };
};

export const arcCloudFirebaseConfigured = hasFirebaseConfig;
