import { probeRecordedTimestamp, selectRecordedProbePoints } from './src/graph/probeRecordedTime';
import { localFirstHardwareBackend } from './src/security/localFirstHardwareBackend';
import { nativeOfflineAccess } from './src/security/nativeOfflineAccess';
import { HardwareOnboarding, type OnboardingState } from './src/mesh/hardwareOnboarding';
import { HardwareAssociationModal } from './src/ui/HardwareAssociationModal';
import { ArcDeviceQrScanner } from './src/ui/ArcDeviceQrScanner';
import { ArcDeviceQrReview, type ArcQrReviewState } from './src/ui/ArcDeviceQrReview';
import type { ArcPublicDeviceQr } from './src/arc/arcDeviceQr';
import { localNodeColumns, iosLocalNodeGeometry } from './src/ui/localNodeLayout';
import { hardwareHistoryProvenance, hardwareHistoryRecordId } from './src/mesh/iosHardwareHistoryProtocol';
import { buildMonotoneSvgPath } from './src/graph/historyPlotGeometry';
import { HistoryPlot } from './src/graph/HistoryPlot';
import { DebugHistoryMailbox } from './src/debug/debugHistoryMailbox';
import { HistoryTransportOwner } from './src/debug/historyTransportOwner';
import { DebugHistoryMailboxView } from './src/debug/DebugHistoryMailboxView';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
  Image,
} from 'react-native';
import Svg, { Path as SvgPath } from 'react-native-svg';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Clipboard from 'expo-clipboard';
import Reanimated, { cancelAnimation, Easing as ReanimatedEasing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import SunCalc from 'suncalc';
import { createLampBle } from './src/ble';
import { clampNumber } from './src/protocol/valueCodec';
import type { LampBleDevice, LampStatus } from './src/ble/bleTypes';
import {
  arcRoleLabel,
  arcTransportLabel,
  buildArcRegistryFromNodes,
  getPreferredArcAppLink,
} from './src/arc/arcRoles';
import { arcAdvertisementRole, isArcScanCandidate, isCurrentArcLamp, isLegacyMeshNode } from './src/arc/arcDeviceAdmission';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ArcDeviceRegistryEntry } from './src/arc/arcRoles';
import { loadArcDeviceRegistry, saveArcDeviceRegistry } from './src/arc/arcRegistryStorage';
import { createMeshComms } from './src/mesh';
import { LAMP_TELEMETRY_INTERVALS, type LampCadenceReply } from './src/mesh/lampCadenceProtocol';
import { arcHistoryRecordToProbeStatus } from './src/mesh/iosHardwareHistoryProtocol';
import type { ArcProbeHistoryRecord } from './src/mesh/iosHardwareHistoryProtocol';
import { loadArcHistoryDurability, saveArcHistoryCursor, setArcHistoryGeneration } from './src/mesh/arcHistoryCursor';
import type { ArcGatewayDebugStatus, ArcProbeGatewayChildConfirmation, HistoryIngressContext } from './src/mesh';
import type {
  MeshNode,
  MeshNodeKind,
  MeshScanResult,
  ProbeSensorStatus,
} from './src/mesh/meshTypes';
import { loadMeshNodes, saveMeshNodes } from './src/mesh/meshStorage';
import { resolveHardwareBinding, associateHardwareBinding, hardwareUid, type HardwareBinding, type HardwareIdentityEvent } from './src/mesh/hardwareIdentity';
import { loadSelectedLampId, saveSelectedLampId } from './src/lamp/lampSelectionStorage';
import { clampLampIntensity } from './src/lamp/lampLimits';
import {
  DEFAULT_PROBE_LOGGING_SETTINGS,
  appendProbeLogRecord,
  getProbeLoggingStats,
  loadProbeLoggingSettings,
  loadRecentProbeLogRecords,
  saveProbeLoggingSettings,
} from './src/probeLogger';
import type { ProbeLoggingSettings, ProbeLoggingStats } from './src/probeLogger';
import type { ProbeLogEnvelope } from './src/probeDataFormat';
import {
  appendLampOperationalRecord,
  appendRecoveredLampOperationalRecord,
  loadRecentLampOperationalRecords,
} from './src/lampLogger';
import type { LampOperationalRecord } from './src/lampLogger';
import {
  arcCloudFirebaseConfigured,
  createArcChildAccountInvite,
  emptyArcAccountProfile,
  signedOutArcCloudSession,
  loadArcAccountProfile,
  registerArcCloudEmail,
  resendArcCloudVerification,
  resetArcCloudPassword,
  saveArcAccountProfile,
  signInArcCloudEmail,
  signOutArcCloud,
  subscribeArcCloudSession,
  uploadArcCloudTelemetryBatch,
} from './src/cloud/arcCloud';
import type { ArcAccountProfile, ArcChildAccountDraft, ArcCloudSession } from './src/cloud/arcCloud';
import { HistoryRequestPhase, acceptHistorySequence, planHistoryRecovery, resolveHistoryRecovery } from './src/mesh/arcHistorySession';
import { registeredProbeForHistoryIndex, canRetryBlockedProbeHistory, type BlockedProbeHistory } from './src/mesh/arcHistoryIdentity';
import { historyDevice, prepareHistoryUpload, mergeHistoryRecords } from './src/cloud/historyGateway';
import { canonicalDeviceNodes, canonicalDeviceForNode, deviceView, scheduleRing, mergePortalInventory } from './src/cloud/deviceView';
import { applyOwnerConfirmedDeviceLinks, linkedHistoryInventory, ownerLinkKey, ownerLinkTargets, validatedOwnerLinkId, type OwnerConfirmedDeviceLinks } from './src/cloud/ownerConfirmedDeviceLinks';
import { portalHistoryToLampLogs } from './src/cloud/portalTelemetry';
import { portalClient, PortalApiError } from './src/cloud/portalClient';
import { PortalPeoplePicker } from './src/cloud/PortalPeoplePicker';
import type {
  ArcUserSummary,
  DeviceGrant,
  DeviceGrantInput,
  DeviceTransfer,
  PortalConnection,
  PortalDeviceSummary,
  PortalMessage,
  PortalPost,
  PortalProjectDetail,
  PortalProjectFile,
  PortalProjectKnowledgeItem,
  PortalProjectSummary,
  PortalTask,
  ProjectDeviceGrantView,
  PortalRoom,
} from './src/cloud/portalTypes';
import {
  canOpenHistory,
  canOpenLatest,
  isOwnedDevice,
} from './src/cloud/devicePermissions';
import { loadPortalDevicePresentationCache, savePortalDevicePresentationCache } from './src/cloud/portalCache';
import { portalHistoryToProbeLogs, portalLatestToProbeStatus } from './src/cloud/portalTelemetry';
import { studentFriendGrantPermissions } from './src/security/arcPermissions';
import {
  clearAllLocalTelemetry,
  countUnsyncedLocalRecords,
  deleteLocalTelemetry,
  drainCloudTelemetry,
  loadCloudSyncEnabled,
  loadLocalTelemetryStats,
  retryCloudTelemetryNow,
  saveCloudSyncEnabled,
} from './src/localTelemetryStore';
import type { LocalTelemetryStats } from './src/localTelemetryStore';
import {
  buildDefaultProbeSettings,
  loadProbeSettings,
  saveProbeSettings,
} from './src/probeSettings';
import type { ProbeGraphSignal, ProbeGraphWindow, ProbeSettings } from './src/probeSettings';
import { TimeRings } from './src/ui/TimeRings';
import type { TimeFormat } from './src/ui/timeUtils';
import { useControlSizing } from './src/ui/useControlSizing';
import {
  AppThemeProvider,
  getAppTheme,
  resolveAppTheme,
} from './src/ui/theme';
import type { AppTheme, AppThemePreference } from './src/ui/theme';
import { loadAppThemePreference, saveAppThemePreference } from './src/ui/themePreferenceStorage';
import { useArcI18n } from './src/i18n';

type TabKey = 'home' | 'clock' | 'manual' | 'sensors' | 'comms';
type ConnectionsSection = 'local' | 'devices' | 'people' | 'projects';
type LampGraphSignal = 'lampCoreTemp' | 'lampBoardTemp' | 'lampPower' | 'lampFan1' | 'lampFan2' | 'lampOutput';
type ArcGraphSignal = ProbeGraphSignal | LampGraphSignal;
type ManualTelemetryLocks = {
  channels: [boolean, boolean, boolean, boolean];
  temperature: boolean;
  power: boolean;
};
type PendingManualControl = {
  enabled: boolean;
  channels: [number, number, number, number];
  temperatureLimitC: number;
  powerLimitWatts: number;
};
type PendingManualFanControl = {
  automatic: boolean;
  targetRpm: number;
};
type SchedulePhaseKey = 'sunrise' | 'daylight' | 'evening';
type ScheduleChannelTargets = [number, number, number, number];
type LampScheduleConfigV3 = {
  onMinutes: number;
  sunriseFadeMinutes: number;
  daylightStartMinutes: number;
  daylightFadeMinutes: number;
  eveningStartMinutes: number;
  eveningFadeMinutes: number;
  offMinutes: number;
  nightFadeMinutes: number;
  sunriseTarget: ScheduleChannelTargets;
  daylightTarget: ScheduleChannelTargets;
  eveningTarget: ScheduleChannelTargets;
};
type LampScheduleConfigV3Reply = {
  configVersion: number;
  enabled: boolean;
  config: LampScheduleConfigV3;
};
type LocalLampScheduleState = {
  version: number;
  pendingVersion?: number;
  synced: boolean;
  updatedAt: number;
  timerEnabled: boolean;
  config: LampScheduleConfigV3;
};

type PersistedLampScheduleMap = Record<string, LocalLampScheduleState>;

type ScheduleOutputSample = {
  timestampMs: number;
  planned: ScheduleChannelTargets;
  applied: ScheduleChannelTargets;
};
type PersistedScheduleOutputState = {
  enabled: boolean;
  samplesByLamp: Record<string, ScheduleOutputSample[]>;
};
type ScheduleOutputGraphWindow = '1h' | '6h' | '24h';

const LAMP_SCHEDULE_STORAGE_KEY = 'arc.lamp.schedule.v3';
const SCHEDULE_OUTPUT_TRACKING_STORAGE_KEY = 'arc.lamp.schedule.outputTracking.v3';
// Release interlock: no telemetry upload during physical Lamp validation.
// Explicitly review and remove this hold in a separately approved iOS release.
const ARC_CLOUD_SYNC_VALIDATION_HOLD = true;
const CONNECTIONS_SECTION_STORAGE_KEY = 'arc.connections.lastSection.v1';
const CONNECTIONS_ICON_BLUE = '#247FA3';
const SCHEDULE_OUTPUT_LOG_CADENCE_MS = 60 * 1000;
const SCHEDULE_OUTPUT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const interpolateScheduleTargets = (
  from: ScheduleChannelTargets,
  to: ScheduleChannelTargets,
  progress: number
): ScheduleChannelTargets => {
  const t = clampNumber(progress, 0, 1);
  return from.map((value, index) =>
    clampNumber(value + (to[index] - value) * t, 0, 100)
  ) as ScheduleChannelTargets;
};

const plannedScheduleTargetsAt = (
  config: LampScheduleConfigV3,
  enabled: boolean,
  timestampMs: number
): ScheduleChannelTargets => {
  const off: ScheduleChannelTargets = [0, 0, 0, 0];
  if (!enabled) return off;

  const date = new Date(timestampMs);
  const minute = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;

  const sunriseEnd = config.onMinutes + config.sunriseFadeMinutes;
  const daylightEnd = config.daylightStartMinutes + config.daylightFadeMinutes;
  const eveningEnd = config.eveningStartMinutes + config.eveningFadeMinutes;
  const nightStart = config.offMinutes - config.nightFadeMinutes;

  if (minute < config.onMinutes || minute >= config.offMinutes) return off;

  if (config.sunriseFadeMinutes > 0 && minute < sunriseEnd) {
    return interpolateScheduleTargets(
      off,
      config.sunriseTarget,
      (minute - config.onMinutes) / config.sunriseFadeMinutes
    );
  }
  if (minute < config.daylightStartMinutes) return [...config.sunriseTarget] as ScheduleChannelTargets;

  if (config.daylightFadeMinutes > 0 && minute < daylightEnd) {
    return interpolateScheduleTargets(
      config.sunriseTarget,
      config.daylightTarget,
      (minute - config.daylightStartMinutes) / config.daylightFadeMinutes
    );
  }
  if (minute < config.eveningStartMinutes) return [...config.daylightTarget] as ScheduleChannelTargets;

  if (config.eveningFadeMinutes > 0 && minute < eveningEnd) {
    return interpolateScheduleTargets(
      config.daylightTarget,
      config.eveningTarget,
      (minute - config.eveningStartMinutes) / config.eveningFadeMinutes
    );
  }
  if (minute < nightStart) return [...config.eveningTarget] as ScheduleChannelTargets;

  if (config.nightFadeMinutes > 0 && minute < config.offMinutes) {
    return interpolateScheduleTargets(
      config.eveningTarget,
      off,
      (minute - nightStart) / config.nightFadeMinutes
    );
  }

  return off;
};

type LampHealthEvent = {
  id: string;
  nodeId: string;
  severity: 'warning' | 'error';
  message: string;
  atMs: number;
};

const ROUTED_PROBE_RECENT_MS = 5 * 60 * 1000;
const isRoutedProbeTelemetryRecent = (node: MeshNode, now = Date.now()) => {
  if (node.nodeKind !== 'probe') return false;
  const routedSeenAt = node.assignedGatewayId ? node.lastSeenViaGatewayAt : node.assignedBridgeId ? node.lastSeenViaLampAt : null;
  return typeof routedSeenAt === 'number' && now - routedSeenAt <= ROUTED_PROBE_RECENT_MS;
};

// G4 app-channel order: neutral white, blue, red, warm white.  This helper is
// deliberately independent from gesture/UI code so optical calibration stays
// in one place.
const spectrumPositionFromChannels = (channels: readonly number[]) => {
  const active = channels.map((value) => Math.max(0, value)).filter((value) => value > 0.5);
  if (active.length === 0) return 0.5;
  if (active.length === 4) return 0.5;
  const weights = [0.5, 0, 1, 0.5];
  const total = channels.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0.01) return 0.5;
  return clampNumber(channels.reduce((sum, value, index) => sum + Math.max(0, value) * weights[index], 0) / total, 0, 1);
};

const channelsFromSpectrum = (position: number): [number, number, number, number] => {
  const p = clampNumber(position, 0, 1);
  // Blue -> neutral whites -> red. The outer 4000 K strings (phases 1 and
  // 4) are four-LED strings, so each uses its full PWM range at white.
  if (p <= 0.5) {
    const white = p * 2;
    return [white * 100, (1 - white) * 100, 0, white * 100];
  }
  const white = (1 - p) * 2;
  return [white * 100, 0, (1 - white) * 100, white * 100];
};

const g4HealthMessage = (code: number) => ({
  1: 'Thermal output reduction active',
  2: 'Power ceiling limiting active',
  3: 'Thermal shutdown active',
  4: 'Core temperature sensor unavailable',
  5: 'Power sensor unavailable',
}[code] ?? 'G4 reported a protection event');

// Touch-only slider: avoids a native dependency so the panel works in the
// existing Expo development client as well as the production iOS build.
const interpolateHex = (start: string, end: string, amount: number) => {
  const from = start.replace('#', '');
  const to = end.replace('#', '');
  const channel = (index: number) => Math.round(parseInt(from.slice(index, index + 2), 16) + (parseInt(to.slice(index, index + 2), 16) - parseInt(from.slice(index, index + 2), 16)) * amount);
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`;
};

const ManualSlider = ({ value, minimum, maximum, colors, onChange, appStyles, disabled = false }: {
  value: number;
  minimum: number;
  maximum: number;
  colors: readonly [string, string];
  onChange: (value: number) => void;
  appStyles: AppStyles;
  disabled?: boolean;
}) => {
  const [width, setWidth] = useState(1);
  const setFromTouch = (event: any) => {
    if (disabled) return;
    const fraction = Math.max(0, Math.min(1, event.nativeEvent.locationX / width));
    onChange(Math.round(minimum + fraction * (maximum - minimum)));
  };
  const fraction = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
  return (
    <TouchableOpacity
      style={[appStyles.manualTouchTrack, disabled && appStyles.headerActionButtonDisabled]}
      activeOpacity={0.85}
      disabled={disabled}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onPress={setFromTouch}
      accessibilityRole="adjustable"
      accessibilityState={{ disabled }}
      accessibilityValue={{ min: minimum, max: maximum, now: value }}
    >
      <View style={[appStyles.manualTouchFill, { width: `${fraction * 100}%` }]}>
        {Array.from({ length: 14 }, (_, index) => (
          <View key={index} style={[appStyles.manualGradientStop, { backgroundColor: interpolateHex(colors[0], colors[1], index / 13) }]} />
        ))}
      </View>
      <View style={[appStyles.manualTouchThumb, { left: `${fraction * 100}%`, borderColor: colors[1] }]} />
    </TouchableOpacity>
  );
};

const ManualStepButton = ({ direction, onPress, appStyles, label, disabled = false }: {
  direction: 'minus' | 'plus';
  onPress: () => void;
  appStyles: AppStyles;
  label: string;
  disabled?: boolean;
}) => (
  <TouchableOpacity
    style={[appStyles.manualStepButton, disabled && appStyles.headerActionButtonDisabled]}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
  >
    <Text style={appStyles.manualStepButtonText}>{direction === 'minus' ? '−' : '+'}</Text>
  </TouchableOpacity>
);

// Modal children are mounted independently from the main React tree on iOS.
// Keeping this tiny boundary inside the Modal distinguishes a React visibility
// change from UIKit dismissing the presented controller underneath us.
const GraphLifecycleBoundary = ({ snapshotRef }: { snapshotRef: React.MutableRefObject<Record<string, unknown>> }) => {
  useEffect(() => {
    console.log('[GraphLifecycle][MOUNT]', snapshotRef.current);
    return () => console.warn('[GraphLifecycle][UNMOUNT]', snapshotRef.current);
  }, [snapshotRef]);
  return null;
};

const GraphVisualBoundary = ({ name }: { name: 'ROOT' | 'CONTENT' }) => {
  useEffect(() => {
    console.log(`[GraphVisual][${name}_MOUNT]`);
    return () => console.warn(`[GraphVisual][${name}_UNMOUNT]`);
  }, [name]);
  return null;
};


const ConnectionsIcon = ({ size, color }: { size: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
    <SvgPath
      d="M12 12 6.2 6.7M12 12l5.8-5.3M12 12l-5.8 5.3M12 12l5.8 5.3"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <SvgPath
      d="M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM6.2 4.6a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2Zm11.6 0a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2ZM6.2 15.2a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2Zm11.6 0a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2Z"
      fill={color}
    />
  </Svg>
);



// Draw Graph View selection ticks as vectors: Android font baselines can move a
// text "✓" below the center of a small checkbox.
const GraphCheckboxTick = ({ color, size = 14 }: { color: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" accessibilityElementsHidden>
    <SvgPath
      d="M2.8 8.2 L6.25 11.55 L13.2 4.45"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

export default function App() {
  return <SafeAreaProvider><ArcApp /></SafeAreaProvider>;
}

function ArcApp() {
  const systemInsets = useSafeAreaInsets();
  const [graphViewport, setGraphViewport] = useState({ width: 0, height: 0 });
  const [graphMeasuredPlotHeight, setGraphMeasuredPlotHeight] = useState(0);
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreference] = useState<AppThemePreference>('system');
  const [themePreferenceReady, setThemePreferenceReady] = useState(false);
  const resolvedAppTheme = resolveAppTheme(themePreference, systemColorScheme);
  const appTheme = useMemo(() => getAppTheme(resolvedAppTheme), [resolvedAppTheme]);
  const styles = useMemo(() => createStyles(appTheme), [appTheme]);
  const {
    activeLocale,
    languagePreference,
    setLanguagePreference,
    t,
    formatNumber,
    formatDate,
    formatDateTime,
    formatTime,
    languageOptions,
  } = useArcI18n();
  const ble = useMemo(() => createLampBle(), []);
  const mesh = useMemo(() => createMeshComms(), []);
  const { containerHeight, cornerIconSize } = useControlSizing();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const log = (...args: any[]) => console.log('[App]', ...args);
  const TELEMETRY_POLL_MS = 2000;
  const PENDING_WRITE_TIMEOUT_MS = 5000;
  const TIME_SYNC_COOLDOWN_MS = 60000;
  const TIME_SYNC_RETRY_BACKOFF_MS = 15000;
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [settingsLampConfigOpen, setSettingsLampConfigOpen] = useState(false);
  const [settingsAdvancedOpen, setSettingsAdvancedOpen] = useState(false);
  const [graphLampPickerOpen, setGraphLampPickerOpen] = useState(false);
  const [graphProbePickerOpen, setGraphProbePickerOpen] = useState(false);
  const [probeGraphOpen, setProbeGraphOpen] = useState(false);
  // Transition strategy: fade the actual Main content fully away before any
  // orientation change. Every async phase has a 1 s watchdog so a missing
  // animation/orientation/layout callback can never strand the UI mid-transition.
  const GRAPH_MAIN_FADE_OUT_MS = 280;
  const GRAPH_VIEW_FADE_IN_MS = 180;
  const GRAPH_VIEW_FADE_OUT_MS = 170;
  const GRAPH_MAIN_REVEAL_MS = 240;
  const GRAPH_MAIN_SETTLE_MS = 320;
  const GRAPH_DATA_REFRESH_DELAY_MS = 90;
  // Keep durable telemetry ingestion fully live, but decouple Graph UI/storage
  // reloads from raw packet cadence. Re-reading hundreds of records for every
  // incoming packet causes avoidable React/SVG churn on iOS.
  const GRAPH_LIVE_UI_REFRESH_MS = 2000;
  const GRAPH_TRANSITION_WATCHDOG_MS = 1000;
  const mainContentOpacity = useSharedValue(1);
  const graphContentOpacity = useSharedValue(0);
  const graphTransitionTokenRef = useRef(0);
  const graphTransitionStartedAtRef = useRef(0);
  const historySyncStateRef = useRef<Record<string, 'idle' | 'requested' | 'received' | 'timed_out'>>({});
  const graphLifecycleSnapshotRef = useRef<Record<string, unknown>>({});
  const graphOpacityDiagnosticRef = useRef<number | null>(null);
  const graphVisualRootLayoutRef = useRef('unmeasured');
  const graphVisualContentLayoutRef = useRef('unmeasured');
  const graphVisualRenderGenerationRef = useRef(0);
  const graphVisualStateRef = useRef<Record<string, unknown>>({});
  const graphLiveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graphLiveRefreshPendingProbeIdRef = useRef<string | null>(null);
  const graphLiveRefreshPendingLampIdRef = useRef<string | null>(null);
  const graphLiveRefreshInFlightRef = useRef(false);
  const graphOpeningRef = useRef(false);
  const graphClosingRef = useRef(false);
  const graphOpenContinuationTokenRef = useRef(0);
  const graphCloseContinuationTokenRef = useRef(0);
  const mainRevealStartedTokenRef = useRef(0);
  const graphCloseResolversRef = useRef<Array<() => void>>([]);
  const mainRevealPendingTokenRef = useRef(0);
  const mainRevealMinLayoutVersionRef = useRef(0);
  const graphOpenFadeWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graphFadeInWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graphCloseFadeWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainRevealWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mainVisualLayoutVersion, setMainVisualLayoutVersion] = useState(0);
  const mainVisualLayoutVersionRef = useRef(0);
  const [graphDataReady, setGraphDataReady] = useState(false);
  const mainContentFadeStyle = useAnimatedStyle(() => ({ opacity: mainContentOpacity.value }));
  const graphContentFadeStyle = useAnimatedStyle(() => ({ opacity: graphContentOpacity.value }));
  const logGraphOpacity = (value: number, previous: number | null) => {
    // Log only meaningful endpoints; per-frame logging would obscure the
    // lifecycle trace while a legitimate 180 ms fade is running.
    const rounded = Math.round(value * 100) / 100;
    const wasVisible = (previous ?? 0) >= 0.99;
    const isVisible = rounded >= 0.99;
    const isHidden = rounded <= 0.01;
    if (!isVisible && !isHidden) return;
    if (graphOpacityDiagnosticRef.current === rounded) return;
    graphOpacityDiagnosticRef.current = rounded;
    console.log('[GraphVisual][OPACITY]', {
      value: rounded,
      previous,
      graphOpen: probeGraphOpen,
      closing: graphClosingRef.current,
      token: graphTransitionTokenRef.current,
      unexpectedVisibleToHidden: wasVisible && isHidden && !graphClosingRef.current,
    });
  };
  useAnimatedReaction(
    () => graphContentOpacity.value,
    (value, previous) => {
      const previousNumber = typeof previous === 'number' ? previous : null;
      const atEndpoint = value <= 0.01 || value >= 0.99;
      const changedEndpoint = previousNumber === null ||
        (previousNumber <= 0.01 && value >= 0.99) ||
        (previousNumber >= 0.99 && value <= 0.01);
      if (atEndpoint && changedEndpoint) runOnJS(logGraphOpacity)(value, previousNumber);
    }
  );
  const activeTabRef = useRef<TabKey>('home');
  const allowTimeSettingsUpdateRef = useRef(false);
  // Schedule fields are user-owned while being edited. Live telemetry, local
  // restore and automatic fetches may update the screen only while it is clean.
  const scheduleDirtyRef = useRef(false);
  const scheduleEditRevisionRef = useRef(0);

  const markScheduleDirty = () => {
    scheduleDirtyRef.current = true;
    scheduleEditRevisionRef.current += 1;
  };

  const clearScheduleDirty = () => {
    scheduleDirtyRef.current = false;
    scheduleEditRevisionRef.current += 1;
  };

  const logGraphTransition = (transitionToken: number, event: string, details?: Record<string, unknown>) => {
    const elapsedMs = graphTransitionStartedAtRef.current
      ? Date.now() - graphTransitionStartedAtRef.current
      : 0;
    console.log('[GraphTransition]', event, {
      token: transitionToken,
      elapsedMs,
      window: `${Math.round(windowWidth)}x${Math.round(windowHeight)}`,
      graphOpen: probeGraphOpen,
      opening: graphOpeningRef.current,
      closing: graphClosingRef.current,
      ...(details ?? {}),
    });
  };

  const graphLifecycleSnapshot = () => ({
    token: graphTransitionTokenRef.current,
    graphOpen: probeGraphOpen,
    opening: graphOpeningRef.current,
    closing: graphClosingRef.current,
    selectedLampId: selectedLampNode?.id ?? selectedLampIdRef.current,
    selectedProbeId: selectedPortalProbe?.id ?? selectedProbeNode?.id ?? null,
    bleConnected: activeConnected,
    telemetryOwner: selectedPortalProbe
      ? 'portal'
      : selectedProbeNode?.probeActiveTelemetryRoute ?? (selectedLampNode ? 'lamp' : 'none'),
    historySyncState: historySyncStateRef.current[selectedLampNode?.id ?? selectedLampIdRef.current ?? ''] ?? 'idle',
    window: `${Math.round(windowWidth)}x${Math.round(windowHeight)}`,
    orientation: windowWidth > windowHeight ? 'landscape' : 'portrait',
  });

  const logGraphLifecycle = (event: string, details?: Record<string, unknown>) => {
    const snapshot = { ...graphLifecycleSnapshot(), ...(details ?? {}) };
    graphLifecycleSnapshotRef.current = snapshot;
    console.log(`[GraphLifecycle][${event}]`, snapshot);
  };

  const clearGraphTransitionTimer = (timerRef: { current: ReturnType<typeof setTimeout> | null }) => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    // The normal ARC UI is intentionally portrait-only. Graph View temporarily
    // takes over the orientation lock and restores portrait before it closes.
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch((error) => {
      console.warn('[App] Could not lock main view to portrait', error);
    });
  }, []);

  useEffect(() => {
    const transitionToken = mainRevealPendingTokenRef.current;
    if (!transitionToken) return;

    logGraphTransition(transitionToken, 'main reveal gate check', {
      mainVisualLayoutVersion: mainVisualLayoutVersionRef.current,
      minLayoutVersion: mainRevealMinLayoutVersionRef.current,
      isPortrait: windowHeight > windowWidth,
    });

    if (
      probeGraphOpen ||
      windowHeight <= windowWidth ||
      mainVisualLayoutVersion < mainRevealMinLayoutVersionRef.current
    ) return;

    // A valid fresh portrait layout has arrived. The layout-driven settle path
    // now owns the preferred reveal, while the existing one-second watchdog is
    // deliberately left armed as a hard upper bound. startMainReveal() is
    // single-shot per token, so whichever path wins safely cancels the other.

    // ScreenOrientation.lockAsync can resolve before TimeRings has committed
    // its portrait geometry. Give the visual block a short quiet period, while
    // the watchdog still guarantees Main cannot remain hidden indefinitely.
    let secondFrame = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        settleTimer = setTimeout(() => {
          startMainReveal(transitionToken, 'fresh TimeRings portrait layout');
        }, GRAPH_MAIN_SETTLE_MS);
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [mainVisualLayoutVersion, probeGraphOpen, windowHeight, windowWidth]);

  useEffect(() => {
    let active = true;
    void loadAppThemePreference().then((preference) => {
      if (!active) return;
      setThemePreference(preference);
      setThemePreferenceReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!themePreferenceReady) return;
    void saveAppThemePreference(themePreference).catch((error) => {
      console.warn('[App] Could not persist appearance preference', error);
    });
  }, [themePreference, themePreferenceReady]);

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('Idle');

  const [devices, setDevices] = useState<LampBleDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const [meshEnabled, setMeshEnabled] = useState(true);
  const [threadEnabled, setThreadEnabled] = useState(false);
  const [meshNodes, setMeshNodes] = useState<MeshNode[]>([]);
  const [meshPersistenceReady, setMeshPersistenceReady] = useState(false);
  const [meshTransportReady, setMeshTransportReady] = useState(false);
  const [arcRegistrySeed, setArcRegistrySeed] = useState<ArcDeviceRegistryEntry[]>([]);
  const [meshSelectedNodeId, setMeshSelectedNodeId] = useState<string | null>(null);
  const [selectedLampId, setSelectedLampId] = useState<string | null>(null);
  const [lampSelectorOpen, setLampSelectorOpen] = useState(false);
  const [lampHealthLogOpen, setLampHealthLogOpen] = useState(false);
  const [lampHealthEvents, setLampHealthEvents] = useState<LampHealthEvent[]>([]);
  const lastLampHealthSignatureRef = useRef<string | null>(null);
  const [manualChannels, setManualChannels] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [manualTemperatureLimitC, setManualTemperatureLimitC] = useState(45);
  const [manualPowerLimitWatts, setManualPowerLimitWatts] = useState(120);
  const [manualFanTargetRpm, setManualFanTargetRpm] = useState(1800);
  const [manualFanAutomatic, setManualFanAutomatic] = useState(true);
  const [manualPwmFrequencyHz, setManualPwmFrequencyHz] = useState(17000);
  const [manualControlSending, setManualControlSending] = useState(false);
  // Telemetry is authoritative once the G4 has acknowledged a manual command.
  // Before then, preserve the individual control currently being edited.
  const manualTelemetryLocksRef = useRef<ManualTelemetryLocks>({
    channels: [false, false, false, false],
    temperature: false,
    power: false,
  });
  const pendingManualControlRef = useRef<PendingManualControl | null>(null);
  // Fan telemetry arrives continuously just like phase telemetry.  Keep a
  // slider edit local until the G4 has echoed the command we sent.
  const manualFanTelemetryLockedRef = useRef(false);
  const pendingManualFanControlRef = useRef<PendingManualFanControl | null>(null);
  const [lampSelectionReady, setLampSelectionReady] = useState(false);
  const [meshStatus, setMeshStatus] = useState('Idle');
  const [meshLogs, setMeshLogs] = useState<string[]>([]);
  const [meshLogExpanded, setMeshLogExpanded] = useState(false);
  const [debugMailboxOpen, setDebugMailboxOpen] = useState(false);
  const historyOwner = useMemo(() => new HistoryTransportOwner(), []);
  const debugHistoryBridgeRef = useRef<{
    acquire: (id: string, signal: AbortSignal) => Promise<void>;
    release: (id: string) => void;
    resumeProduction: (id: string) => void;
  } | null>(null);
  const debugHistoryLogRef = useRef<(message: string, id: string) => void>(() => undefined);
  const debugMailbox = useMemo(() => new DebugHistoryMailbox({
    sessionState: id => mesh.getHistorySessionState(id),
    acquire: (id, signal) => debugHistoryBridgeRef.current?.acquire(id, signal) ?? Promise.reject(new Error('History transport is unavailable.')),
    release: id => debugHistoryBridgeRef.current?.release(id),
    requestStatus: id => mesh.requestHistoryStatus(id),
    requestBatch: (id, after, head, limit) => mesh.requestHistoryBatch(id, after, head, limit),
    requestAfter: (id, after) => mesh.requestHistoryAfter(id, after),
    log: (message, id) => debugHistoryLogRef.current(message, id),
  }), [mesh]);

  const meshLogScrollRef = useRef<ScrollView | null>(null);
  const meshNodesRef = useRef<MeshNode[]>([]);
  const probeRouteRetryKeysRef = useRef<Set<string>>(new Set());
  const probeRouteRepairKeysRef = useRef<Set<string>>(new Set());
  const [meshScanning, setMeshScanning] = useState(false);
  const [meshConnecting, setMeshConnecting] = useState(false);
  const [meshEditNodeId, setMeshEditNodeId] = useState<string | null>(null);
  const [meshEditName, setMeshEditName] = useState('');
  const [meshEditAbbrev, setMeshEditAbbrev] = useState('');
  const [meshEditColor, setMeshEditColor] = useState('#22c55e');
  const [meshEditError, setMeshEditError] = useState('');
  const selectedMeshNodeIdRef = useRef<string | null>(null);
  const selectedLampIdRef = useRef<string | null>(null);
  const [probeGraphDrawerOpen, setProbeGraphDrawerOpen] = useState(false);
  const [probeSettingsOpen, setProbeSettingsOpen] = useState(false);
  const [probeAdvancedSamplingOpen, setProbeAdvancedSamplingOpen] = useState(false);
  const [probeSampleBusyById, setProbeSampleBusyById] = useState<Record<string, boolean>>({});
  const [probeSampleConfirmedById, setProbeSampleConfirmedById] = useState<Record<string, number>>({});
  const [probeSampleErrorById, setProbeSampleErrorById] = useState<Record<string, string>>({});
  const [probeCalibrationOpen, setProbeCalibrationOpen] = useState(false);
  const [probeAlertsOpen, setProbeAlertsOpen] = useState(false);
  const [probeDeviceInfoOpen, setProbeDeviceInfoOpen] = useState(false);
  const [probeAdvancedOpen, setProbeAdvancedOpen] = useState(false);
  const [probeNotesOpen, setProbeNotesOpen] = useState(false);
  const [probePickerOpen, setProbePickerOpen] = useState(false);
  const [probeSettingsById, setProbeSettingsById] = useState<Record<string, ProbeSettings>>({});
  const [probeSettingsReadyById, setProbeSettingsReadyById] = useState<Record<string, boolean>>({});
  const [probeLoggingSettings, setProbeLoggingSettings] = useState<ProbeLoggingSettings>(DEFAULT_PROBE_LOGGING_SETTINGS);
  const [probeLoggingStats, setProbeLoggingStats] = useState<ProbeLoggingStats>({ sampleCount: 0, fileSizeBytes: 0 });
  const [probeLoggingSettingsReady, setProbeLoggingSettingsReady] = useState(false);
  const [localStorageOpen, setLocalStorageOpen] = useState(false);
  const [localStorageReturnToSettings, setLocalStorageReturnToSettings] = useState(false);
  const [localStorageBusy, setLocalStorageBusy] = useState(false);
  const [localStorageNotice, setLocalStorageNotice] = useState<string | null>(null);
  const [localDeleteFrom, setLocalDeleteFrom] = useState('');
  const [localDeleteTo, setLocalDeleteTo] = useState('');
  const [localDeleteDeviceKey, setLocalDeleteDeviceKey] = useState<string | null>(null);
  const [localTelemetryStats, setLocalTelemetryStats] = useState<LocalTelemetryStats>({
    totalRecords: 0,
    lampRecords: 0,
    probeRecords: 0,
    oldestTimestampMs: null,
    newestTimestampMs: null,
    fileSizeBytes: 0,
    pendingCloudRecords: 0,
    syncedCloudRecords: 0,
    unsyncedCloudRecords: 0,
    devices: [],
  });
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [cloudSyncPreferenceReady, setCloudSyncPreferenceReady] = useState(false);
  const [cloudSyncState, setCloudSyncState] = useState<'idle' | 'syncing' | 'synced' | 'pending' | 'retrying' | 'auth_required'>('idle');
  const [cloudSyncKick, setCloudSyncKick] = useState(0);
  const [connectionsSection, setConnectionsSection] = useState<ConnectionsSection>('local');
  const [connectionsSectionReady, setConnectionsSectionReady] = useState(false);
  const [cloudLampLogs, setCloudLampLogs] = useState<LampOperationalRecord[]>([]);
  const [portalDevices, setPortalDevices] = useState<PortalDeviceSummary[]>([]);
  const [ownerLinkPickerOpen, setOwnerLinkPickerOpen] = useState(false);
  const [ownerLinkSaving, setOwnerLinkSaving] = useState(false);
  const autoReconnectAttemptedRef = useRef(new Set<string>());
  const [ownerLinkTargetId, setOwnerLinkTargetId] = useState<string | null>(null);
  const [hardwareBindings,setHardwareBindings]=useState<HardwareBinding[]>([]);
  const hardwareBindingsRef=useRef<HardwareBinding[]>([]);
  const [hardwareBindingsReady,setHardwareBindingsReady]=useState(false);
  const [hardwareOnboardingStates,setHardwareOnboardingStates]=useState<OnboardingState[]>([]);
  const [iosDeviceQrScannerOpen, setIosDeviceQrScannerOpen] = useState(false);
  const iosDeviceQrStagedScanRef = useRef<ArcPublicDeviceQr | null>(null);
  const [iosDeviceQrReview, setIosDeviceQrReview] = useState<ArcQrReviewState | null>(null);
  const iosDeviceQrLookupTokenRef = useRef(0);
  const iosDeviceQrPendingSelectionRef = useRef<{ uid: string; deviceId: string; account: string } | null>(null);
  const [localPermissionClock,setLocalPermissionClock]=useState(Date.now());
  const offlineAccessAccount=useRef<string|null>(null);

  const [lampHardwareIdentity,setLampHardwareIdentity]=useState<Record<string,HardwareIdentityEvent>>({});
  const lampHardwareIdentityRef=useRef<Record<string,HardwareIdentityEvent>>({});
  const hardwareBindingWriteRef=useRef<Promise<void>>(Promise.resolve());
  const [ownerConfirmedLinks, setOwnerConfirmedLinks] = useState<OwnerConfirmedDeviceLinks>({});
  const [ownerLinksAccount, setOwnerLinksAccount] = useState<string | null>(null);
  const [portalDevicesCachedAt, setPortalDevicesCachedAt] = useState<number | null>(null);
  const [portalInventoryCached, setPortalInventoryCached] = useState(false);
  const portalInventorySourceRef = useRef<'none' | 'cache' | 'network'>('none');
  const [portalConnections, setPortalConnections] = useState<PortalConnection[]>([]);
  const [portalIncomingRequests, setPortalIncomingRequests] = useState<PortalConnection[]>([]);
  const [portalOutgoingRequests, setPortalOutgoingRequests] = useState<PortalConnection[]>([]);
  const [portalFriendSharedDeviceCounts, setPortalFriendSharedDeviceCounts] = useState<Record<string, number>>({});
  const [portalProjects, setPortalProjects] = useState<PortalProjectSummary[]>([]);
  const [selectedPortalProjectId, setSelectedPortalProjectId] = useState<string | null>(null);
  const [portalProjectDetail, setPortalProjectDetail] = useState<PortalProjectDetail | null>(null);
  const [portalProjectDeviceGrants, setPortalProjectDeviceGrants] = useState<ProjectDeviceGrantView[]>([]);
  const [portalProjectPosts, setPortalProjectPosts] = useState<PortalPost[]>([]);
  const [portalProjectTasks, setPortalProjectTasks] = useState<PortalTask[]>([]);
  const [portalProjectFiles, setPortalProjectFiles] = useState<PortalProjectFile[]>([]);
  const [portalProjectKnowledge, setPortalProjectKnowledge] = useState<PortalProjectKnowledgeItem[]>([]);
  const [portalProjectComposerText, setPortalProjectComposerText] = useState('');
  const [portalProjectPosting, setPortalProjectPosting] = useState(false);
  const [portalProjectMenuOpen, setPortalProjectMenuOpen] = useState(false);
  const [portalProjectCalendarOpen, setPortalProjectCalendarOpen] = useState(false);
  const [portalProjectTaskCreateOpen, setPortalProjectTaskCreateOpen] = useState(false);
  const [portalProjectTaskDetailId, setPortalProjectTaskDetailId] = useState<string | null>(null);
  const [portalProjectTaskTitle, setPortalProjectTaskTitle] = useState('');
  const [portalProjectTaskDescription, setPortalProjectTaskDescription] = useState('');
  const [portalProjectTaskDueAt, setPortalProjectTaskDueAt] = useState<Date | null>(null);
  const [portalProjectTaskRangeMode, setPortalProjectTaskRangeMode] = useState<'date' | 'interval' | 'week'>('date');
  const [portalProjectTaskStartsAt, setPortalProjectTaskStartsAt] = useState<Date | null>(null);
  const [portalProjectTaskEndsAt, setPortalProjectTaskEndsAt] = useState<Date | null>(null);
  const [portalProjectTaskWeekAnchor, setPortalProjectTaskWeekAnchor] = useState<Date>(new Date());
  const [portalProjectTaskPickerTarget, setPortalProjectTaskPickerTarget] = useState<'dueDate' | 'dueTime' | 'startDate' | 'startTime' | 'endDate' | 'endTime' | null>(null);
  const [portalProjectTaskBusy, setPortalProjectTaskBusy] = useState(false);
  const [portalExpandedPostIds, setPortalExpandedPostIds] = useState<string[]>([]);
  const [portalProjectMenuSection, setPortalProjectMenuSection] = useState<'team' | 'devices' | 'plan' | 'files' | 'knowledge'>('devices');
  const [portalProjectMemberPerson, setPortalProjectMemberPerson] = useState<ArcUserSummary | null>(null);
  const [portalProjectMemberRole, setPortalProjectMemberRole] = useState<'member' | 'admin'>('member');
  const [portalProjectMemberBusy, setPortalProjectMemberBusy] = useState(false);
  const [portalProjectGrantDeviceId, setPortalProjectGrantDeviceId] = useState<string | null>(null);
  const [portalProjectGrantEditingId, setPortalProjectGrantEditingId] = useState<string | null>(null);
  const [portalProjectGrantDraft, setPortalProjectGrantDraft] = useState({
    canViewTelemetry: true,
    canViewHistory: true,
    canTrack: false,
    canControl: false,
    canEditSettings: false,
  });
  const [portalRooms, setPortalRooms] = useState<PortalRoom[]>([]);
  const [portalTransfers, setPortalTransfers] = useState<DeviceTransfer[]>([]);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [portalActionMessage, setPortalActionMessage] = useState<string | null>(null);
  const [selectedPortalDeviceId, setSelectedPortalDeviceId] = useState<string | null>(null);
  const [selectedPortalProbeId, setSelectedPortalProbeId] = useState<string | null>(null);
  const [portalConnectionPerson, setPortalConnectionPerson] = useState<ArcUserSummary | null>(null);
  const [portalGrantPerson, setPortalGrantPerson] = useState<ArcUserSummary | null>(null);
  const [portalTransferPerson, setPortalTransferPerson] = useState<ArcUserSummary | null>(null);
  const [portalDeviceGrants, setPortalDeviceGrants] = useState<DeviceGrant[]>([]);
  const [portalGrantDeviceId, setPortalGrantDeviceId] = useState<string | null>(null);
  const [portalGrantEditingId, setPortalGrantEditingId] = useState<string | null>(null);
  const [portalGrantDraft, setPortalGrantDraft] = useState<DeviceGrantInput>({
    granteeUid: '',
    ...studentFriendGrantPermissions(),
  });
  const [activePortalRoomId, setActivePortalRoomId] = useState<string | null>(null);
  const [portalMessages, setPortalMessages] = useState<PortalMessage[]>([]);
  const [portalMessageDraft, setPortalMessageDraft] = useState('');
  const [portalChatBusy, setPortalChatBusy] = useState(false);
  const [recentProbeLogs, setRecentProbeLogs] = useState<ProbeLogEnvelope[]>([]);
  const [recentLampLogs, setRecentLampLogs] = useState<LampOperationalRecord[]>([]);
  const [cloudProbeLogs, setCloudProbeLogs] = useState<ProbeLogEnvelope[]>([]);
  const [selectedProbeSourceId, setSelectedProbeSourceId] = useState<string | null>(null);
  const [probeGraphWindow, setProbeGraphWindow] = useState<'15m' | '1h' | '6h' | '24h'>('1h');
  const [graphShowLamp, setGraphShowLamp] = useState(true);
  const [graphShowProbe, setGraphShowProbe] = useState(true);
  const [lampGraphVisibleSignals, setLampGraphVisibleSignals] = useState<LampGraphSignal[]>([
    'lampCoreTemp',
    'lampPower',
    'lampFan1',
  ]);
  const [probeGraphVisibleSignals, setProbeGraphVisibleSignals] = useState<ProbeGraphSignal[]>([
    'sht45Temp',
    'soilTop',
    'soilMid',
    'soilBottom',
  ]);
  const [probeGraphYAxisSignals, setProbeGraphYAxisSignals] = useState<ArcGraphSignal[]>([
    'sht45Temp',
    'soilTop',
    'soilMid',
  ]);
  const [graphFocusedPoint, setGraphFocusedPoint] = useState<{
    signalKey: ArcGraphSignal;
    label: string;
    value: number;
    unit: string;
    timeLabel: string;
    xPx: number;
    yPx: number;
    color: string;
  } | null>(null);
  const graphTimestampDebugSignatureRef = useRef('');
  const [arcCloudSession, setArcCloudSession] = useState<ArcCloudSession>(signedOutArcCloudSession);
  const currentCloudUserRef = useRef(arcCloudSession.userId);
  currentCloudUserRef.current = arcCloudSession.userId;
  const [authResolved, setAuthResolved] = useState(false);
  const [authSigningOut, setAuthSigningOut] = useState(false);
  const [arcCloudStatus, setArcCloudStatus] = useState<'idle' | 'loading' | 'ready' | 'offline' | 'error'>(
    arcCloudFirebaseConfigured ? 'idle' : 'offline'
  );
  const [arcCloudError, setArcCloudError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [childAccountOpen, setChildAccountOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountProfile, setAccountProfile] = useState<ArcAccountProfile>(emptyArcAccountProfile);
  const [accountProfileReady, setAccountProfileReady] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [childEmail, setChildEmail] = useState('');
  const [childName, setChildName] = useState('');
  const [childRelation, setChildRelation] = useState<ArcChildAccountDraft['relation']>('student');
  const [childAccountMessage, setChildAccountMessage] = useState<string | null>(null);
  const probeLoggingSettingsRef = useRef<ProbeLoggingSettings>(DEFAULT_PROBE_LOGGING_SETTINGS);
  const probeSettingsByIdRef = useRef<Record<string, ProbeSettings>>({});
  const probeLastLoggedHasDeviceTimeRef = useRef<Record<string,boolean>>({});
  const probeLastLoggedAtByIdRef = useRef<Record<string, number>>({});
  const probeLoggingViewsOpenRef = useRef(false);
  const cloudSyncStatusLabel = !cloudSyncEnabled
    ? t('status.storedLocally')
    : cloudSyncState === 'syncing'
      ? t('status.syncing')
      : cloudSyncState === 'retrying'
        ? t('status.retrying')
        : cloudSyncState === 'auth_required'
          ? t('status.signInRequired')
          : localTelemetryStats.pendingCloudRecords > 0
            ? t('status.pending', { count: localTelemetryStats.pendingCloudRecords })
            : t('status.synced');

  const [power, setPower] = useState(false);
  const [intensity, setIntensity] = useState(20);
  const [hue, setHue] = useState(0.5);
  const [pwmFreq, setPwmFreq] = useState('10000');
  const [lampStatus, setLampStatus] = useState<LampStatus | null>(null);
  const pendingIntensityRef = useRef(false);
  const pendingHueRef = useRef(false);
  const pendingPowerRef = useRef<{
    value: boolean;
    sentAt: number;
  } | null>(null);
  const [pendingPower, setPendingPower] = useState(false);
  const pendingWriteRef = useRef<{
    intensity: number;
    hue: number;
    pwmFreq: number;
    sentAt: number;
  } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const saveStateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arcAcceptanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmedArcValuesRef = useRef({ intensity: 20, hue: 0.5 });
  // Status can report phase percentages but does not yet contain a separate
  // watt-target field. Once the user explicitly confirms a target, retain it
  // rather than re-deriving (and visually jumping) from those percentages.
  const mainViewTargetPinnedRef = useRef(false);
  const saveStateRef = useRef(saveState);
  const lastTimeSyncRef = useRef<Record<string, number>>({});
  const timeSyncInFlightRef = useRef<Record<string, boolean>>({});
  // Direct Probe time sync is scoped to a BLE connection generation, not a node's lifetime.
  const probeTimeGenerationRef = useRef<Record<string, number>>({});
  const probeTimeSentGenerationRef = useRef<Record<string, number>>({});
  const probeTimeInFlightRef = useRef<Record<string, boolean>>({});
  const probeTimeLastAttemptRef = useRef<Record<string, number>>({});
  const meshConfigVersionByNodeRef = useRef<Record<string, number>>({});
  const meshLocalConfigByNodeRef = useRef<Record<string, LocalLampScheduleState>>({});
  const [schedulePersistenceReady, setSchedulePersistenceReady] = useState(false);
  const scheduleFetchInFlightRef = useRef<Record<string, boolean>>({});
  const scheduleAutoFetchKeyRef = useRef<string | null>(null);
  const schedulePendingWaitLogKeyByNodeRef = useRef<Record<string, string>>({});
  const meshUpdatePromptVersionByNodeRef = useRef<Record<string, number>>({});
  const meshTelemetryVersionByNodeRef = useRef<Record<string, number>>({});
  // The lamp link can emit a fresh tach sample several times per second.  The
  // main view contains the animated day-cycle canvas, so committing every RPM
  // wobble makes touch input feel stalled.  This records the last fan value
  // committed to React for each lamp; transport and safety telemetry remain
  // fully live underneath.
  const meshFanUiTelemetryByNodeRef = useRef<Record<string, {
    at: number;
    automatic: boolean;
    rpmControl: boolean;
    targetRpm: number;
  }>>({});
  const [meshTelemetryVersionByNode, setMeshTelemetryVersionByNode] = useState<Record<string, number>>({});

  const [onTime, setOnTime] = useState('07:00');
  const [daylightStartTime, setDaylightStartTime] = useState('08:30');
  const [eveningStartTime, setEveningStartTime] = useState('19:30');
  const [offTime, setOffTime] = useState('22:30');
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [scheduleEnableSending, setScheduleEnableSending] = useState(false);
  const [sunriseFadeMinutes, setSunriseFadeMinutes] = useState('30');
  const [daylightFadeMinutes, setDaylightFadeMinutes] = useState('60');
  const [eveningFadeMinutes, setEveningFadeMinutes] = useState('60');
  const [nightFadeMinutes, setNightFadeMinutes] = useState('30');
  const [schedulePhase, setSchedulePhase] = useState<SchedulePhaseKey>('sunrise');
  const [scheduleSunriseTarget, setScheduleSunriseTarget] = useState<ScheduleChannelTargets>([0, 0, 0, 0]);
  const [scheduleDaylightTarget, setScheduleDaylightTarget] = useState<ScheduleChannelTargets>([0, 0, 0, 0]);
  const [scheduleEveningTarget, setScheduleEveningTarget] = useState<ScheduleChannelTargets>([0, 0, 0, 0]);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>('24');
  const [activeTimeField, setActiveTimeField] = useState<'on' | 'daylight' | 'evening' | 'off' | null>(null);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());
  const [timeSettingsSet, setTimeSettingsSet] = useState(false);
  const [scheduleOutputTrackingEnabled, setScheduleOutputTrackingEnabled] = useState(false);
  const [scheduleOutputTrackingReady, setScheduleOutputTrackingReady] = useState(false);
  const [scheduleOutputSamplesByLamp, setScheduleOutputSamplesByLamp] = useState<Record<string, ScheduleOutputSample[]>>({});
  const scheduleOutputSamplesByLampRef = useRef<Record<string, ScheduleOutputSample[]>>({});
  const scheduleOutputLastSampleAtByLampRef = useRef<Record<string, number>>({});
  const [scheduleOutputGraphOpen, setScheduleOutputGraphOpen] = useState(false);
  const [scheduleOutputGraphWindow, setScheduleOutputGraphWindow] = useState<ScheduleOutputGraphWindow>('1h');
  const [scheduleOpenPanel, setScheduleOpenPanel] = useState<'times' | 'output'>('output');

  const [multiLampEnabled, setMultiLampEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [maxCoreTemp, setMaxCoreTemp] = useState('80');
  const [maxCpuTemp, setMaxCpuTemp] = useState('85');
  const [minCoreTemp, setMinCoreTemp] = useState('20');
  const [maxPower, setMaxPower] = useState('120');
  const [hasFans, setHasFans] = useState(false);
  const [fanRpm, setFanRpm] = useState('1200');
  const [fanStartTemp, setFanStartTemp] = useState('55');
  const [firmwareRevision] = useState('v1.0.0');
  const [dayCycle, setDayCycle] = useState({ sunrise: 7 * 60 + 30, sunset: 17 * 60 });
  const [hasLocation, setHasLocation] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  });

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId);
  const selectedDeviceName = selectedDevice?.name || selectedDevice?.localName || 'Lamp';
  const selectedMeshNode = meshNodes.find((node) => node.id === meshSelectedNodeId && !isLegacyMeshNode(node));
  const historySyncPolicyRef = useRef({ enabled: cloudSyncEnabled, ready: cloudSyncPreferenceReady });
  historySyncPolicyRef.current = { enabled: cloudSyncEnabled, ready: cloudSyncPreferenceReady };
  const historyAccessUserRef = useRef<string | null>(null);
  const historyInventoryRef = useRef<{ devices: PortalDeviceSummary[]; userId: string | null }>({ devices: [], userId: null });
  const knownCanonicalDeviceIdsRef = useRef(new Set<string>());
  portalDevices.forEach(device => {
    knownCanonicalDeviceIdsRef.current.add(device.id);
    device.telemetrySourceNodeIds?.forEach(id => knownCanonicalDeviceIdsRef.current.add(id));
  });
  // Platform BLE IDs are connection endpoints, not cloud device identities.
  // Associations are explicit, owner-confirmed and revalidated on every render.
  useEffect(() => {
    const uid = arcCloudSession.userId;
    setOwnerConfirmedLinks({});
    setOwnerLinksAccount(null);
    autoReconnectAttemptedRef.current.clear();
    setOwnerLinkPickerOpen(false);
    setOwnerLinkTargetId(null);
    if (Platform.OS !== 'android' || !uid) return;
    let cancelled = false;
    void AsyncStorage.getItem(`arc:owner-device-links:${uid}`).then(value => {
      if (cancelled) return;
      let safe: OwnerConfirmedDeviceLinks = {};
      try {
        const parsed: unknown = value ? JSON.parse(value) : {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          safe = Object.fromEntries(Object.entries(parsed).filter(([key, id]) =>
            /^(lamp|probe):[0-9A-F]{12}$/.test(key) && typeof id === 'string' && id.length > 0));
        }
      } catch { /* Invalid prior local mapping is discarded, never trusted. */ }
      setOwnerConfirmedLinks(safe);
      setOwnerLinksAccount(uid);
    }).catch(() => { if (!cancelled) setOwnerLinksAccount(uid); });
    return () => { cancelled = true; };
  }, [arcCloudSession.userId]);
  const activeOwnerLinks=useMemo<OwnerConfirmedDeviceLinks>(()=>({}),[]);
  // Retain legacy transport links for rollback, but never use MAC as physical identity.
  const resolvedHistoryInventory = useMemo(() => linkedHistoryInventory(
    meshNodes, portalDevices, activeOwnerLinks, arcCloudSession.userId,
  ), [meshNodes, portalDevices, activeOwnerLinks, arcCloudSession.userId]);
  historyInventoryRef.current = { devices: resolvedHistoryInventory, userId: historyAccessUserRef.current };

  useEffect(()=>{
    let cancelled=false;
    void AsyncStorage.getItem('arc:hardware-product-bindings:v1').then(value=>{
      const parsed: unknown=value?JSON.parse(value):[];
      if(!Array.isArray(parsed) || parsed.some(item=>!item || hardwareUid(item.hardwareUid)!==item.hardwareUid ||
          typeof item.arcDeviceId!=='string' || typeof item.confirmedBy!=='string'))throw new Error('Invalid stored hardware bindings');
      if(!cancelled){hardwareBindingsRef.current=parsed;setHardwareBindings(parsed);setHardwareBindingsReady(true);}
    }).catch(()=>{if(!cancelled)setMeshStatus('Hardware binding storage unavailable or invalid. Prior data preserved.');});
    return ()=>{cancelled=true;};
  },[]);
  useEffect(()=>mesh.subscribeHardwareIdentity(event=>{
    const previous=lampHardwareIdentityRef.current[event.nodeId];
    if(previous && previous.session>event.session)return;
    const next={...lampHardwareIdentityRef.current,[event.nodeId]:event};
    lampHardwareIdentityRef.current=next;setLampHardwareIdentity(next);
    if(event.state==='identified'){
      if (event.deviceType === 'probe') void syncProbeTime(event.nodeId);
      const resolution=resolveHardwareBinding(hardwareBindingsRef.current,event.hardwareUid!);
      setMeshStatus(resolution.state==='known'?`${event.deviceType === 'probe' ? 'Probe' : 'Lamp'} identified — ARC ${resolution.arcDeviceId}`:
        resolution.state==='conflict'?'Hardware identity conflict. Existing bindings preserved.':'Hardware UID identified; checking claimed ARC binding.');
    }else if(event.state!=='disconnected')setMeshStatus(`Hardware identity: ${event.state}.`);
  }),[mesh]);
  const hardwareBackend=useMemo(()=>localFirstHardwareBackend({
    account:()=>currentCloudUserRef.current,
    known:uid=>hardwareBindingsRef.current.some(binding=>binding.hardwareUid===uid),
    consistent:(uid,result)=>resolveHardwareBinding(hardwareBindingsRef.current,uid,result.binding.arcDeviceId).state!=='conflict',
    store:nativeOfflineAccess,
    resolveOnline:uid=>portalClient.hardwareBinding(uid),
    devicesOnline:()=>portalClient.devices(),
    confirmOnline:(uid,id,kind)=>portalClient.confirmHardwareBinding(uid,id,kind),
    revoked:error=>error instanceof PortalApiError&&[401,403].includes(error.status),
  }),[]);
  const hardwareOnboarding=useMemo(()=>new HardwareOnboarding(hardwareBackend,setHardwareOnboardingStates),[hardwareBackend]);
  // ARC printed QR is public identity only. Never establish grants from QR content.
  const handleArcDeviceQrScan = (identity: ArcPublicDeviceQr) => {
    if (Platform.OS !== 'ios') return;
    const account = arcCloudSession.userId;
    const token = ++iosDeviceQrLookupTokenRef.current;
    iosDeviceQrPendingSelectionRef.current = null;
    setIosDeviceQrScannerOpen(false);
    setIosDeviceQrReview({ identity, phase: 'loading' });
    if (!account || !arcCloudSession.emailVerified) {
      setIosDeviceQrReview({ identity, phase: 'error', error: 'Sign in with a verified ARC account first.' });
      return;
    }
    void (async () => {
      try {
        // Read from authoritative APIs: no cached ownership, QR-provided grants or UID-based auto-claim.
        const [binding, devicesForAccount] = await Promise.all([
          portalClient.hardwareBinding(identity.hardwareUid),
          portalClient.devices(),
        ]);
        if (token !== iosDeviceQrLookupTokenRef.current || currentCloudUserRef.current !== account) return;
        const owned = devicesForAccount.filter(device =>
          device.type === identity.deviceType && device.access.isOwner && device.owner.uid === account
        );
        if (binding) {
          const device = owned.find(candidate => candidate.id === binding.binding.arcDeviceId);
          if (binding.binding.hardwareUid !== identity.hardwareUid ||
              binding.binding.deviceType !== identity.deviceType ||
              binding.device.id !== binding.binding.arcDeviceId ||
              binding.device.type !== identity.deviceType) {
            throw new Error('The QR identity conflicts with the canonical hardware registry.');
          }
          if (!device) throw new Error('This device is not claimed by your account.');
          setIosDeviceQrReview({ identity, phase: 'registered', registered: device });
          return;
        }
        setIosDeviceQrReview({ identity, phase: 'choose', choices: owned });
      } catch (cause) {
        if (token !== iosDeviceQrLookupTokenRef.current || currentCloudUserRef.current !== account) return;
        setIosDeviceQrReview({ identity, phase: 'error', error: cause instanceof Error ? cause.message : String(cause) });
      }
    })();
  };
  const closeArcDeviceQrReview = () => {
    iosDeviceQrLookupTokenRef.current += 1;
    setIosDeviceQrReview(null);
  };
  const openLocalAfterQr = () => {
    closeArcDeviceQrReview();
    setConnectionsSection('local');
    setActiveTabSafe('comms');
    setMeshStatus('QR identity identified. Connect the corresponding physical ARC node to verify its UID. Secure enrollment is not active.');
  };
  const chooseArcDeviceForQr = (device: PortalDeviceSummary) => {
    const review = iosDeviceQrReview;
    const account = arcCloudSession.userId;
    if (!review || review.phase !== 'choose' || !account ||
        review.identity.deviceType !== device.type || !device.access.isOwner ||
        device.owner.uid !== account || !review.choices?.some(candidate => candidate.id === device.id)) return;
    // Selection is explicitly user-initiated. HardwareOnboarding will independently
    // verify the live UID and server permissions before committing a binding.
    iosDeviceQrPendingSelectionRef.current = { uid: review.identity.hardwareUid, deviceId: device.id, account };
    openLocalAfterQr();
    setMeshStatus(`Selected ${device.displayName}. Connect its physical node; ARC will verify the UID before associating.`);
  };
  useEffect(() => {
    const pending = iosDeviceQrPendingSelectionRef.current;
    if (!pending || !arcCloudSession.userId || pending.account !== arcCloudSession.userId) return;
    const eligible = hardwareOnboardingStates.find(state =>
      state.phase === 'select' && state.hardwareUid === pending.uid &&
      state.candidates?.some(candidate => candidate.id === pending.deviceId &&
        candidate.access.isOwner && candidate.owner.uid === pending.account)
    );
    if (!eligible) return;
    const physical = lampHardwareIdentity[eligible.nodeId];
    if (physical?.state !== 'identified' || physical.hardwareUid !== pending.uid ||
        physical.session !== eligible.session) return;
    iosDeviceQrPendingSelectionRef.current = null;
    void hardwareOnboarding.select(eligible.nodeId, pending.deviceId).catch(cause =>
      setMeshStatus(`Association failed: ${cause instanceof Error ? cause.message : String(cause)}`)
    );
  }, [hardwareOnboardingStates, lampHardwareIdentity, hardwareOnboarding, arcCloudSession.userId]);
  useEffect(() => {
    // Discard any uncommitted QR selection when the signed-in account changes.
    iosDeviceQrPendingSelectionRef.current = null;
    iosDeviceQrStagedScanRef.current = null;
    iosDeviceQrLookupTokenRef.current += 1;
    setIosDeviceQrScannerOpen(false);
    setIosDeviceQrReview(null);
  }, [arcCloudSession.userId]);
  useEffect(()=>mesh.subscribeHardwareIdentity(event=>{void hardwareOnboarding.identity(event);}),[mesh,hardwareOnboarding]);
  useEffect(()=>mesh.subscribeConnection((id,connected)=>{if(!connected)hardwareOnboarding.cancel(id);}),[mesh,hardwareOnboarding]);
  useEffect(()=>{
    const previous=offlineAccessAccount.current;offlineAccessAccount.current=arcCloudSession.userId;
    hardwareOnboarding.reset();
    if(previous&&previous!==arcCloudSession.userId){void nativeOfflineAccess.clearSubject(previous).catch(()=>setMeshStatus('Protected permission cleanup failed; current account remains gated.'));}
  },[hardwareOnboarding,arcCloudSession.userId]);
  useEffect(()=>{const timer=setInterval(()=>setLocalPermissionClock(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const localHardwareGrant=(node:MeshNode|null)=>node?hardwareOnboardingStates.find(state=>state.nodeId===node.id&&state.phase==='ready'&&state.permissionSource==='native_secure_receipt'&&state.permissionExpiresAtMs!==undefined&&state.permissionExpiresAtMs>localPermissionClock):undefined;
  useEffect(()=>{
    for(const state of hardwareOnboardingStates){
      if(state.phase!=='ready'||!state.binding||!state.device)continue;
      const binding=state.binding;
      setMeshNodes(prev=>prev.map(node=>node.id===state.nodeId && node.canonicalDeviceId!==binding.arcDeviceId?{...node,canonicalDeviceId:binding.arcDeviceId}:node));
      setPortalDevices(prev=>{const old=prev.find(device=>device.id===state.device!.id);return [...prev.filter(device=>device.id!==state.device!.id),{...state.device!,latestTelemetry:state.device!.latestTelemetry??old?.latestTelemetry,confirmedSchedule:state.device!.confirmedSchedule??old?.confirmedSchedule}];});
      setMeshStatus('ARC binding confirmed; local app permissions available offline. Device authorization remains separate.');
      if(!hardwareBindingsRef.current.some(item=>item.hardwareUid===binding.hardwareUid)){
        const next=[...hardwareBindingsRef.current,{hardwareUid:binding.hardwareUid,arcDeviceId:binding.arcDeviceId,confirmedBy:currentCloudUserRef.current??''}];
        hardwareBindingsRef.current=next;setHardwareBindings(next);
        void AsyncStorage.setItem('arc:hardware-product-bindings:v1',JSON.stringify(next)).catch(()=>setMeshStatus('Server binding confirmed; local cache could not be saved.'));
      }
    }
  },[hardwareOnboardingStates]);
  const blockedHardwareAssociation=hardwareOnboardingStates.find(state=>state.phase!=='disconnected'&&(state.phase!=='ready'||(state.permissionExpiresAtMs??0)<=localPermissionClock));
  const mandatoryHardwareAssociation=blockedHardwareAssociation?.phase==='ready'?{...blockedHardwareAssociation,phase:'error' as const,error:'Local permission receipt expired. The identity binding is preserved; explicitly renew permissions online.'}:blockedHardwareAssociation;
  const iosHardwareResolution=(node: MeshNode)=>{
    const event=lampHardwareIdentity[node.id];
    const local=localHardwareGrant(node);
    if(local?.binding&&event?.state==='identified'&&local.binding.hardwareUid===event.hardwareUid)return {state:'known' as const,arcDeviceId:local.binding.arcDeviceId};
    const expected=canonicalDeviceForNode(node,portalDevices)?.id;
    return event?.state==='identified' && event.hardwareUid && hardwareBindingsReady
      ? resolveHardwareBinding(hardwareBindings,event.hardwareUid,expected)
      : {state:event?.state ?? 'pending'};
  };
  const resolvedIosLampNodes=Platform.OS==='ios'?localLampIdentityProjection():null;
  function localLampIdentityProjection(){
    return meshNodes.filter(isCurrentArcLamp).map(node=>{
      const result=iosHardwareResolution(node);
      return result.state==='known' && 'arcDeviceId' in result?{...node,canonicalDeviceId:result.arcDeviceId}:node;
    });
  }
  const saveIosHardwareBinding=async(target:string|null):Promise<boolean>=>{
    const node=meshNodes.find(candidate=>candidate.id===meshEditNodeId),uid=arcCloudSession.userId;
    const event=node?lampHardwareIdentityRef.current[node.id]:undefined;
    if(!node || !uid || currentCloudUserRef.current!==uid || !hardwareBindingsReady || portalInventoryCached ||
       event?.state!=='identified' || !event.hardwareUid || !target){setMeshEditError('Connect and identify the Lamp, then select an owned ARC product from fresh inventory.');return false;}
    const session=event.session;
    setOwnerLinkSaving(true);
    let success=false;
    const operation=hardwareBindingWriteRef.current.catch(()=>undefined).then(async()=>{
      const current=lampHardwareIdentityRef.current[node.id];
      if(current?.session!==session || current.state!=='identified' || currentCloudUserRef.current!==uid)throw new Error('Lamp connection or account changed. Retry the association.');
      const verified=await portalClient.confirmHardwareBinding(current.hardwareUid!,target,current.deviceType!);
      if(lampHardwareIdentityRef.current[node.id]?.session!==session||currentCloudUserRef.current!==uid)throw new Error('Connection/account changed while confirming binding');
      if(verified.binding.hardwareUid!==current.hardwareUid||verified.binding.arcDeviceId!==target||verified.device.type!==current.deviceType||!verified.device.access.isOwner||verified.device.owner.uid!==uid)throw new Error('Factory binding or owner permission mismatch');
      const authorized=[verified.device.id];
      const next=associateHardwareBinding(hardwareBindingsRef.current,current.hardwareUid!,target,uid,authorized,canonicalDeviceForNode(node,portalDevices)?.id);
      await AsyncStorage.setItem('arc:hardware-product-bindings:v1',JSON.stringify(next));
      hardwareBindingsRef.current=next;setHardwareBindings(next);success=true;
      setMeshStatus(`ARC identity linked — ${target}; device authorization remains separate`);
    });
    hardwareBindingWriteRef.current=operation;
    try{await operation;return success;}catch(error:any){setMeshEditError(error.message ?? 'Could not persist hardware binding');return false;}finally{setOwnerLinkSaving(false);}
  };

  const ownerLinkSource = meshNodes.find(node => node.id === meshEditNodeId) ?? null;
  const canConnectLocalNode = (node: MeshNode) => {
    if(!['lamp','probe','gateway'].includes(node.nodeKind??''))return true;
    return Boolean(localHardwareGrant(node)?.binding?.arcDeviceId===node.canonicalDeviceId&&localHardwareGrant(node)?.appAssociationCompleted);
  };

  const ownerIdentity=ownerLinkSource?lampHardwareIdentity[ownerLinkSource.id]:undefined;
  const ownerLinkCandidates=ownerIdentity?.state==='identified'&&!portalInventoryCached?portalDevices.filter(device=>
    device.type===ownerIdentity.deviceType&&device.access.isOwner&&device.owner.uid===arcCloudSession.userId):[];
  const ownerLinkExistingTarget=ownerIdentity?.hardwareUid?hardwareBindings.find(binding=>binding.hardwareUid===ownerIdentity.hardwareUid)?.arcDeviceId??null:null;
  const saveOwnerLink = async (target: string | null): Promise<boolean> => saveIosHardwareBinding(target);;

  const localLampNodes = useMemo(
    () =>
      meshNodes
        .filter(isCurrentArcLamp)
        .sort((a, b) => {
          if (a.connected !== b.connected) return a.connected ? -1 : 1;
          if (a.provisioned !== b.provisioned) return a.provisioned ? -1 : 1;
          return a.name.localeCompare(b.name);
        }),
    [meshNodes]
  );
  const lampNodes = useMemo(() => canonicalDeviceNodes(applyOwnerConfirmedDeviceLinks(resolvedIosLampNodes ?? localLampNodes, portalDevices, activeOwnerLinks, arcCloudSession.userId), portalDevices, 'lamp', knownCanonicalDeviceIdsRef.current), [localLampNodes, portalDevices, activeOwnerLinks, arcCloudSession.userId, resolvedIosLampNodes]);
  const selectedLampNode = lampNodes.find((node) => node.id === selectedLampId) ?? null;
  const selectedLampName = selectedLampNode?.name ?? t('lamp.noSelected');
  // A local BLE MAC and a cloud UUID may have the same human-readable name
  // without having a verified identity mapping. Never fuse them by name.
  const graphDeviceLabel = (node: { id: string; name: string; blePeripheralId?: string | null; canonicalDeviceId?: string }) => {
    const kind = node.blePeripheralId ? 'BLE' : node.canonicalDeviceId ? 'Cloud' : 'Local';
    const shortId = node.id.length > 12 ? node.id.slice(-8) : node.id;
    return `${node.name} · ${kind} (${shortId})`;
  };
  const selectedLanguageLabel =
    languagePreference === 'system'
      ? t('common.systemDefault')
      : languageOptions.find((option) => option.value === languagePreference)?.label ?? 'English';
  const mainProbeLabel = t('probe.title');
  const mainDataLabel = t('home.dataShort');
  const arcRegistry = useMemo(() => {
    const derived = buildArcRegistryFromNodes(meshNodes.filter(node => !isLegacyMeshNode(node)));
    return derived.length ? derived : arcRegistrySeed.filter(entry => !meshNodes.some(node => node.id === entry.id && isLegacyMeshNode(node)));
  }, [arcRegistrySeed, meshNodes]);
  const selectedArcAppLink = useMemo(() => getPreferredArcAppLink(arcRegistry), [arcRegistry]);
  const provisionedProbeNodes = useMemo(
    () =>
      meshNodes
        .filter((node) => node.nodeKind === 'probe' && node.provisioned && !isLegacyMeshNode(node))
        .sort((a, b) => {
          if (a.connected !== b.connected) return a.connected ? -1 : 1;
          return a.name.localeCompare(b.name);
        }),
    [meshNodes]
  );
  // Probe identity comes only from real provisioned Probe nodes.
  // Cloud is a replication/data source for a Probe, not a second synthetic Probe identity.
  const selectableProbeNodes = useMemo(() => canonicalDeviceNodes(applyOwnerConfirmedDeviceLinks(provisionedProbeNodes, portalDevices, activeOwnerLinks, arcCloudSession.userId), portalDevices, 'probe', knownCanonicalDeviceIdsRef.current), [provisionedProbeNodes, portalDevices, activeOwnerLinks, arcCloudSession.userId]);
  const selectedProbeNode = useMemo(() => {
    const requestedId = selectedPortalProbeId ?? selectedProbeSourceId;
    if (requestedId) {
      const explicit = selectableProbeNodes.find((node) => node.id === requestedId || node.canonicalDeviceId === requestedId);
      if (explicit) return explicit;
    }
    const selectedLocalProbe = selectedMeshNode?.nodeKind === 'probe' ? selectedMeshNode : null;
    const selectedCanonicalProbe = selectedLocalProbe
      ? selectableProbeNodes.find((node) => node.id === selectedLocalProbe.id)
      : null;
    if (selectedCanonicalProbe) return selectedCanonicalProbe;
    return selectableProbeNodes[0] ?? null;
  }, [selectableProbeNodes, selectedMeshNode, selectedProbeSourceId, selectedPortalProbeId]);
  const ownedPortalDevices = useMemo(() => portalDevices.filter(isOwnedDevice), [portalDevices]);
  const sharedPortalDevices = useMemo(() => portalDevices.filter((device) => !isOwnedDevice(device)), [portalDevices]);
  const selectedPortalDevice = useMemo(
    () => portalDevices.find((device) => device.id === selectedPortalDeviceId) ?? null,
    [portalDevices, selectedPortalDeviceId]
  );
  const portalProbeDevices = useMemo(
    () => portalDevices.filter((device) => device.type === 'probe' && (canOpenLatest(device) || canOpenHistory(device))),
    [portalDevices]
  );
  const portalLatestProbeDevices = useMemo(
    () => portalProbeDevices.filter(device => canOpenLatest(device) && !selectableProbeNodes.some(node => node.id === device.id || node.canonicalDeviceId === device.id)),
    [portalProbeDevices, selectableProbeNodes]
  );
  const portalHistoryProbeDevices = useMemo(
    () => portalProbeDevices.filter(device => canOpenHistory(device) && !selectableProbeNodes.some(node => node.id === device.id || node.canonicalDeviceId === device.id)),
    [portalProbeDevices, selectableProbeNodes]
  );
  const selectedPortalProbe = useMemo(
    () => portalProbeDevices.find((device) => device.id === (selectedPortalProbeId ?? selectedProbeNode?.canonicalDeviceId ?? selectedProbeNode?.id)) ?? null,
    [portalProbeDevices, selectedPortalProbeId, selectedProbeNode?.id, selectedProbeNode?.canonicalDeviceId]
  );
  const selectedPortalProbeRef = useRef(selectedPortalProbe);
  selectedPortalProbeRef.current = selectedPortalProbe;
  const selectedProbeDisplayName = selectedPortalProbe?.displayName ?? selectedProbeNode?.name ?? null;
  const selectedProbeView = deviceView(selectedProbeNode, portalDevices, !portalInventoryCached, knownCanonicalDeviceIdsRef.current);
  const selectedProbeLiveStatus = selectedProbeView.probeStatus;
  const selectedProbeSettingsReady = selectedProbeNode ? Boolean(probeSettingsReadyById[selectedProbeNode.id]) : false;
  // Do not allocate a new fallback settings object on every render. An unstable
  // effect dependency used to write a fresh logging-settings object each time,
  // which can trigger React's maximum-update-depth guard on Graph opening.
  const selectedProbeSettings = useMemo(() => {
    if (!selectedProbeNode) return null;
    return probeSettingsById[selectedProbeNode.id] ??
      (selectedProbeSettingsReady ? buildDefaultProbeSettings(selectedProbeNode.id, selectedProbeNode.name) : null);
  }, [selectedProbeNode?.id, selectedProbeNode?.name, selectedProbeSettingsReady, probeSettingsById]);
  const activeConnected = meshEnabled ? Boolean(selectedLampNode?.connected) : connected;
  const selectedLampView = deviceView(selectedLampNode, portalDevices, !portalInventoryCached, knownCanonicalDeviceIdsRef.current);
  const localConfirmedSchedule = selectedLampNode ? meshLocalConfigByNodeRef.current[selectedLampNode.id] : null;
  if (selectedLampNode && selectedLampView.telemetryAllowed && localConfirmedSchedule?.synced && localConfirmedSchedule.pendingVersion === undefined &&
      (!selectedLampView.schedule || localConfirmedSchedule.updatedAt > Date.parse(selectedLampView.schedule.observedAt))) {
    selectedLampView.schedule = {
      schemaVersion: 3, deviceId: selectedLampView.device?.id ?? selectedLampNode.id, configVersion: localConfirmedSchedule.version,
      enabled: localConfirmedSchedule.timerEnabled, observedAt: new Date(localConfirmedSchedule.updatedAt).toISOString(),
      config: localConfirmedSchedule.config, source: 'local_lamp_response',
    };
  }
  const selectedLampViewRef = useRef(selectedLampView);
  selectedLampViewRef.current = selectedLampView;
  const activeStatus = meshEnabled ? selectedLampView.lampStatus : lampStatus;
  const iosLampIdentityReady=Platform.OS!=='ios' || !meshEnabled || (selectedLampNode && iosHardwareResolution(selectedLampNode).state==='known');
  const canControlLamp = meshEnabled ? Boolean(selectedLampNode?.connected&&localHardwareGrant(selectedLampNode)?.device?.access.canControl&&iosLampIdentityReady) : false;
  const canConfigureLamp = meshEnabled ? Boolean(selectedLampNode?.connected&&localHardwareGrant(selectedLampNode)?.device?.access.canEditSettings&&iosLampIdentityReady) : false;
  const [lampCadenceById, setLampCadenceById] = useState<Record<string, LampCadenceReply>>({});
  const [lampCadenceDraftById, setLampCadenceDraftById] = useState<Record<string, number>>({});
  const [lampCadenceBusyById, setLampCadenceBusyById] = useState<Record<string, boolean>>({});
  const [lampCadenceErrorById, setLampCadenceErrorById] = useState<Record<string, string>>({});
  const [lampCadenceReadById, setLampCadenceReadById] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const id = selectedLampNode?.id;
    if (!id || !meshEnabled || !selectedLampNode.connected || activeTab !== 'manual') return;
    let cancelled = false;
    setLampCadenceReadById(prev => ({ ...prev, [id]: false }));
    setLampCadenceBusyById(prev => ({ ...prev, [id]: true }));
    void mesh.requestLampCadence(id).then(reply => {
      if (cancelled) return;
      setLampCadenceById(prev => ({ ...prev, [id]: reply }));
      setLampCadenceDraftById(prev => ({ ...prev, [id]: reply.seconds }));
      setLampCadenceReadById(prev => ({ ...prev, [id]: true }));
      setLampCadenceErrorById(prev => ({ ...prev, [id]: '' }));
    }).catch(error => { if (!cancelled) setLampCadenceErrorById(prev => ({ ...prev, [id]: String(error.message ?? error) })); })
      .finally(() => { if (!cancelled) setLampCadenceBusyById(prev => ({ ...prev, [id]: false })); });
    return () => { cancelled = true; };
  }, [mesh, meshEnabled, selectedLampNode?.id, selectedLampNode?.connected, activeTab]);
  const canReadLampHistory = selectedLampView.canViewHistory;
  const canReadProbeHistory = selectedProbeView.canViewHistory;
  const canReadHistory = canReadLampHistory || canReadProbeHistory;
  const remoteLampView = Boolean(selectedLampView.device && !selectedLampNode?.connected);
  const cloudLampView = selectedLampView.provenance === 'cloud';
  const hasConnectedProbeLink = selectableProbeNodes.length > 0;
  const localizedG4HealthMessage = (code: number) => {
    if (code === 1) return t('health.thermalReduction');
    if (code === 2) return t('health.powerLimit');
    if (code === 3) return t('health.thermalShutdown');
    if (code === 4) return t('health.coreSensorUnavailable');
    if (code === 5) return t('health.powerSensorUnavailable');
    return t('health.protectionEvent');
  };

  const lampHealth = (() => {
    if (!selectedLampNode) return { label: '', style: 'offline' as const, reason: '' };
    if (!activeConnected) return { label: '', style: 'offline' as const, reason: t('lamp.connectionLost') };
    const health = activeStatus?.health;
    if (health?.severity === 'error') return { label: t('lamp.error'), style: 'error' as const, reason: localizedG4HealthMessage(health.code) };
    if (health?.severity === 'warning') return { label: t('lamp.warning'), style: 'warning' as const, reason: localizedG4HealthMessage(health.code) };
    return { label: t('lamp.nominal'), style: 'nominal' as const, reason: '' };
  })();

  useEffect(() => {
    if (!selectedLampNode || lampHealth.style === 'nominal' || lampHealth.style === 'offline') {
      lastLampHealthSignatureRef.current = null;
      return;
    }
    const severity = lampHealth.style === 'warning' ? 'warning' as const : 'error' as const;
    const signature = `${selectedLampNode.id}:${severity}:${lampHealth.reason}`;
    if (lastLampHealthSignatureRef.current === signature) return;
    lastLampHealthSignatureRef.current = signature;
    const atMs = Date.now();
    setLampHealthEvents((events) => [{
      id: `${signature}:${atMs}`,
      nodeId: selectedLampNode.id,
      severity,
      message: lampHealth.reason,
      atMs,
    }, ...events].slice(0, 50));
  }, [lampHealth.reason, lampHealth.style, selectedLampNode]);

  /* Event history remains available in the log, but the dashboard banner is
   * live-state only. A recovered G4 must not leave a stale warning banner. */
  const latestLampHealthEvent = lampHealth.style === 'warning' || lampHealth.style === 'error'
    ? lampHealthEvents.find((event) => event.nodeId === selectedLampNode?.id) ?? null
    : null;
  const clearDisplayedLampHealthEvents = () => {
    const nodeId = selectedLampNode?.id;
    if (!nodeId) return;
    /* This acknowledges local UI history only.  It must not clear an active
     * G4 protection condition or re-enable power that the G4 has limited. */
    setLampHealthEvents((events) => events.filter((event) => event.nodeId !== nodeId));
    setStatus('Displayed lamp warnings and errors cleared. Active protection remains enforced.');
  };
  const mainViewPowerCeilingWatts = clampNumber(activeStatus?.manualControl?.powerLimitWatts ?? manualPowerLimitWatts, 20, 120);

  useEffect(() => () => {
    if (arcAcceptanceTimer.current) clearTimeout(arcAcceptanceTimer.current);
  }, []);

  useEffect(() => {
    mainViewTargetPinnedRef.current = false;
  }, [meshEnabled, selectedLampNode?.id, selectedDeviceId]);

  useEffect(() => {
    const control = activeStatus?.manualControl;
    if (!control) return;
    const pending = pendingManualControlRef.current;
    const matchesPendingCommand = pending
      && control.active === pending.enabled
      && control.temperatureLimitC === pending.temperatureLimitC
      && control.powerLimitWatts === pending.powerLimitWatts
      && control.requestedChannels.every((value, index) => Math.abs(value - pending.channels[index]) < 0.6);
    if (matchesPendingCommand) {
      // This is the G4 echo of the exact values sent by the app. From this
      // point the applied values may legitimately move down due to limits.
      pendingManualControlRef.current = null;
      manualTelemetryLocksRef.current = {
        channels: [false, false, false, false],
        temperature: false,
        power: false,
      };
    }
    const locks = manualTelemetryLocksRef.current;
    setManualChannels((current) => current.map((value, index) => (
      locks.channels[index] ? value : control.appliedChannels[index]
    )) as [number, number, number, number]);
    if (!locks.temperature) setManualTemperatureLimitC(control.temperatureLimitC);
    if (!locks.power) setManualPowerLimitWatts(control.powerLimitWatts);
  }, [activeStatus?.manualControl]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(SCHEDULE_OUTPUT_TRACKING_STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as Partial<PersistedScheduleOutputState>;
        const restored = parsed && typeof parsed.samplesByLamp === 'object' && parsed.samplesByLamp
          ? parsed.samplesByLamp as Record<string, ScheduleOutputSample[]>
          : {};
        scheduleOutputSamplesByLampRef.current = restored;
        setScheduleOutputSamplesByLamp(restored);
        setScheduleOutputTrackingEnabled(Boolean(parsed?.enabled));
      })
      .catch((error: any) => {
        console.warn('[ScheduleOutput][LOCAL][RESTORE_FAIL]', error?.message ?? String(error));
      })
      .finally(() => {
        if (active) setScheduleOutputTrackingReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const persistScheduleOutputTracking = (enabled: boolean, samplesByLamp: Record<string, ScheduleOutputSample[]>) => {
    const payload: PersistedScheduleOutputState = { enabled, samplesByLamp };
    void AsyncStorage.setItem(SCHEDULE_OUTPUT_TRACKING_STORAGE_KEY, JSON.stringify(payload)).catch((error: any) => {
      console.warn('[ScheduleOutput][LOCAL][SAVE_FAIL]', error?.message ?? String(error));
    });
  };

  const setScheduleOutputTracking = (enabled: boolean) => {
    setScheduleOutputTrackingEnabled(enabled);
    if (enabled && selectedLampNode?.id) {
      // Capture the next live frame immediately; subsequent samples are hard-capped at one per minute.
      scheduleOutputLastSampleAtByLampRef.current[selectedLampNode.id] = 0;
    }
    persistScheduleOutputTracking(enabled, scheduleOutputSamplesByLampRef.current);
  };

  useEffect(() => {
    if (!scheduleOutputTrackingReady || !scheduleOutputTrackingEnabled || !activeConnected || !selectedLampNode) return;
    const control = activeStatus?.manualControl;
    if (!control) return;

    const now = Date.now();
    const lampId = selectedLampNode.id;
    const lastSampleAt = scheduleOutputLastSampleAtByLampRef.current[lampId] ?? 0;
    if (now - lastSampleAt < SCHEDULE_OUTPUT_LOG_CADENCE_MS) return;

    const confirmedSchedule = meshLocalConfigByNodeRef.current[lampId];
    if (!confirmedSchedule || typeof confirmedSchedule.pendingVersion === 'number') {
      console.log('[ScheduleOutput][LOCAL][SKIP]', {
        lampId,
        reason: confirmedSchedule ? 'schedule-write-pending' : 'no-confirmed-schedule',
      });
      return;
    }

    // Schedule telemetry is already reported in app/slider phase order
    // (Phase 1, 2, 3, 4).  Do not apply the internal G4 gate mapping here.
    const planned = plannedScheduleTargetsAt(
      confirmedSchedule.config,
      confirmedSchedule.timerEnabled,
      now
    );
    // manualControl.appliedChannels is the currently applied owner envelope,
    // but the dedicated Main View power override is a final global output gate.
    // Keep the schedule envelope intact internally so it can resume, while DATA
    // records the physically effective output seen at the LEDs.
    const powerEnabled = activeStatus?.power === true;
    const applied = powerEnabled
      ? control.appliedChannels.map((value) =>
          clampNumber(value, 0, 100)
        ) as ScheduleChannelTargets
      : [0, 0, 0, 0] as ScheduleChannelTargets;
    const sample: ScheduleOutputSample = { timestampMs: now, planned, applied };
    const cutoff = now - SCHEDULE_OUTPUT_RETENTION_MS;
    const previous = scheduleOutputSamplesByLampRef.current[lampId] ?? [];
    const nextLampSamples = [...previous.filter((item) => item.timestampMs >= cutoff), sample];
    const next = { ...scheduleOutputSamplesByLampRef.current, [lampId]: nextLampSamples };

    scheduleOutputLastSampleAtByLampRef.current[lampId] = now;
    scheduleOutputSamplesByLampRef.current = next;
    setScheduleOutputSamplesByLamp(next);
    persistScheduleOutputTracking(true, next);
    console.log('[ScheduleOutput][LOCAL][SAMPLE]', {
      lampId,
      cadenceSeconds: SCHEDULE_OUTPUT_LOG_CADENCE_MS / 1000,
      powerEnabled,
      planned,
      applied,
    });
  }, [
    scheduleOutputTrackingReady,
    scheduleOutputTrackingEnabled,
    activeConnected,
    selectedLampNode?.id,
    activeStatus?.power,
    activeStatus?.manualControl,
  ]);

  useEffect(() => {
    const fan = activeStatus?.fan;
    if (!fan) return;
    const pending = pendingManualFanControlRef.current;
    const matchesPendingCommand = pending
      && fan.automatic === pending.automatic
      && (pending.automatic || (fan.rpmControl && Math.abs(fan.targetRpm - pending.targetRpm) < 5));
    if (matchesPendingCommand) {
      pendingManualFanControlRef.current = null;
      manualFanTelemetryLockedRef.current = false;
    }
    if (manualFanTelemetryLockedRef.current) return;
    setManualFanAutomatic(fan.automatic);
    /* Actual RPM belongs in the measured readout above the control.  Do not
     * continuously copy it into the target slider: that makes a setpoint
     * impossible to choose while the fan is in automatic mode. */
  }, [activeStatus?.fan]);

  const minutesToTime = (minutes: number) => {
    const safeMinutes = Math.min(Math.max(Math.round(minutes), 0), 1439);
    const hours = Math.floor(safeMinutes / 60);
    const mins = safeMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  const timeToMinutes = (time: string) => {
    const [rawHours, rawMinutes] = time.split(':');
    const hours = Number.parseInt(rawHours ?? '', 10);
    const minutes = Number.parseInt(rawMinutes ?? '', 10);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return Math.min(Math.max(hours * 60 + minutes, 0), 1439);
  };

  const timeStringToDate = (time: string) => {
    const date = new Date();
    const [rawHours, rawMinutes] = time.split(':');
    const hours = Number.parseInt(rawHours ?? '', 10);
    const minutes = Number.parseInt(rawMinutes ?? '', 10);
    if (!Number.isNaN(hours)) date.setHours(hours);
    if (!Number.isNaN(minutes)) date.setMinutes(minutes);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
  };

  const meshColorOptions = ['#22c55e', '#38bdf8', '#f97316', '#f59e0b', '#ef4444', '#14b8a6', '#a3e635'];
  const meshNodeKindLabels: Record<MeshNodeKind, string> = {
    lamp: t('node.lamp'),
    probe: t('node.probe'),
    gateway: t('node.gateway'),
    remote: t('node.remote'),
    other: t('node.other'),
  };
  // Keep the currently supported Probe intervals until the firmware cadence
  // command path has been validated end-to-end. The UI now treats this as the
  // Probe's physical wake/sample/report interval rather than a second logging timer.
  const regularIntervalOptions = [60, 120, 180, 240, 300, 360, 420, 480, 540, 600] as const;
  const gasIntervalOptions: Array<{ label: string; value: number | null }> = [
    { label: t('interval.off'), value: null },
    { label: t('interval.minutes', { count: 5 }), value: 300 },
    { label: t('interval.minutes', { count: 15 }), value: 900 },
    { label: t('interval.minutes', { count: 30 }), value: 1800 },
    { label: t('interval.hour', { count: 1 }), value: 3600 },
  ];
  const formatProbeInterval = (seconds?: number | null) => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '--';
    if (seconds < 60) return t('interval.seconds', { count: Math.round(seconds) });
    if (seconds % 3600 === 0) return t('interval.hour', { count: seconds / 3600 });
    if (seconds % 60 === 0) return t('interval.minutes', { count: seconds / 60 });
    return t('interval.minutes', { count: formatNumber(seconds / 60, { maximumFractionDigits: 1 }) });
  };
  const graphSignalLabels: Record<ProbeGraphSignal, string> = {
    sht45Temp: t('graph.signal.sht45Temp'),
    sht45Humidity: t('graph.signal.sht45Humidity'),
    bmePressure: t('graph.signal.bmePressure'),
    bmeGas: t('graph.signal.bmeGas'),
    soilTop: t('graph.signal.soilTop'),
    soilMid: t('graph.signal.soilMid'),
    soilBottom: t('graph.signal.soilBottom'),
    soilTemp: t('graph.signal.soilTemp'),
    lightRed: t('graph.signal.lightRed'),
    lightGreen: t('graph.signal.lightGreen'),
    lightBlue: t('graph.signal.lightBlue'),
    lightIntensity: t('graph.signal.lightIntensity'),
    battery: t('graph.signal.battery'),
  };
  const graphSignalGroups: Array<{ title: string; signals: ProbeGraphSignal[] }> = [
    { title: t('graph.groupClimate'), signals: ['sht45Temp', 'sht45Humidity', 'bmePressure', 'bmeGas'] },
    { title: t('graph.groupSoil'), signals: ['soilTop', 'soilMid', 'soilBottom', 'soilTemp'] },
    { title: t('graph.groupLight'), signals: ['lightRed', 'lightGreen', 'lightBlue', 'lightIntensity'] },
    { title: t('graph.groupDevice'), signals: ['battery'] },
  ];
  const lampGraphSignalGroups: Array<{ title: string; signals: LampGraphSignal[] }> = [
    { title: t('graph.groupLampThermal'), signals: ['lampCoreTemp', 'lampBoardTemp'] },
    { title: t('graph.groupLampOperation'), signals: ['lampPower', 'lampFan1', 'lampFan2', 'lampOutput'] },
  ];
  const getMeshNodeKindLabel = (kind?: MeshNodeKind | null) => meshNodeKindLabels[kind ?? 'other'];

  const inferMeshNodeKind = arcAdvertisementRole;

  const defaultMeshNameForKind = (kind: MeshNodeKind) => meshNodeKindLabels[kind] ?? t('node.generic');

  const buildMeshAbbrev = (name: string) => {
    const cleaned = name.trim();
    if (!cleaned) return 'LP';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  };

  const buildUniqueMeshName = (baseName: string, nodes: MeshNode[]) => {
    const trimmed = baseName.trim() || 'Lamp';
    let candidate = trimmed;
    let suffix = 1;
    const hasName = (value: string) =>
      nodes.some((node) => node.name.trim().toLowerCase() === value.trim().toLowerCase());
    while (hasName(candidate)) {
      suffix += 1;
      candidate = `${trimmed} ${suffix}`;
    }
    return candidate;
  };

  const mergeScannedMeshNodes = (scanned: MeshScanResult[]) => {
    setMeshNodes((prev) => {
      const existing = new Map(prev.map((node) => [node.id, node]));
      const usedNames = new Set(prev.filter((node) => node.provisioned).map((node) => node.name.trim().toLowerCase()));
      const nextNodes: MeshNode[] = [];
      scanned.filter(isArcScanCandidate).forEach((result, index) => {
        const found = existing.get(result.id);
        const advertisedName = result.localName ?? result.name ?? result.cachedName ?? null;
        const nodeKind = found?.nodeKind ?? (result.arcPreviouslyValidated ? result.nodeKind : undefined) ?? inferMeshNodeKind(advertisedName);
        let displayName = found?.provisioned ? found.name : advertisedName ?? found?.name ?? defaultMeshNameForKind(nodeKind);
        let candidate = displayName.trim() || defaultMeshNameForKind(nodeKind);
        let suffix = 1;
        if (!found) {
          while (usedNames.has(candidate.toLowerCase())) {
            suffix += 1;
            candidate = `${displayName} ${suffix}`.trim();
          }
        }
        displayName = candidate;
        usedNames.add(displayName.toLowerCase());
        const abbreviation = found?.abbreviation ?? buildMeshAbbrev(displayName);
        const color = found?.color ?? meshColorOptions[(prev.length + index) % meshColorOptions.length];
        nextNodes.push({
          id: result.id,
          uuid: result.uuid ?? null,
          unicastAddress: found?.unicastAddress ?? null,
          unicastHex: found?.unicastHex ?? null,
          nodeKind,
          name: displayName,
          abbreviation,
          color,
          // Native Android scanner supplies a BLE MAC, not a cloud claim.
          // This flag only describes a locally addressable transport node.
          provisioned: Platform.OS === 'android' ? true : found?.provisioned ?? false,
          blePeripheralId: result.blePeripheralId ?? found?.blePeripheralId ?? (Platform.OS === 'android' ? result.id : null),
          connected: false,
          staticOobHex: found?.staticOobHex ?? null,
          status: found?.status ?? null,
          probeStatus: found?.probeStatus ?? null,
          lastSeen: found?.lastSeen,
          assignedGatewayId: found?.assignedGatewayId ?? null,
          assignedBridgeId: found?.assignedBridgeId ?? null,
          probeGatewayRoute: found?.probeGatewayRoute ?? null,
          probeActiveTelemetryRoute: found?.probeActiveTelemetryRoute ?? null,
          probePowerRole: found?.probePowerRole ?? null,
          gatewayChildState: found?.gatewayChildState ?? null,
          lastSeenViaGatewayAt: found?.lastSeenViaGatewayAt ?? null,
          lastSeenViaLampAt: found?.lastSeenViaLampAt ?? null,
          lastDirectBleSeenAt: found?.lastDirectBleSeenAt ?? null,
        });
      });
      const nextIds = new Set(nextNodes.map((node) => node.id));
      const preserved = prev.filter((node) => !nextIds.has(node.id));
      return [...nextNodes, ...preserved];
    });
  };

  const mergeProvisionedMeshNodes = (provisioned: MeshNode[]) => {
    setMeshNodes((prev) => {
      const byId = new Map(prev.map((node) => [node.id, node]));
      const merged = provisioned.filter(node => !isLegacyMeshNode(node)).map((nextNode, index) => {
        const existing = byId.get(nextNode.id);
        const name = existing?.name ?? buildUniqueMeshName(nextNode.name || 'Lamp', prev);
        const abbreviation = existing?.abbreviation ?? buildMeshAbbrev(name);
        const color = existing?.color ?? meshColorOptions[index % meshColorOptions.length];
        return {
          ...nextNode,
          unicastAddress: nextNode.unicastAddress ?? existing?.unicastAddress ?? null,
          unicastHex: nextNode.unicastHex ?? existing?.unicastHex ?? null,
          nodeKind: existing?.nodeKind ?? nextNode.nodeKind ?? inferMeshNodeKind(name),
          name,
          abbreviation,
          color,
          provisioned: true,
          connected: existing?.connected ?? false,
          staticOobHex: existing?.staticOobHex ?? null,
          status: existing?.status ?? null,
          probeStatus: existing?.probeStatus ?? null,
          assignedGatewayId: existing?.assignedGatewayId ?? nextNode.assignedGatewayId ?? null,
          assignedBridgeId: existing?.assignedBridgeId ?? nextNode.assignedBridgeId ?? null,
          probeGatewayRoute: existing?.probeGatewayRoute ?? nextNode.probeGatewayRoute ?? null,
          probeActiveTelemetryRoute: existing?.probeActiveTelemetryRoute ?? nextNode.probeActiveTelemetryRoute ?? null,
          probePowerRole: existing?.probePowerRole ?? nextNode.probePowerRole ?? null,
          gatewayChildState: existing?.gatewayChildState ?? nextNode.gatewayChildState ?? null,
          lastSeenViaGatewayAt: existing?.lastSeenViaGatewayAt ?? nextNode.lastSeenViaGatewayAt ?? null,
          lastSeenViaLampAt: existing?.lastSeenViaLampAt ?? nextNode.lastSeenViaLampAt ?? null,
          lastDirectBleSeenAt: existing?.lastDirectBleSeenAt ?? nextNode.lastDirectBleSeenAt ?? null,
        } as MeshNode;
      });
      const mergedIds = new Set(merged.map((node) => node.id));
      const preserved = prev.filter((node) => !mergedIds.has(node.id));
      return [...merged, ...preserved];
    });
  };

  const setTimeForField = (field: 'on' | 'daylight' | 'evening' | 'off', date: Date) => {
    const formatted = minutesToTime(date.getHours() * 60 + date.getMinutes());
    markScheduleDirty();
    if (field === 'on') setOnTime(formatted);
    if (field === 'daylight') setDaylightStartTime(formatted);
    if (field === 'evening') setEveningStartTime(formatted);
    if (field === 'off') setOffTime(formatted);
  };

  const openTimePicker = (field: 'on' | 'daylight' | 'evening' | 'off') => {
    const currentValue = field === 'on'
      ? onTime
      : field === 'daylight'
        ? daylightStartTime
        : field === 'evening'
          ? eveningStartTime
          : offTime;
    const date = timeStringToDate(currentValue);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date,
        mode: 'time',
        is24Hour: true,
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            setTimeForField(field, selectedDate);
          }
        },
      });
      return;
    }

    setActiveTimeField(field);
    setPickerDate(date);
    setTimePickerVisible(true);
  };

  const logTelemetry = (source: 'read' | 'notify' | 'poll', nextStatus: LampStatus) => {
    const flagsRaw = typeof nextStatus.openMeshFlagsRaw === 'number' ? nextStatus.openMeshFlagsRaw & 0xff : null;
    const flags =
      nextStatus.openMeshFlags ??
      (flagsRaw !== null
        ? {
            overrideActive: (flagsRaw & 0x01) !== 0,
            thermalShutdown: (flagsRaw & 0x02) !== 0,
            timeSynced: (flagsRaw & 0x04) !== 0,
            timeValid: (flagsRaw & 0x08) !== 0,
            thermalLimitReached: (flagsRaw & 0x10) !== 0,
            timerEnabled: (flagsRaw & 0x20) !== 0,
            lampOn: (flagsRaw & 0x40) !== 0,
            reserved: (flagsRaw & 0x80) !== 0,
          }
        : {
            overrideActive: false,
            thermalShutdown: false,
            timeSynced: nextStatus.lampTimeSynced,
            timeValid: nextStatus.lampTimeSynced,
            thermalLimitReached: false,
            timerEnabled: nextStatus.timerEnabled,
            lampOn: nextStatus.power,
            reserved: false,
          });

    if (__DEV__ && false) log('telemetry.legacyStatus', {
      source,
      protocol: 'legacy-status',
      configVersion: nextStatus.configVersion ?? null,
      lampOn: nextStatus.power,
      timerEnabled: nextStatus.timerEnabled,
      lampTimeValid: nextStatus.lampTimeSynced,
      buildFlags: {
        rawDec: flagsRaw,
        rawHex: flagsRaw == null ? null : `0x${Number(flagsRaw).toString(16).padStart(2, '0').toUpperCase()}`,
        bit0_overrideActive: flags.overrideActive,
        bit1_thermalShutdown: flags.thermalShutdown,
        bit2_timeSynced: flags.timeSynced,
        bit3_timeValid: flags.timeValid,
        bit4_thermalLimitReached: flags.thermalLimitReached,
        bit5_timerEnabled: flags.timerEnabled,
        bit6_lampOn: flags.lampOn,
        bit7_reserved: flags.reserved,
      },
      tempC: {
        mcu: Number(nextStatus.tempMcu.toFixed(1)),
        board: Number(nextStatus.tempBoard.toFixed(1)),
        heatsink: Number(nextStatus.tempHeatsink.toFixed(1)),
      },
      currentMa: nextStatus.currentDraw,
      cachedControlState: {
        intensity: nextStatus.intensity,
        hue: nextStatus.hue,
        pwmFreq: nextStatus.pwmFreq,
      },
    });
  };

  const buildProbeStatusFromLegacyTelemetry = (nextStatus: LampStatus): ProbeSensorStatus => {
    const humidityPct = nextStatus.currentDraw / 10;
    return {
      temperatureC: nextStatus.tempBoard,
      humidityPct: humidityPct >= 0 && humidityPct <= 100 ? humidityPct : null,
      pressureHpa: null,
      gasOhms: null,
      bme690TemperatureC: nextStatus.tempBoard,
      bme690HumidityPct: humidityPct >= 0 && humidityPct <= 100 ? humidityPct : null,
      bme690PressureHpa: null,
      bme690GasOhms: null,
      sht45TemperatureC: null,
      sht45HumidityPct: null,
      earthTemperatureC: null,
      earthTemperatureRaw: null,
      regularSampleIntervalS: null,
      gasSampleIntervalS: null,
      tscDepthValidMask: null,
      tscDepth0Raw: null,
      tscDepth1Raw: null,
      tscDepth2Raw: null,
      tscDepth0Delta: null,
      tscDepth1Delta: null,
      tscDepth2Delta: null,
      lightLux: null,
      lightRedRaw: null,
      lightGreenRaw: null,
      lightBlueRaw: null,
      updatedAt: Date.now(),
      source: 'legacy-bridge',
    };
  };

  const addMeshLog = useCallback((message: string, nodeId?: string | null) => {
    const now = new Date();
    const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(
      now.getSeconds()
    ).padStart(2, '0')}`;
    // Expo is the complete diagnostic stream. The in-app log remains scoped
    // to the selected node so normal use is readable, but native route and
    // ownership events for other nodes must never disappear from Metro.
    console.log('[ArcLog]', `${stamp}${nodeId ? ` node=${nodeId}` : ''} ${message}`);
    const selectedId = selectedMeshNodeIdRef.current;
    if (selectedId && nodeId && nodeId !== selectedId) return;
    setMeshLogs((prev) => {
      const next = [...prev, `${stamp} ${message}`];
      return next.slice(-60);
    });
  }, []);

  debugHistoryLogRef.current = addMeshLog;

  const handleCopyMeshLog = async () => {
    const text = meshLogs.join('\n');
    if (!text.trim()) {
      setMeshStatus('No log entries to copy');
      return;
    }
    try {
      await Clipboard.setStringAsync(text);
      setMeshStatus(`Copied ${meshLogs.length} log lines`);
    } catch (error: any) {
      setMeshStatus(`Copy failed: ${error?.message ?? String(error)}`);
    }
  };

  const applyTimeSettings = (nextStatus: LampStatus) => {
    // Legacy status telemetry still carries on/off + enable state, but schema 3
    // phase timing/targets are owned by the explicit persisted-config response.
    setOnTime(minutesToTime(nextStatus.timerOn));
    setOffTime(minutesToTime(nextStatus.timerOff));
    setTimerEnabled(nextStatus.timerEnabled);
  };

  const clampScheduleTargets = (values: readonly number[] | undefined, fallback: ScheduleChannelTargets = [0, 0, 0, 0]): ScheduleChannelTargets => (
    [0, 1, 2, 3].map((index) => clampNumber(Math.round(values?.[index] ?? fallback[index]), 0, 100)) as ScheduleChannelTargets
  );

  const isScheduleConfigV3 = (value: any): value is LampScheduleConfigV3 => Boolean(
    value &&
    Number.isFinite(value.onMinutes) &&
    Number.isFinite(value.sunriseFadeMinutes) &&
    Number.isFinite(value.daylightStartMinutes) &&
    Number.isFinite(value.daylightFadeMinutes) &&
    Number.isFinite(value.eveningStartMinutes) &&
    Number.isFinite(value.eveningFadeMinutes) &&
    Number.isFinite(value.offMinutes) &&
    Number.isFinite(value.nightFadeMinutes) &&
    Array.isArray(value.sunriseTarget) && value.sunriseTarget.length === 4 &&
    Array.isArray(value.daylightTarget) && value.daylightTarget.length === 4 &&
    Array.isArray(value.eveningTarget) && value.eveningTarget.length === 4
  );

  const normalizeScheduleConfigV3 = (value: any): LampScheduleConfigV3 | null => {
    if (!isScheduleConfigV3(value)) return null;
    return {
      onMinutes: clampNumber(Math.round(value.onMinutes), 0, 1439),
      sunriseFadeMinutes: clampNumber(Math.round(value.sunriseFadeMinutes), 0, 720),
      daylightStartMinutes: clampNumber(Math.round(value.daylightStartMinutes), 0, 1439),
      daylightFadeMinutes: clampNumber(Math.round(value.daylightFadeMinutes), 0, 720),
      eveningStartMinutes: clampNumber(Math.round(value.eveningStartMinutes), 0, 1439),
      eveningFadeMinutes: clampNumber(Math.round(value.eveningFadeMinutes), 0, 720),
      offMinutes: clampNumber(Math.round(value.offMinutes), 0, 1439),
      nightFadeMinutes: clampNumber(Math.round(value.nightFadeMinutes), 0, 720),
      sunriseTarget: clampScheduleTargets(value.sunriseTarget),
      daylightTarget: clampScheduleTargets(value.daylightTarget),
      eveningTarget: clampScheduleTargets(value.eveningTarget),
    };
  };

  const normalizeScheduleReplyV3 = (value: any): LampScheduleConfigV3Reply | null => {
    if (!value || typeof value !== 'object') return null;
    const configVersionRaw = value.configVersion ?? value.version;
    const enabledRaw = value.enabled ?? value.timerEnabled;
    const configCandidate = value.config ?? value;
    const config = normalizeScheduleConfigV3(configCandidate);
    if (!Number.isFinite(configVersionRaw) || typeof enabledRaw !== 'boolean' || !config) return null;
    return {
      configVersion: Number(configVersionRaw) & 0xff,
      enabled: enabledRaw,
      config,
    };
  };

  const scheduleConfigMatches = (a: LampScheduleConfigV3, b: LampScheduleConfigV3) => (
    a.onMinutes === b.onMinutes &&
    a.sunriseFadeMinutes === b.sunriseFadeMinutes &&
    a.daylightStartMinutes === b.daylightStartMinutes &&
    a.daylightFadeMinutes === b.daylightFadeMinutes &&
    a.eveningStartMinutes === b.eveningStartMinutes &&
    a.eveningFadeMinutes === b.eveningFadeMinutes &&
    a.offMinutes === b.offMinutes &&
    a.nightFadeMinutes === b.nightFadeMinutes &&
    a.sunriseTarget.every((value, index) => value === b.sunriseTarget[index]) &&
    a.daylightTarget.every((value, index) => value === b.daylightTarget[index]) &&
    a.eveningTarget.every((value, index) => value === b.eveningTarget[index])
  );

  const applyClockSettingsFromLocalConfig = (config: LampScheduleConfigV3) => {
    setOnTime(minutesToTime(config.onMinutes));
    setDaylightStartTime(minutesToTime(config.daylightStartMinutes));
    setEveningStartTime(minutesToTime(config.eveningStartMinutes));
    setOffTime(minutesToTime(config.offMinutes));
    setSunriseFadeMinutes(String(config.sunriseFadeMinutes));
    setDaylightFadeMinutes(String(config.daylightFadeMinutes));
    setEveningFadeMinutes(String(config.eveningFadeMinutes));
    setNightFadeMinutes(String(config.nightFadeMinutes));
    setScheduleSunriseTarget(clampScheduleTargets(config.sunriseTarget));
    setScheduleDaylightTarget(clampScheduleTargets(config.daylightTarget));
    setScheduleEveningTarget(clampScheduleTargets(config.eveningTarget));
  };

  const applyClockSettingsFromLocalState = (state: LocalLampScheduleState) => {
    applyClockSettingsFromLocalConfig(state.config);
    setTimerEnabled(state.timerEnabled);
  };

  const persistLampScheduleMap = async () => {
    try {
      await AsyncStorage.setItem(
        LAMP_SCHEDULE_STORAGE_KEY,
        JSON.stringify(meshLocalConfigByNodeRef.current)
      );
    } catch (err: any) {
      console.warn('[Schedule][LOCAL][SAVE_FAIL]', err?.message ?? String(err));
    }
  };

  const saveLocalLampScheduleState = (nodeId: string, state: LocalLampScheduleState) => {
    meshLocalConfigByNodeRef.current[nodeId] = state;
    void persistLampScheduleMap();
  };

  const currentUiConfig = (fallback?: LampScheduleConfigV3 | null): LampScheduleConfigV3 => ({
    onMinutes: clampNumber(timeToMinutes(onTime) ?? fallback?.onMinutes ?? 420, 0, 1439),
    sunriseFadeMinutes: clampNumber(Number.parseInt(sunriseFadeMinutes, 10) || fallback?.sunriseFadeMinutes || 0, 0, 720),
    daylightStartMinutes: clampNumber(timeToMinutes(daylightStartTime) ?? fallback?.daylightStartMinutes ?? 510, 0, 1439),
    daylightFadeMinutes: clampNumber(Number.parseInt(daylightFadeMinutes, 10) || fallback?.daylightFadeMinutes || 0, 0, 720),
    eveningStartMinutes: clampNumber(timeToMinutes(eveningStartTime) ?? fallback?.eveningStartMinutes ?? 1170, 0, 1439),
    eveningFadeMinutes: clampNumber(Number.parseInt(eveningFadeMinutes, 10) || fallback?.eveningFadeMinutes || 0, 0, 720),
    offMinutes: clampNumber(timeToMinutes(offTime) ?? fallback?.offMinutes ?? 1350, 0, 1439),
    nightFadeMinutes: clampNumber(Number.parseInt(nightFadeMinutes, 10) || fallback?.nightFadeMinutes || 0, 0, 720),
    sunriseTarget: clampScheduleTargets(scheduleSunriseTarget, fallback?.sunriseTarget),
    daylightTarget: clampScheduleTargets(scheduleDaylightTarget, fallback?.daylightTarget),
    eveningTarget: clampScheduleTargets(scheduleEveningTarget, fallback?.eveningTarget),
  });

  const updateScheduleTargetChannel = (phase: SchedulePhaseKey, index: number, rawValue: number) => {
    const value = clampNumber(Math.round(rawValue), 0, 100);
    markScheduleDirty();
    const update = (current: ScheduleChannelTargets): ScheduleChannelTargets => current.map((entry, channelIndex) => (
      channelIndex === index ? value : entry
    )) as ScheduleChannelTargets;
    if (phase === 'sunrise') setScheduleSunriseTarget(update);
    if (phase === 'daylight') setScheduleDaylightTarget(update);
    if (phase === 'evening') setScheduleEveningTarget(update);
  };

  const scheduleTargetForPhase = (phase: SchedulePhaseKey): ScheduleChannelTargets => (
    phase === 'sunrise' ? scheduleSunriseTarget : phase === 'daylight' ? scheduleDaylightTarget : scheduleEveningTarget
  );

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(LAMP_SCHEDULE_STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as PersistedLampScheduleMap;
        if (!parsed || typeof parsed !== 'object') return;
        const restored: Record<string, LocalLampScheduleState> = {};
        Object.entries(parsed).forEach(([nodeId, value]) => {
          if (!value || typeof value !== 'object' || !value.config) return;
          const config = normalizeScheduleConfigV3(value.config);
          if (!config) return;
          restored[nodeId] = {
            version: Number.isFinite(value.version) ? value.version & 0xff : 0,
            pendingVersion: typeof value.pendingVersion === 'number' && Number.isFinite(value.pendingVersion) ? value.pendingVersion & 0xff : undefined,
            synced: Boolean(value.synced),
            updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : Date.now(),
            timerEnabled: Boolean(value.timerEnabled),
            config,
          };
          meshConfigVersionByNodeRef.current[nodeId] = restored[nodeId].version;
        });
        meshLocalConfigByNodeRef.current = restored;
        console.log('[Schedule][LOCAL][RESTORE]', { lamps: Object.keys(restored).length });
      })
      .catch((err: any) => {
        console.warn('[Schedule][LOCAL][RESTORE_FAIL]', err?.message ?? String(err));
      })
      .finally(() => {
        if (active) setSchedulePersistenceReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const syncLampTime = async (key: string) => {
    if (!await authorizeLampCommand('canEditSettings')) return;
    const now = Date.now();
    const lastSync = lastTimeSyncRef.current[key] ?? 0;
    if (now - lastSync < TIME_SYNC_COOLDOWN_MS) return;
    if (timeSyncInFlightRef.current[key]) return;
    timeSyncInFlightRef.current[key] = true;
    try {
      const epochSeconds = Math.floor(now / 1000);
      if (meshEnabled) {
        const nodeId = selectedLampIdRef.current;
        if (nodeId) {
          await mesh.setTimeEpoch(nodeId, epochSeconds);
        }
      } else {
        await ble.setTimeEpoch(epochSeconds);
      }
      lastTimeSyncRef.current[key] = now;
      addMeshLog(`[TimeSync][PHONE_TO_G4] lamp=${key} unix=${epochSeconds}`, key);
    } catch (err: any) {
      const message = String(err?.message ?? err ?? '').toLowerCase();
      if (!message.includes('status request already in progress')) {
        log('time sync failed', err);
      }
      lastTimeSyncRef.current[key] = now - (TIME_SYNC_COOLDOWN_MS - TIME_SYNC_RETRY_BACKOFF_MS);
    } finally {
      timeSyncInFlightRef.current[key] = false;
    }
  };

  const syncProbeTime = async (nodeId: string) => {
    const node = meshNodesRef.current.find(candidate => candidate.id === nodeId);
    if (!node || node.nodeKind !== 'probe' || !node.connected ||
        lampHardwareIdentityRef.current[nodeId]?.state !== 'identified' ||
        lampHardwareIdentityRef.current[nodeId]?.deviceType !== 'probe' ||
        node.assignedGatewayId || node.assignedBridgeId) return;

    const generation = probeTimeGenerationRef.current[nodeId] ?? 0;
    if (probeTimeSentGenerationRef.current[nodeId] === generation ||
        probeTimeInFlightRef.current[nodeId]) return;
    const now = Date.now();
    if (now - (probeTimeLastAttemptRef.current[nodeId] ?? 0) < TIME_SYNC_RETRY_BACKOFF_MS) return;

    probeTimeLastAttemptRef.current[nodeId] = now;
    probeTimeInFlightRef.current[nodeId] = true;
    try {
      const epochSeconds = Math.floor(Date.now() / 1000);
      const ack = await mesh.setProbeTimeEpoch(nodeId, epochSeconds);
      // Only a matching application-level firmware ACK confirms synchronization.
      if ((probeTimeGenerationRef.current[nodeId] ?? 0) !== generation) return;
      probeTimeSentGenerationRef.current[nodeId] = generation;
      addMeshLog(ack
        ? `[ProbeTimeSync][ACK_CONFIRMED] probe=${nodeId} unix=${ack.epochSeconds} nonce=${ack.nonce}`
        : `[ProbeTimeSync][TX_OK_NOT_CONFIRMED] probe=${nodeId} unix=${epochSeconds}`,nodeId);
    } catch (error: any) {
      if ((probeTimeGenerationRef.current[nodeId] ?? 0) === generation) {
        addMeshLog(`[ProbeTimeSync][FAIL] probe=${nodeId} error=${error?.message ?? String(error)}`, nodeId);
      }
    } finally {
      // Do not let an old write clear a newer connection's in-flight guard.
      if ((probeTimeGenerationRef.current[nodeId] ?? 0) === generation) {
        probeTimeInFlightRef.current[nodeId] = false;
      }
    }
  };

  // Initial UTC synchronization is independent of schedule configuration.
  // Preserve the existing settings permission and confirmation path.
  useEffect(() => {
    if (!activeConnected || !canConfigureLamp) return;
    const key = meshEnabled ? selectedLampNode?.id : selectedDeviceId;
    if (key) void syncLampTime(key);
  }, [activeConnected, canConfigureLamp, meshEnabled, portalInventoryCached,
      selectedLampNode?.id, selectedDeviceId]);

  const setActiveTabSafe = (next: TabKey | ((prev: TabKey) => TabKey)) => {
    setActiveTab((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      activeTabRef.current = resolved;

      if (resolved === 'clock' && prev !== 'clock') {
        clearScheduleDirty();
        scheduleAutoFetchKeyRef.current = null;
        allowTimeSettingsUpdateRef.current = true;
        setTimeSettingsSet(false);

        if (meshEnabled) {
          const nodeId = selectedLampIdRef.current;
          if (nodeId) {
            const local = meshLocalConfigByNodeRef.current[nodeId];
            if (local?.config) {
              applyClockSettingsFromLocalState(local);
              allowTimeSettingsUpdateRef.current = false;
              setTimeSettingsSet(true);
              return resolved;
            }
          }
        }

        if (lampStatus) {
          applyTimeSettings(lampStatus);
          allowTimeSettingsUpdateRef.current = false;
          setTimeSettingsSet(true);
        }
      }

      if (resolved !== 'clock') {
        clearScheduleDirty();
        allowTimeSettingsUpdateRef.current = false;
        setTimeSettingsSet(false);
      }

      return resolved;
    });
  };

  const applyStatus = (nextStatus: LampStatus, source: 'read' | 'notify' | 'poll') => {
    const normalizedStatus: LampStatus = nextStatus;

    const now = Date.now();
    const pendingWrite = pendingWriteRef.current;
    const pendingWriteActive = pendingWrite && now - pendingWrite.sentAt < PENDING_WRITE_TIMEOUT_MS;
    const pendingWriteMatches =
      pendingWriteActive &&
      pendingWrite.intensity === normalizedStatus.intensity &&
      pendingWrite.hue === normalizedStatus.hue &&
      pendingWrite.pwmFreq === normalizedStatus.pwmFreq;
    const pendingWriteMatchesCore =
      pendingWriteActive &&
      pendingWrite.intensity === normalizedStatus.intensity &&
      pendingWrite.hue === normalizedStatus.hue;

    if (pendingWrite && !pendingWriteActive) {
      pendingWriteRef.current = null;
      if (saveState === 'saving') {
        setSaveState('idle');
      }
    }
    if (pendingWriteMatches) {
      pendingWriteRef.current = null;
      if (saveState === 'saving') {
        setSaveState('saved');
        if (saveStateTimer.current) {
          clearTimeout(saveStateTimer.current);
        }
        saveStateTimer.current = setTimeout(() => {
          setSaveState('idle');
        }, 1200);
      }
    }
    if (pendingWriteMatchesCore && saveState === 'saving') {
      pendingWriteRef.current = null;
      setSaveState('saved');
      if (saveStateTimer.current) {
        clearTimeout(saveStateTimer.current);
      }
      saveStateTimer.current = setTimeout(() => {
        setSaveState('idle');
      }, 1200);
    }

    const pendingPower = pendingPowerRef.current;
    const pendingPowerActive = pendingPower && now - pendingPower.sentAt < PENDING_WRITE_TIMEOUT_MS;
    const pendingPowerMatches = pendingPowerActive && pendingPower.value === normalizedStatus.power;
    if (pendingPower && (!pendingPowerActive || pendingPowerMatches)) {
      pendingPowerRef.current = null;
      setPendingPower(false);
    }

    setLampStatus(normalizedStatus);
    if (!normalizedStatus.lampTimeSynced && activeConnected) {
      const key = meshEnabled
        ? selectedLampIdRef.current ?? ''
        : selectedDeviceId ?? '';
      if (key) {
        syncLampTime(key);
      }
    }
    if (!(pendingPowerActive && !pendingPowerMatches)) {
      setPower(normalizedStatus.power);
    }
    const manual = normalizedStatus.manualControl;
    if (manual?.powerTargetActive && typeof manual.powerTargetWatts === 'number' && !pendingIntensityRef.current) {
      setIntensity(manual.powerTargetWatts);
      confirmedArcValuesRef.current.intensity = manual.powerTargetWatts;
      mainViewTargetPinnedRef.current = true;
    } else if (manual && !pendingIntensityRef.current && !mainViewTargetPinnedRef.current) {
      const requestedOutputWatts = manual.powerLimitWatts
        * Math.min(1, manual.requestedChannels.reduce((sum, value) => sum + Math.max(0, value), 0) / 100);
      setIntensity(requestedOutputWatts);
      confirmedArcValuesRef.current.intensity = requestedOutputWatts;
    }
    if (manual && !pendingHueRef.current) {
      const spectrum = spectrumPositionFromChannels(manual.appliedChannels);
      setHue(spectrum);
      confirmedArcValuesRef.current.hue = spectrum;
    }
    if (!(pendingWriteActive && !pendingWriteMatches)) {
      setPwmFreq(String(normalizedStatus.pwmFreq));
    }
    const inClock = activeTabRef.current === 'clock';
    if (!inClock) {
      if (meshEnabled) {
        const nodeId = selectedLampIdRef.current;
        const localState = nodeId ? meshLocalConfigByNodeRef.current[nodeId] : undefined;
        if (localState) {
          applyClockSettingsFromLocalState(localState);
        } else {
          applyTimeSettings(normalizedStatus);
        }
      } else {
        applyTimeSettings(normalizedStatus);
      }
    } else if (allowTimeSettingsUpdateRef.current && !scheduleDirtyRef.current) {
      if (meshEnabled) {
        const nodeId = selectedLampIdRef.current;
        const localState = nodeId ? meshLocalConfigByNodeRef.current[nodeId] : undefined;
        if (localState) {
          applyClockSettingsFromLocalState(localState);
        } else {
          applyTimeSettings(normalizedStatus);
        }
      } else {
        applyTimeSettings(normalizedStatus);
      }
      allowTimeSettingsUpdateRef.current = false;
      setTimeSettingsSet(true);
    }
    logTelemetry(source, normalizedStatus);
  };

  const reconcileConfigVersionFromTelemetry = (nodeId: string, nextStatus: LampStatus): number | null => {
    const rawVersion = typeof nextStatus.configVersion === 'number' ? nextStatus.configVersion : null;
    if (rawVersion === null) return null;

    const remoteVersion = rawVersion & 0xff;
    const local = meshLocalConfigByNodeRef.current[nodeId];
    const previousRemote = meshTelemetryVersionByNodeRef.current[nodeId];
    const baselineVersion =
      typeof previousRemote === 'number'
        ? previousRemote
        : typeof meshConfigVersionByNodeRef.current[nodeId] === 'number'
          ? meshConfigVersionByNodeRef.current[nodeId]
          : local?.version;

    // ARC config versions are uint8 values. Accept forward movement (including
    // 255 -> 0 wrap), but reject backwards/stale status frames. In practice a
    // short/legacy Lamp status can carry configVersion=0 between full v3/v4
    // frames; allowing that value to replace the known version made the UI
    // oscillate between 0 and 3 and repeatedly re-fetch Schedule.
    if (typeof baselineVersion === 'number' && remoteVersion !== baselineVersion) {
      const forwardDistance = (remoteVersion - baselineVersion + 256) & 0xff;
      if (forwardDistance >= 128) {
        console.log('[Schedule][VERSION][IGNORE_REGRESSION]', {
          nodeId,
          rawVersion: remoteVersion,
          knownVersion: baselineVersion,
        });
        return baselineVersion;
      }
    }

    meshTelemetryVersionByNodeRef.current[nodeId] = remoteVersion;
    setMeshTelemetryVersionByNode((prev) => {
      if (prev[nodeId] === remoteVersion) return prev;
      return { ...prev, [nodeId]: remoteVersion };
    });

    if (!local) {
      meshConfigVersionByNodeRef.current[nodeId] = remoteVersion;
      return remoteVersion;
    }

    if (typeof local.pendingVersion === 'number') {
      // Schema 3 confirmation is deliberately stricter than status telemetry.
      // A matching version bit in a normal telemetry frame is NOT enough: only
      // the full persisted 0x31 echo can clear pendingVersion after every timing
      // field, enabled flag and all 12 channel targets match exactly.
      const logKey = `${local.version}:${local.pendingVersion}:${remoteVersion}`;
      if (schedulePendingWaitLogKeyByNodeRef.current[nodeId] !== logKey) {
        schedulePendingWaitLogKeyByNodeRef.current[nodeId] = logKey;
        console.log('[Schedule][VERSION][PENDING_WAIT_FULL_ECHO]', {
          nodeId,
          remoteVersion,
          pendingVersion: local.pendingVersion,
          localVersion: local.version,
        });
      }
      return remoteVersion;
    }

    meshConfigVersionByNodeRef.current[nodeId] = Math.max(
      meshConfigVersionByNodeRef.current[nodeId] ?? 0,
      remoteVersion
    );

    if (remoteVersion !== local.version) {
      const forwardDistance = (remoteVersion - local.version + 256) & 0xff;
      if (forwardDistance > 0 && forwardDistance < 128) {
        const lastPrompted = meshUpdatePromptVersionByNodeRef.current[nodeId] ?? -1;
        if (remoteVersion !== lastPrompted) {
          meshUpdatePromptVersionByNodeRef.current[nodeId] = remoteVersion;
          if (selectedMeshNodeIdRef.current === nodeId) {
            setMeshStatus(`Node has newer settings version v${remoteVersion}. Pull updates before editing.`);
          }
        }
      }
    }

    return remoteVersion;
  };

  useEffect(() => {
    if (meshEnabled) {
      addMeshLog(meshStatus, selectedMeshNodeIdRef.current);
    }
  }, [addMeshLog, meshEnabled, meshStatus]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let pollInFlight = false;

    const run = async () => {
      if (meshEnabled) return;
      if (!connected) return;
      try {
        const initial = await ble.readStatus();
        if (!cancelled && initial) {
          applyStatus(initial, 'read');
        }
      } catch (err) {
        // ignore read errors
      }

      try {
        unsubscribe = await ble.subscribeStatus((nextStatus) => {
          if (cancelled) return;
          applyStatus(nextStatus, 'notify');
        });
      } catch (err) {
        // notifications not supported
      }

      pollTimer = setInterval(async () => {
        if (cancelled || pollInFlight) return;
        pollInFlight = true;
        try {
          const polled = await ble.readStatus();
          if (!cancelled && polled) {
            applyStatus(polled, 'poll');
          }
        } catch (err) {
          log('poll read failed', err);
        } finally {
          pollInFlight = false;
        }
      }, TELEMETRY_POLL_MS);
    };

    run();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      unsubscribe?.();
    };
  }, [ble, connected, meshEnabled]);

  useEffect(() => {
    selectedMeshNodeIdRef.current = meshSelectedNodeId;
  }, [meshSelectedNodeId]);

  useEffect(() => {
    selectedLampIdRef.current = selectedLampId;
    pendingPowerRef.current = null;
    pendingWriteRef.current = null;
    pendingIntensityRef.current = false;
    pendingHueRef.current = false;
    setPendingPower(false);
    setSaveState('idle');
  }, [selectedLampId]);

  useEffect(() => {
    let cancelled = false;
    const loadNodes = async () => {
      const [stored, storedArcRegistry, storedLampId] = await Promise.all([
        loadMeshNodes(),
        loadArcDeviceRegistry(),
        loadSelectedLampId(),
      ]);
      if (!cancelled) {
        // Older builds intentionally discarded the in-node telemetry cache on
        // launch.  Recover the most recent durable Probe sample as a fallback
        // so a sleepy child has useful values before its next wake window.
        const recentProbeRecords = await loadRecentProbeLogRecords({ limit: 500 });
        if (cancelled) return;
        const latestProbeSnapshot = new Map<string, ProbeSensorStatus>();
        for (const record of recentProbeRecords) {
          if (latestProbeSnapshot.has(record.probeId)) continue;
          latestProbeSnapshot.set(record.probeId, {
            ...record.raw.snapshot,
            updatedAt: record.raw.snapshot.updatedAt ?? record.timeline.receivedAtMs,
            source: record.raw.snapshot.source ?? record.source ?? null,
          });
        }
        const restored = stored.map((node) => {
          const cachedProbeStatus = node.nodeKind === 'probe' ? latestProbeSnapshot.get(node.id) ?? null : null;
          if (!cachedProbeStatus || node.probeStatus) return node;
          return {
            ...node,
            probeStatus: cachedProbeStatus,
            lastSeen: node.lastSeen ?? cachedProbeStatus.updatedAt ?? undefined,
          };
        });
        const recoveredCount = restored.filter((node, index) => !stored[index].probeStatus && Boolean(node.probeStatus)).length;
        if (recoveredCount) console.log(`[ProbeCache][RESTORE] recovered=${recoveredCount}`);
        setMeshNodes(restored);
        setArcRegistrySeed(storedArcRegistry);
        const storedLamps = restored.filter(isCurrentArcLamp);
        const restoredLamp = storedLamps.find((node) => node.id === storedLampId) ?? storedLamps[0] ?? null;
        setSelectedLampId(restoredLamp?.id ?? null);
        setLampSelectionReady(true);
        setMeshPersistenceReady(true);
        if (!meshSelectedNodeId) {
          setMeshSelectedNodeId(restored.find(node => !isLegacyMeshNode(node))?.id ?? null);
        }
      }
    };
    loadNodes();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!meshPersistenceReady) return;
    void saveMeshNodes(meshNodes);
  }, [meshNodes, meshPersistenceReady]);

  useEffect(() => {
    if (!meshPersistenceReady) return;
    const durable = new Map(arcRegistrySeed.map(entry => [entry.id, entry]));
    arcRegistry.forEach(entry => durable.set(entry.id, entry));
    void saveArcDeviceRegistry([...durable.values()]);
  }, [arcRegistry, arcRegistrySeed, meshPersistenceReady]);

  useEffect(() => {
    if (!schedulePersistenceReady || !meshEnabled || !selectedLampNode?.id) return;
    if (activeTabRef.current === 'clock' && scheduleDirtyRef.current) return;
    const local = meshLocalConfigByNodeRef.current[selectedLampNode.id];
    if (!local) return;
    applyClockSettingsFromLocalState(local);
    if (activeTabRef.current === 'clock') setTimeSettingsSet(true);
  }, [schedulePersistenceReady, meshEnabled, selectedLampNode?.id]);

  useEffect(() => {
    if (!lampSelectionReady) return;
    void saveSelectedLampId(selectedLampId).catch((err) => log('selected lamp persistence failed', err));
  }, [lampSelectionReady, selectedLampId]);

  useEffect(() => {
    if (!meshEnabled || !meshPersistenceReady) return;
    let cancelled = false;
    setMeshTransportReady(false);

    const mergeNodes = (incoming: MeshNode[]) => {
      setMeshNodes((prev) => {
        const byId = new Map(prev.map((node) => [node.id, node]));
        const merged = incoming.filter(node => !isLegacyMeshNode(node)).map((node) => {
          const existing = byId.get(node.id);
          return {
            ...node,
            name: existing?.name ?? node.name,
            abbreviation: existing?.abbreviation ?? node.abbreviation,
            color: existing?.color ?? node.color,
            nodeKind: existing?.nodeKind ?? node.nodeKind ?? inferMeshNodeKind(node.name),
            staticOobHex: existing?.staticOobHex ?? null,
            status: existing?.status ?? node.status,
            probeStatus: existing?.probeStatus ?? node.probeStatus ?? null,
            assignedGatewayId: existing?.assignedGatewayId ?? node.assignedGatewayId ?? null,
            assignedBridgeId: existing?.assignedBridgeId ?? node.assignedBridgeId ?? null,
            probeGatewayRoute: existing?.probeGatewayRoute ?? node.probeGatewayRoute ?? null,
            probeActiveTelemetryRoute: existing?.probeActiveTelemetryRoute ?? node.probeActiveTelemetryRoute ?? null,
            probePowerRole: existing?.probePowerRole ?? node.probePowerRole ?? null,
            gatewayChildState: existing?.gatewayChildState ?? node.gatewayChildState ?? null,
            lastSeenViaGatewayAt: existing?.lastSeenViaGatewayAt ?? node.lastSeenViaGatewayAt ?? null,
            lastSeenViaLampAt: existing?.lastSeenViaLampAt ?? node.lastSeenViaLampAt ?? null,
            lastDirectBleSeenAt: existing?.lastDirectBleSeenAt ?? node.lastDirectBleSeenAt ?? null,
            connected: node.connected ?? existing?.connected ?? false,
            lastKnownConnected: node.connected ?? existing?.lastKnownConnected ?? false,
            blePeripheralId: node.blePeripheralId ?? existing?.blePeripheralId ?? null,
            metadataUpdatedAt: Date.now(),
          };
        });
        const existingIds = new Set(merged.map((node) => node.id));
        const preserved = prev.filter((node) => !existingIds.has(node.id));
        return [...merged, ...preserved];
      });
    };

    const run = async () => {
      setMeshStatus('Initializing ARC transport...');
      if (!mesh.isAvailable) {
        setMeshStatus('ARC native transport module not available.');
        return;
      }
      try {
        await mesh.initialize();
        const provisioned = await mesh.listProvisionedNodes();
        if (cancelled) return;
        mergeNodes(
          provisioned.map((node) => ({
            ...node,
            nodeKind: node.nodeKind ?? inferMeshNodeKind(node.name),
            name: node.name || 'Lamp',
            abbreviation: node.abbreviation || 'LP',
            color: node.color || '#22c55e',
            provisioned: true,
            connected: node.connected ?? false,
          }))
        );
        const preferredLamp = meshNodesRef.current.find(
          (node) => node.id === selectedLampIdRef.current && isCurrentArcLamp(node)
        ) ?? meshNodesRef.current.find(isCurrentArcLamp) ?? null;
        if (preferredLamp && Platform.OS !== 'android') {
          setMeshStatus(`Reconnecting ${preferredLamp.name} locally...`);
          await mesh.connectNode(preferredLamp.id);
        }
        if (!cancelled) {
          setMeshTransportReady(true);
          setMeshStatus('ARC transport ready');
        }
      } catch (err: any) {
        if (!cancelled) {
          setMeshStatus(`ARC transport init failed: ${err?.message ?? String(err)}`);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      meshNodesRef.current.filter(node => !isLegacyMeshNode(node)).forEach(node => {
        void mesh.disconnectNode(node.id).catch(() => undefined);
      });
    };
  }, [mesh, meshEnabled, meshPersistenceReady]);

  // Native initialization must NOT connect an unassociated BLE MAC. After
  // transport, owner-linked aliases and fresh grants are ready, reconnect one
  // previously saved Lamp exactly once per app session. Manual disconnect stays
  // manual; a later app launch retries automatically.
  useEffect(() => {
    if (Platform.OS !== 'android' || !meshEnabled || !mesh.isAvailable || !meshTransportReady ||
        !arcCloudSession.userId || ownerLinksAccount !== arcCloudSession.userId) return;
    const candidates = meshNodes.filter(node => isCurrentArcLamp(node) && !node.connected && Boolean(node.canonicalDeviceId&&portalDevices.some(device=>device.id===node.canonicalDeviceId)));
    const selected = candidates.find(node => node.id === selectedLampId) ?? candidates[0];
    if (!selected) return;
    const key = `${arcCloudSession.userId}:${ownerLinkKey(selected)}`;
    if (autoReconnectAttemptedRef.current.has(key)) return;
    autoReconnectAttemptedRef.current.add(key);
    setMeshStatus(`Reconnecting previously associated ${selected.name}...`);
    void mesh.connectNode(selected.id).catch(err => {
      console.log(`[ArcIdentity][RECONNECT_FAIL] mac=${selected.id} error=${err?.message ?? String(err)}`);
      setMeshStatus(`Auto reconnect failed: ${err?.message ?? String(err)}`);
    });
  }, [mesh, meshEnabled, meshTransportReady, meshNodes, selectedLampId,
      arcCloudSession.userId, ownerLinksAccount, portalDevices, portalInventoryCached, activeOwnerLinks]);

  useEffect(() => {
    if (!meshEnabled || !mesh.isAvailable) return;
    const findGatewayForConfirmation = (nodes: MeshNode[], gatewayNodeId: string, confirmation: ArcProbeGatewayChildConfirmation) => {
      const gatewayById = nodes.find((node) => node.id === gatewayNodeId) ?? null;
      if (gatewayById) return gatewayById;
      if (confirmation.gatewayAddress !== 0) {
        const gatewayByAddress = nodes.find((node) => node.unicastAddress === confirmation.gatewayAddress) ?? null;
        if (gatewayByAddress) return gatewayByAddress;
      }
      return null;
    };
    const probeMatchesConfirmation = (
      node: MeshNode,
      gateway: MeshNode | null,
      confirmation: ArcProbeGatewayChildConfirmation,
      assignedCandidates: MeshNode[]
    ) => {
      if (node.nodeKind !== 'probe') return false;
      if (confirmation.probeSourceAddress !== 0 && node.unicastAddress === confirmation.probeSourceAddress) return true;
      if (assignedCandidates.length !== 1) return false;
      return Boolean(gateway && node.assignedGatewayId === gateway.id && assignedCandidates[0].id === node.id);
    };
    type RoutedHistoryHint = { probeId: string; snapshot: ProbeSensorStatus; seenAt: number };
    const routedHistoryKickTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const routedHistoryHints = new Map<string, RoutedHistoryHint>();
    let requestRoutedHistorySync: ((lampId: string, probeId: string, snapshot: ProbeSensorStatus, seenAt: number) => void) | null = null;
    const unsubscribeTelemetry = mesh.subscribeTelemetry((nodeId, nextStatus, nativeProbeStatus) => {
      const currentNode = meshNodesRef.current.find((node) => node.id === nodeId) ?? null;
      const isProbeNode = (currentNode?.nodeKind ?? null) === 'probe';
      const isLampNode = (currentNode?.nodeKind ?? null) === 'lamp';
      const receivedAt = Date.now();
      const telemetryProbeStatus = isProbeNode
        ? nativeProbeStatus ?? buildProbeStatusFromLegacyTelemetry(nextStatus)
        : null;
      const lampProbeCandidates = isLampNode && nativeProbeStatus
        ? meshNodesRef.current.filter(
            (node) => node.nodeKind === 'probe' && node.provisioned && node.assignedBridgeId === nodeId
          )
        : [];
      const lampProbeNode = lampProbeCandidates.length === 1 ? lampProbeCandidates[0] : null;

      if (isLampNode && probeLoggingSettingsRef.current.loggingEnabled) {
        const localPolicy = probeLoggingSettingsRef.current;
        void appendLampOperationalRecord(nodeId, nextStatus, receivedAt, {
          retentionDays: localPolicy.retentionDays,
          storageBudgetMb: localPolicy.storageBudgetMb,
        })
          .then((stored) => {
            if (!stored) return;
            console.log(`[LampTelemetry][LOCAL_OK] lamp=${nodeId} receivedAtMs=${receivedAt} recordType=lamp_operational`);
            if (probeLoggingViewsOpenRef.current && selectedLampIdRef.current === nodeId) {
              queueGraphLiveRefresh({ lampId: nodeId });
            }
          })
          .catch((error: any) => console.log(`[LampTelemetry][LOCAL_FAIL] lamp=${nodeId} error=${error?.message ?? String(error)}`));
      }

      reconcileConfigVersionFromTelemetry(nodeId, nextStatus);
      const fan = nextStatus.fan;
      const previousFanUi = meshFanUiTelemetryByNodeRef.current[nodeId];
      const fanControlChanged = Boolean(
        fan && (!previousFanUi ||
          fan.automatic !== previousFanUi.automatic ||
          fan.rpmControl !== previousFanUi.rpmControl ||
          fan.targetRpm !== previousFanUi.targetRpm)
      );
      const commitFanUi = !fan || isProbeNode || fanControlChanged ||
        receivedAt - (previousFanUi?.at ?? 0) >= 500;
      if (fan && commitFanUi) {
        meshFanUiTelemetryByNodeRef.current[nodeId] = {
          at: receivedAt,
          automatic: fan.automatic,
          rpmControl: fan.rpmControl,
          targetRpm: fan.targetRpm,
        };
      }
      if (!commitFanUi) return;
      setMeshNodes((prev) =>
        prev.map((node) => {
          if (lampProbeNode && nativeProbeStatus && node.id === lampProbeNode.id) {
            return {
              ...node,
              assignedBridgeId: nodeId,
              probeStatus: mergeProbeStatus(node.probeStatus, nativeProbeStatus),
              lastSeen: receivedAt,
              lastSeenViaLampAt: receivedAt,
              probeActiveTelemetryRoute: 'viaLamp',
              probePowerRole: 'sleepyChild',
              gatewayChildState: 'recent',
            };
          }
          if (node.id !== nodeId) return node;
          const seenAt = receivedAt;
          const probeStatus =
            node.nodeKind === 'probe'
              ? nativeProbeStatus
                ? mergeProbeStatus(node.probeStatus, nativeProbeStatus)
                : node.probeStatus ?? buildProbeStatusFromLegacyTelemetry(nextStatus)
              : node.probeStatus ?? null;
          const assignedProbeRoute = node.assignedGatewayId
            ? 'viaGateway' as const
            : node.assignedBridgeId
              ? 'viaLamp' as const
              : null;
          const directProbeTelemetryActive = node.nodeKind === 'probe' && Boolean(nativeProbeStatus) && !assignedProbeRoute;
          return {
            ...node,
            // A decoded frame is stronger evidence of a live app-facing link
            // than cached UI state or a missed CoreBluetooth connection event.
            connected: true,
            provisioned: true,
            blePeripheralId: node.blePeripheralId ?? node.id,
            lastKnownConnected: true,
            status: nextStatus,
            probeStatus,
            lastSeen: seenAt,
            lastDirectBleSeenAt: node.nodeKind === 'probe' && nativeProbeStatus ? seenAt : node.lastDirectBleSeenAt ?? null,
            lastSeenViaGatewayAt: node.nodeKind === 'probe' && node.probeActiveTelemetryRoute === 'viaGateway' && !nativeProbeStatus ? seenAt : node.lastSeenViaGatewayAt ?? null,
            lastSeenViaLampAt: node.nodeKind === 'probe' && node.probeActiveTelemetryRoute === 'viaLamp' && !nativeProbeStatus ? seenAt : node.lastSeenViaLampAt ?? null,
            probeActiveTelemetryRoute: assignedProbeRoute ?? (directProbeTelemetryActive ? 'direct' : node.probeActiveTelemetryRoute ?? null),
            probePowerRole: assignedProbeRoute ? 'sleepyChild' : directProbeTelemetryActive ? 'activeBle' : node.probePowerRole ?? null,
            gatewayChildState: assignedProbeRoute
              ? node.gatewayChildState ?? 'unknown'
              : directProbeTelemetryActive
                ? null
              : node.nodeKind === 'probe' && (node.probeActiveTelemetryRoute === 'viaGateway' || node.probeActiveTelemetryRoute === 'viaLamp')
                ? 'recent'
                : node.gatewayChildState ?? null,
          };
        })
      );
      // Only a standalone/direct Probe owns app-side live telemetry history.
      // A Probe assigned to a Lamp is a sleepy Thread child: its routed live
      // frame updates the UI, while durable history must come back through the
      // Lamp G4 FRAM path with the authoritative RTC timestamp + sequence.
      if (telemetryProbeStatus && currentNode && !currentNode.assignedGatewayId && !currentNode.assignedBridgeId) {
        queueProbeLogRecord(nodeId, telemetryProbeStatus);
      }
      if (selectedLampIdRef.current === nodeId) {
        applyStatus(nextStatus, 'notify');
        setConnected(true);
      }
    });
    const applyBridgeProbeTelemetry = (bridgeNodeId: string, probeStatus: ProbeSensorStatus) => {
      const seenAt = Date.now();
      const currentNodes = meshNodesRef.current;
      const bridge = currentNodes.find((node) => node.id === bridgeNodeId) ?? null;
      // The Probe's own Loader TX also carries the full 0x51 frame while it
      // is in standalone/direct mode. That is direct Probe telemetry, not a
      // gateway frame whose bridge ID needs matching to another node.
      if (bridge?.nodeKind === 'probe') {
        // The first admitted Direct BLE telemetry provides the send opportunity.
        // In-flight and connection-generation guards prevent per-second resends.
        if (!bridge.assignedGatewayId && !bridge.assignedBridgeId) {
          if(probeStatus.sampleTimePresent&&probeStatus.timestampValid===false)delete probeTimeSentGenerationRef.current[bridgeNodeId];
          void syncProbeTime(bridgeNodeId);
        }
        console.log(`[ProbeDirect][0x51][APPLY] probe=${bridgeNodeId}`);
        setMeshNodes((prev) => prev.map((node) =>
          node.id === bridgeNodeId
            ? {
                ...node,
                connected: true,
                lastKnownConnected: true,
                probeStatus: mergeProbeStatus(node.probeStatus, probeStatus),
                lastSeen: seenAt,
                lastDirectBleSeenAt: seenAt,
                probeActiveTelemetryRoute: node.assignedGatewayId || node.assignedBridgeId
                  ? node.probeActiveTelemetryRoute ?? 'none'
                  : 'direct',
                probePowerRole: node.assignedGatewayId || node.assignedBridgeId
                  ? node.probePowerRole ?? 'unknown'
                  : 'activeBle',
              }
            : node
        ));
        // Keep app-side live logging only for a true standalone/direct Probe.
        // If it is assigned to a Lamp/Gateway, routed history ownership stays
        // with that route instead of creating phone-timestamped history here.
        if (!bridge.assignedGatewayId && !bridge.assignedBridgeId) {
          queueProbeLogRecord(bridgeNodeId, probeStatus);
        }
        return;
      }
      if (!bridge || (bridge.nodeKind !== 'gateway' && bridge.nodeKind !== 'lamp')) {
        console.log(`[ProbeRoute][TELEMETRY][UNMATCHED] bridge=${bridgeNodeId} reason=bridge-node-missing-or-unsupported`);
        return;
      }
      const explicitlyAssigned = currentNodes.filter((node) =>
        node.nodeKind === 'probe' && (
          bridge.nodeKind === 'gateway'
            ? node.assignedGatewayId === bridge.id
            : node.assignedBridgeId === bridge.id
        )
      );
      const matchedProbe = explicitlyAssigned.length === 1 ? explicitlyAssigned[0] : null;
      if (!matchedProbe) {
        console.log(
          `[ProbeRoute][TELEMETRY][UNMATCHED] bridge=${bridgeNodeId} kind=${bridge.nodeKind} explicit=${explicitlyAssigned.length}`
        );
        return;
      }
      if(probeStatus.sampleTimePresent){
        const binding=hardwareBindingsRef.current.find(item=>item.hardwareUid===probeStatus.sampleHardwareUid);
        if(!binding||binding.arcDeviceId!==(matchedProbe.canonicalDeviceId??matchedProbe.id)){
          console.log(`[ProbeSampleTime][SOURCE_MISMATCH] bridge=${bridgeNodeId}`);return;
        }
      }
      const route = bridge.nodeKind === 'gateway' ? 'viaGateway' as const : 'viaLamp' as const;
      console.log(`[ProbeRoute][TELEMETRY][APPLY] bridge=${bridgeNodeId} probe=${matchedProbe.id} route=${route}`);
      setMeshNodes((prev) => {
        return prev.map((node) =>
          node.id === matchedProbe.id
            ? {
                ...node,
                assignedGatewayId: bridge.nodeKind === 'gateway' ? bridge.id : node.assignedGatewayId ?? null,
                assignedBridgeId: bridge.nodeKind === 'lamp' ? bridge.id : node.assignedBridgeId ?? null,
                probeStatus: mergeProbeStatus(node.probeStatus, probeStatus),
                lastSeen: seenAt,
                lastSeenViaGatewayAt: route === 'viaGateway' ? seenAt : node.lastSeenViaGatewayAt ?? null,
                lastSeenViaLampAt: route === 'viaLamp' ? seenAt : node.lastSeenViaLampAt ?? null,
                probeActiveTelemetryRoute: route,
                probePowerRole: 'sleepyChild',
                gatewayChildState: 'recent',
              }
            : node
        );
      });
      // Lamp-routed Probe telemetry is live UI state only. Durable history for
      // a Lamp-owned sleepy child is written by the G4 to FRAM and imported by
      // HistorySync with its authoritative edge timestamp + physical sequence.
      // Treat a routed live frame as a hint that FRAM probably advanced: kick a
      // short, permission-gated HistorySync pass instead of creating a separate
      // phone-timestamped history record. Gateway routing keeps its existing
      // persistence semantics.
      if (route === 'viaGateway') {
        queueProbeLogRecord(matchedProbe.id, probeStatus);
      } else {
        requestRoutedHistorySync?.(bridge.id, matchedProbe.id, probeStatus, seenAt);
      }
    };
    const repairProbeGatewayRoute = (
      pendingProbe: MeshNode,
      currentGateway: MeshNode,
      reason: string,
      sequence: number
    ) => {
      const repairKey = `${pendingProbe.id}:${currentGateway.id}:policy0-thread-seen`;
      if (probeRouteRepairKeysRef.current.has(repairKey)) return;

      if (Platform.OS === 'android' && (!canConnectLocalNode(pendingProbe) || !canConnectLocalNode(currentGateway))) return;
      probeRouteRepairKeysRef.current.add(repairKey);
      console.log(
        `[ProbeRoute][REPAIR][BEGIN] probe=${pendingProbe.id} gateway=${currentGateway.id} reason=${reason} seq=${sequence}`
      );
      addMeshLog(`repairing Probe Gateway route-set for ${pendingProbe.name}`, pendingProbe.id);
      mesh
        .configureProbeGatewayRoute(pendingProbe.id, currentGateway.id)
        .then((routeResult) => {
          console.log(`[ProbeRoute][REPAIR][RESULT] probe=${pendingProbe.id} gateway=${currentGateway.id} result=${JSON.stringify(routeResult)}`);
          setMeshNodes((prev) =>
            prev.map((node) =>
              node.id === pendingProbe.id
                ? {
                    ...node,
                    assignedGatewayId: currentGateway.id,
                    probeGatewayRoute: {
                      gatewayId: currentGateway.id,
                      state: routeResult.state,
                      updatedAt: Date.now(),
                      detail: routeResult.detail,
                    },
                    probeActiveTelemetryRoute: node.connected ? 'direct' : node.probeActiveTelemetryRoute ?? 'none',
                    probePowerRole: node.connected ? 'activeBle' : node.probePowerRole ?? 'unknown',
                    gatewayChildState: node.connected ? null : node.gatewayChildState ?? 'unknown',
                  }
                : node
            )
          );
          addMeshLog(routeResult.detail, pendingProbe.id);
        })
        .catch((err: any) => {
          const detail = `Probe Gateway route repair failed: ${err?.message ?? String(err)}`;
          console.log(`[ProbeRoute][REPAIR][FAIL] probe=${pendingProbe.id} gateway=${currentGateway.id} error=${err?.message ?? String(err)}`);
          setMeshNodes((prev) =>
            prev.map((node) =>
              node.id === pendingProbe.id
                ? {
                    ...node,
                    probeGatewayRoute: {
                      gatewayId: currentGateway.id,
                      state: 'failed',
                      updatedAt: Date.now(),
                      detail,
                    },
                  }
                : node
            )
          );
          addMeshLog(detail, pendingProbe.id);
        });
    };
    const unsubscribeProbeGatewayConfirmation = mesh.subscribeProbeGatewayConfirmation((gatewayNodeId, confirmation) => {
      const seenAt = Date.now();
      const currentNodes = meshNodesRef.current;
      const currentGateway = findGatewayForConfirmation(currentNodes, gatewayNodeId, confirmation);
      const currentAssignedCandidates = currentGateway
        ? currentNodes.filter((node) => node.nodeKind === 'probe' && node.assignedGatewayId === currentGateway.id)
        : [];
      const pendingProbe = currentAssignedCandidates.find((node) =>
        probeMatchesConfirmation(node, currentGateway, confirmation, currentAssignedCandidates)
      ) ?? null;

      if (
        pendingProbe &&
        currentGateway &&
        !confirmation.confirmed &&
        confirmation.telemetryReceived &&
        confirmation.observedProbeRolePolicy === 0
      ) {
        repairProbeGatewayRoute(pendingProbe, currentGateway, 'thread-policy-0', confirmation.lastProbeSequence);
      }

      setMeshNodes((prev) => {
        const gateway = findGatewayForConfirmation(prev, gatewayNodeId, confirmation);
        const assignedCandidates = gateway
          ? prev.filter((node) => node.nodeKind === 'probe' && node.assignedGatewayId === gateway.id)
          : [];
        let matchedProbeName = '';
        const next = prev.map((node) => {
          if (!probeMatchesConfirmation(node, gateway, confirmation, assignedCandidates)) return node;
          matchedProbeName = node.name;
          if (!confirmation.confirmed) {
            return {
              ...node,
              gatewayChildState: confirmation.childState,
              probeGatewayRoute: {
                gatewayId: node.assignedGatewayId ?? gateway?.id ?? null,
                state: 'config-requested' as const,
                updatedAt: seenAt,
                detail: `Gateway saw Probe telemetry but child role is not confirmed yet.`,
              },
            };
          }
          return {
            ...node,
            assignedGatewayId: node.assignedGatewayId ?? gateway?.id ?? null,
            probeGatewayRoute: {
              gatewayId: node.assignedGatewayId ?? gateway?.id ?? null,
              state: 'config-requested' as const,
              updatedAt: seenAt,
              detail: `Gateway confirmed Probe child role at sequence ${confirmation.lastProbeSequence}.`,
            },
            probeActiveTelemetryRoute: 'viaGateway' as const,
            probePowerRole: 'sleepyChild' as const,
            gatewayChildState: confirmation.childState,
            lastSeenViaGatewayAt: seenAt,
          };
        });
        if (matchedProbeName) {
          addMeshLog(
            confirmation.confirmed
              ? `Gateway confirmed ${matchedProbeName} child route seq=${confirmation.lastProbeSequence}`
              : `Gateway has ${matchedProbeName} telemetry but child confirmation is pending`,
            gateway?.id ?? gatewayNodeId
          );
        }
        return next;
      });
    }, applyBridgeProbeTelemetry, (gatewayNodeId: string, gatewayStatus: ArcGatewayDebugStatus) => {
      if (gatewayStatus.threadRxCount === 0 || gatewayStatus.observedProbeRolePolicy !== 0) return;

      const currentNodes = meshNodesRef.current;
      const currentGateway = currentNodes.find((node) => node.id === gatewayNodeId) ?? null;
      if (!currentGateway) return;

      const assignedCandidates = currentNodes.filter((node) => node.nodeKind === 'probe' && node.assignedGatewayId === currentGateway.id);
      if (assignedCandidates.length !== 1) return;

      repairProbeGatewayRoute(assignedCandidates[0], currentGateway, 'thread-policy-0', gatewayStatus.threadRxLastSequence);
    });
    const historyQueues = new Map<string, Promise<void>>();
    const historyRequestPhases = new Map<string, HistoryRequestPhase>();
    const productionHistoryLeases = new Map<string, number>();
    // Hardware limits one request to 32 records. Do not add a 60-second delay
    // between successful batches: stream successive bounded requests immediately.
    const HISTORY_BATCH_LIMIT = 32;
    const HISTORY_PASS_RECORD_LIMIT = 256;
    const historyIdentityBlocks = new Map<string, BlockedProbeHistory>();
    const historyDrains = new Map<string, {
      startedAt: number;
      requestedAfter: number;
      downloaded: number;
      head: number;
      batchThrough: number;
      userId: string;
      mappingCount: number;
      probeIntervalSeconds: number;
      framOldest: number;
      cloudEnabled: boolean;
    }>();
    const historyIdentityWitnesses = new Map<string, {
      probeId: string;
      snapshot: ProbeSensorStatus;
      seenAt: number;
      requestedAfter: number;
      scanned: number;
      head: number;
      drainAfter: number;
      recoveryHead: number;
      framOldest: number;
      cloudEnabled: boolean;
      userId: string;
      mappingCount: number;
      probeIntervalSeconds: number;
    }>();
    const historyProbeBindings = new Map<string, Map<number, string>>();
    const historyStarts = new Map<string, string>();
    const historyCloudEpochSuspects = new Map<string, { userId: string; cloudHead: number }>();
    const historyFreshStatusRetries = new Map<string, number>();
    const historySkipLoggedAt = new Map<string, number>();
    const logHistorySyncSkip = (lampId: string, reason: string) => {
      const key = `${lampId}:${reason}`;
      const now = Date.now();
      if (now - (historySkipLoggedAt.get(key) ?? 0) < 15_000) return;
      historySkipLoggedAt.set(key, now);
      addMeshLog(`[HistorySync][SKIP] lamp=${lampId} reason=${reason}`, lampId);
    };
    const historyStatusTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
    const historyRecordTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
    let historySubscriptionsActive = true;
    const historyProbeRecordMatchesHint = (record: ArcProbeHistoryRecord, hint: RoutedHistoryHint) => {
      // G4 FRAM is the authoritative durable history source. The routed live
      // frame is used only to associate the current canonical Probe with a nearby
      // G4 probe_index. Do not re-validate accepted FRAM data by comparing
      // quantized sensor values against the live 0x51 frame.
      //
      // Keep one broad correlation guard so an older historical Probe record is
      // not accidentally bound to the current routed Probe.
      if (!record.timestampValid) return false;
      return Math.abs(record.unixTimeSeconds * 1000 - hint.seenAt) <= 120_000;
    };
    const clearHistoryStatusTimeout = (lampId: string) => {
      const timer = historyStatusTimeouts.get(lampId);
      if (timer) clearTimeout(timer);
      historyStatusTimeouts.delete(lampId);
    };
    const releaseIdleHistoryOwner = (lampId: string) => {
      const lease = productionHistoryLeases.get(lampId);
      if (lease !== undefined && !historyStarts.has(lampId) && !historyDrains.has(lampId) && !historyIdentityWitnesses.has(lampId))
        historyOwner.releaseProduction(lampId, lease);
    };
    const scheduleIdleHistoryRelease = (lampId: string) => {
      void (historyQueues.get(lampId) ?? Promise.resolve()).finally(() => releaseIdleHistoryOwner(lampId));
    };
    const queueHistoryWork = (lampId: string, work: () => Promise<void>) => {
      const next = (historyQueues.get(lampId) ?? Promise.resolve())
        .catch(() => undefined)
        .then(work)
        .catch((error: any) => {
          clearHistoryStatusTimeout(lampId);
          historyStarts.delete(lampId);
          stopHistoryDrain(lampId);
          addMeshLog(`[HistorySync][FAIL] lamp=${lampId} stage=workflow error=${error?.message ?? String(error)}`, lampId);
        });
      historyQueues.set(lampId, next.finally(() => releaseIdleHistoryOwner(lampId)));
    };
    const queueHistoryRecordWork = (lampId: string, record: { sequence: number } | null, work: () => Promise<void>, sourceGeneration?: number) => {
      const phase = historyRequestPhases.get(lampId);
      const callback = phase?.capture(record);
      if (callback && sourceGeneration !== undefined && callback.generation !== sourceGeneration) callback.oldPhase = true;
      queueHistoryWork(lampId, async () => {
        if (phase && callback && !phase.owns(callback)) {
          // Remaining records in an aborted batch were already in flight.
          // Logging each one is noise, especially when an identity grant is
          // blocking recovery. Keep other phase-isolation diagnostics intact.
          if (!historyIdentityBlocks.has(lampId))
            addMeshLog(`[HistorySync][STALE] lamp=${lampId} seq=${record?.sequence ?? 'empty'} reason=old_phase`, lampId);
          return;
        }
        await work();
      });
    };
    const stopHistoryDrain = (lampId: string, preserveWitnesses = false) => {
      historyRequestPhases.get(lampId)?.stop(preserveWitnesses);
      const timer = historyRecordTimeouts.get(lampId);
      if (timer) clearTimeout(timer);
      historyRecordTimeouts.delete(lampId);
      historyDrains.delete(lampId);
      historyIdentityWitnesses.delete(lampId);
      scheduleIdleHistoryRelease(lampId);
    };
    const requestHistoryChunk = async (lampId: string, after: number) => {
      if (historyOwner.debugRequested) { stopHistoryDrain(lampId); return; }
      const phase = historyRequestPhases.get(lampId) ?? new HistoryRequestPhase();
      historyRequestPhases.set(lampId, phase);
      phase.begin(historyIdentityWitnesses.has(lampId) ? 'witness' : 'recovery', after);
      const timer = historyRecordTimeouts.get(lampId);
      if (timer) clearTimeout(timer);
      historyRecordTimeouts.set(lampId, setTimeout(() => {
        stopHistoryDrain(lampId);
        addMeshLog(`[HistorySync][DEFER] lamp=${lampId} reason=record_timeout retry=next_poll`, lampId);
      }, 8_000));
      await mesh.requestHistoryAfter(lampId, after);
    };

    const requestHistoryBatchChunk = async (
      lampId: string,
      after: number,
      head: number,
    ) => {
      if (historyOwner.debugRequested) { stopHistoryDrain(lampId); return; }
      const through = Math.min(head, after + HISTORY_BATCH_LIMIT);

      const phase =
        historyRequestPhases.get(lampId) ?? new HistoryRequestPhase();
      historyRequestPhases.set(lampId, phase);
      phase.begin('recovery', after);

      const drain = historyDrains.get(lampId);
      if (drain) {
        historyDrains.set(lampId, {
          ...drain,
          requestedAfter: after,
          batchThrough: through,
        });
      }

      const timer = historyRecordTimeouts.get(lampId);
      if (timer) clearTimeout(timer);

      historyRecordTimeouts.set(lampId, setTimeout(() => {
        stopHistoryDrain(lampId);
        addMeshLog(
          `[HistorySync][DEFER] lamp=${lampId} reason=batch_timeout after=${after} through=${through} retry=next_poll`,
          lampId
        );
      }, 15_000));

      addMeshLog(
        `[HistorySync][BATCH_REQUEST] lamp=${lampId} after=${after} through=${through} head=${head} limit=${HISTORY_BATCH_LIMIT}`,
        lampId
      );

      await mesh.requestHistoryBatch(
        lampId,
        after,
        head,
        HISTORY_BATCH_LIMIT,
      );
    };
    const beginLampHistorySync = async (lampId: string, freshStatusRetry = false) => {
      const inventory = historyInventoryRef.current;
      const userId = currentCloudUserRef.current;
      const device = historyDevice(inventory.devices, lampId, 'lamp');
      if (!historySyncPolicyRef.current.ready) { logHistorySyncSkip(lampId, 'policy_not_ready'); return; }
      if (!userId) { logHistorySyncSkip(lampId, 'no_signed_in_user'); return; }
      if (inventory.userId !== userId) { logHistorySyncSkip(lampId, 'inventory_user_not_ready'); return; }
      if (!device?.access.canViewHistory) { logHistorySyncSkip(lampId, 'lamp_history_access_missing'); return; }
      const blocked = historyIdentityBlocks.get(lampId);
      if (blocked) {
        if (blocked.accountUid !== userId) historyIdentityBlocks.delete(lampId);
        else {
          const registered = registeredProbeForHistoryIndex(inventory.devices, lampId, blocked.probeIndex);
          const witnessedId = historyProbeBindings.get(lampId)?.get(blocked.probeIndex) ?? null;
          const witnessed = witnessedId ? historyDevice(inventory.devices, witnessedId, 'probe') : null;
          const hint = routedHistoryHints.get(lampId);
          const hintDevice = hint ? historyDevice(inventory.devices, hint.probeId, 'probe') : null;
          if (!canRetryBlockedProbeHistory(blocked, {
            accountUid: userId, now: Date.now(), registeredProbeId: registered?.id ?? null,
            registeredHasHistoryGrant: Boolean(registered?.access.canViewHistory),
            witnessedProbeId: witnessedId,
            witnessHasHistoryGrant: Boolean(witnessed?.access.canViewHistory),
            hintSeenAt: hint?.seenAt ?? null,
            hintHasHistoryGrant: Boolean(hintDevice?.access.canViewHistory),
          })) {
            logHistorySyncSkip(lampId, `probe_index_${blocked.probeIndex}_awaiting_verified_identity`);
            return;
          }
          // Keep the block until a valid binding is actually confirmed. A
          // failed witness cannot fall through into another unverified batch.
          if (hint && hint.seenAt > blocked.lastHintSeenAt) blocked.lastHintSeenAt = hint.seenAt;
        }
      }
      if (!historySubscriptionsActive) return;
      if (historyStarts.size || historyDrains.size || historyIdentityWitnesses.size) return;
      if (!historyOwner.tryProduction(lampId)) return;
      productionHistoryLeases.set(lampId, historyOwner.leaseId);
      if (!freshStatusRetry) historyFreshStatusRetries.set(lampId, 0);
      historyStarts.set(lampId, userId);
      if (!historySubscriptionsActive) return;
      addMeshLog(`[HistorySync][STATUS_REQUEST] lamp=${lampId}`, lampId);
      historySyncStateRef.current[lampId] = 'requested';
      historyStatusTimeouts.set(lampId, setTimeout(() => {
        historyStatusTimeouts.delete(lampId);
        if (!historySubscriptionsActive || !historyStarts.delete(lampId)) return;
        historySyncStateRef.current[lampId] = 'timed_out';
        addMeshLog(`[HistorySync][STATUS_TIMEOUT] lamp=${lampId} retry=next_poll`, lampId);
        scheduleIdleHistoryRelease(lampId);
      }, 8_000));
      try {
        await mesh.requestHistoryStatus(lampId);
      } catch (error) {
        clearHistoryStatusTimeout(lampId);
        historyStarts.delete(lampId);
        scheduleIdleHistoryRelease(lampId);
        throw error;
      }
    };
    requestRoutedHistorySync = (lampId: string, probeId: string, snapshot: ProbeSensorStatus, seenAt: number) => {
      if (!historySubscriptionsActive) return;
      // Keep the freshest routed frame only as a short-lived identity hint. The
      // frame itself is never persisted as history; G4 FRAM remains authoritative.
      // We use timing/proximity only to associate the canonical Probe with the
      // nearby G4 probe_index.
      routedHistoryHints.set(lampId, { probeId, snapshot: { ...snapshot }, seenAt });
      if (routedHistoryKickTimers.has(lampId)) return;
      addMeshLog(`[ProbeHistory][ROUTED_LIVE] lamp=${lampId} probe=${probeId} action=history_sync_kick`, lampId);
      routedHistoryKickTimers.set(lampId, setTimeout(() => {
        routedHistoryKickTimers.delete(lampId);
        if (!historySubscriptionsActive) return;
        void beginLampHistorySync(lampId).catch((error: any) =>
          addMeshLog(`[HistorySync][FAIL] lamp=${lampId} stage=routed_probe_kick error=${error?.message ?? String(error)}`, lampId)
        );
      }, 1500));
    };
    const unsubscribeHistory = mesh.subscribeHistory({
      captureRecordContext: (lampId: string): HistoryIngressContext => historyOwner.isDebug(lampId)
        ? Object.freeze({ owner: 'DEBUG_MAILBOX', leaseId: historyOwner.leaseId, debugRunId: debugMailbox.debugRunId })
        : historyOwner.owner === 'PRODUCTION' && historyOwner.lampId === lampId
          ? Object.freeze({ owner: 'PRODUCTION', leaseId: historyOwner.leaseId, phaseGeneration: historyRequestPhases.get(lampId)?.capture(null).generation })
          : Object.freeze({ owner: 'NONE' }),
      onStatus: (lampId, historyStatus, context) => {
        if(Platform.OS==='ios' && historyStatus.ready)setArcHistoryGeneration(lampId,historyStatus.journalGeneration);
        if (context?.owner === 'DEBUG_MAILBOX') { debugMailbox.onStatus(lampId, historyStatus, context.debugRunId); return; }
        if (context?.owner === 'NONE' || historyOwner.isDebug(lampId)) return;
        queueHistoryWork(lampId, async () => {
        const requestedUserId = historyStarts.get(lampId);
        if (!requestedUserId || requestedUserId !== currentCloudUserRef.current) return;
        clearHistoryStatusTimeout(lampId);
        const inventory = historyInventoryRef.current;
        const userId = currentCloudUserRef.current;
        if (!userId || inventory.userId !== userId || !historyDevice(inventory.devices, lampId, 'lamp')?.access.canViewHistory) { historyStarts.delete(lampId); return; }
        historySyncStateRef.current[lampId] = 'received';
        const local = await loadArcHistoryDurability(lampId, userId);
        const cursor = local.cursor;
        if (!historySubscriptionsActive || currentCloudUserRef.current !== userId) return;
        addMeshLog(`[HistorySync][STATUS] lamp=${lampId} schema=${historyStatus.recordVersion} count=${historyStatus.count}/${historyStatus.capacity} oldest=${historyStatus.oldestSequence} newest=${historyStatus.newestSequence} ack=${historyStatus.acknowledgedSequence} cursor=${cursor} mappings=${historyStatus.mappingCount} probeCadence=${historyStatus.probeIntervalSeconds ?? 'legacy'} lampCadence=${historyStatus.lampFollowsProbe ? 'follow_probe' : historyStatus.lampIntervalSeconds ?? 'legacy'} ready=${historyStatus.ready ? 1 : 0}`, lampId);
        const cloudEnabled = historySyncPolicyRef.current.enabled;
        const canonical = historyDevice(inventory.devices, lampId, 'lamp');
        const epochSuspect = historyCloudEpochSuspects.get(lampId);
        const avoidUnverifiedCloudCoverage = Boolean(epochSuspect && epochSuspect.userId === userId &&
          epochSuspect.cloudHead > historyStatus.newestSequence);
        const recovery = await resolveHistoryRecovery(historyStatus, local,
          historyStatus.recordVersion !== 3 && cloudEnabled && Boolean(canonical) && !avoidUnverifiedCloudCoverage,
          () => portalClient.historyCoverage(canonical!.id, historyStatus.oldestSequence, historyStatus.newestSequence), canonical?.id);
        const { coverage, coverageError } = recovery;
        let plan = recovery.plan;
        // An older Cloud history generation can have a head far beyond the
        // current WBA journal after a deliberate sequence reset. It must never
        // authorize a skip, and repeatedly refreshing STATUS cannot fix it.
        if (coverage && coverage.newestSeen !== null &&
            coverage.newestSeen > historyStatus.newestSequence + historyStatus.capacity) {
          historyCloudEpochSuspects.set(lampId, { userId, cloudHead: coverage.newestSeen });
          plan = planHistoryRecovery(historyStatus, cursor, local.ranges);
          addMeshLog(`[HistorySync][CLOUD_EPOCH_UNVERIFIED] lamp=${lampId} cloudHead=${coverage.newestSeen} framHead=${historyStatus.newestSequence} action=local_only_recovery`, lampId);
        } else if (epochSuspect && epochSuspect.userId === userId &&
                   epochSuspect.cloudHead <= historyStatus.newestSequence) {
          historyCloudEpochSuspects.delete(lampId);
        }
        // A network outage permits conservative local reads. An explicit grant
        // rejection is newer authority and must not become an offline bypass.
        if (coverageError instanceof PortalApiError && coverageError.status === 403 && currentCloudUserRef.current === userId) {
          historyStarts.delete(lampId);
          const denied = historyInventoryRef.current.devices.map(device => device.id === canonical?.id
            ? { ...device, access: { ...device.access, canViewHistory: false } } : device);
          historyInventoryRef.current = { devices: denied, userId };
          setPortalDevices(denied);
          void savePortalDevicePresentationCache(userId, denied).catch(() => undefined);
          addMeshLog(`[HistorySync][DEFER] lamp=${lampId} reason=history_permission_rejected`, lampId);
          return;
        }
        if (coverage) addMeshLog(`[HistorySync][CLOUD_COVERAGE] lamp=${lampId} framOldest=${historyStatus.oldestSequence} framNewest=${historyStatus.newestSequence} localCursor=${cursor} cloudThrough=${coverage.contiguousFromFramOldestThrough ?? 'none'}`, lampId);
        if (coverageError) addMeshLog(`[HistorySync][CLOUD_COVERAGE_FAIL] lamp=${lampId} fallback=local_cursor reason=${coverageError instanceof Error ? coverageError.message : String(coverageError)}`, lampId);
        historyStarts.delete(lampId);
        if (!historySubscriptionsActive || currentCloudUserRef.current !== userId || historySyncPolicyRef.current.enabled !== cloudEnabled) return;
        if (plan.retryFreshStatus) {
          if ((historyFreshStatusRetries.get(lampId) ?? 0) === 0) {
            historyFreshStatusRetries.set(lampId, 1);
            addMeshLog(`[HistorySync][STATUS_SNAPSHOT_STALE] lamp=${lampId} reason=${plan.localStateAhead ? 'local_state_ahead' : 'cloud_ahead_of_captured_status'} action=fresh_status`, lampId);
            await beginLampHistorySync(lampId, true);
            return;
          }
          if (plan.localStateAhead) {
            addMeshLog(`[HistorySync][DEFER] lamp=${lampId} reason=local_state_still_ahead possible_sequence_reset=1 action=review_epoch`, lampId);
            return;
          }
          // A moving head can remain ahead after one refresh. Discard Cloud
          // optimization and use local durability; never label this as reset.
          plan = planHistoryRecovery(historyStatus, cursor, local.ranges);
          addMeshLog(`[HistorySync][CLOUD_SNAPSHOT_INVALID] lamp=${lampId} cloudHead=${coverage?.newestSeen} framHead=${historyStatus.newestSequence} fallback=local_cursor`, lampId);
        }
        if (plan.overwritten) addMeshLog(`[HistorySync][GAP] lamp=${lampId} cursor=${cursor} oldest=${historyStatus.oldestSequence} reason=overwritten action=resume_at_oldest`, lampId);
        addMeshLog(`[HistorySync][RECOVERY_PLAN] lamp=${lampId} source=${plan.cloudTrusted ? 'cloud+fram' : 'local+fram'} fetchAfter=${plan.after ?? 'none'} missingRanges=${JSON.stringify(plan.missingRanges)}`, lampId);
        if (plan.after === null || plan.head === null) return;
        const range = { after: plan.after, head: plan.head };

        const hint = routedHistoryHints.get(lampId);
        const assignedProbes = meshNodesRef.current.filter(
          (node) => node.nodeKind === 'probe' && node.provisioned && node.assignedBridgeId === lampId
        );
        const alreadyBound = hint
          ? [...(historyProbeBindings.get(lampId)?.values() ?? [])].includes(hint.probeId)
          : false;
        const hintDevice = hint ? historyDevice(inventory.devices, hint.probeId, 'probe') : null;
        const blockedIndex = historyIdentityBlocks.get(lampId)?.probeIndex;
        const canWitnessIdentity = Boolean(
          historyStatus.recordVersion !== 3 && historyStatus.mappingCount > 1 &&
          hint &&
          Date.now() - hint.seenAt <= 15_000 &&
          assignedProbes.length === 1 &&
          assignedProbes[0].id === hint.probeId &&
          hintDevice?.access.canViewHistory &&
          !alreadyBound &&
          !(blockedIndex !== undefined &&
            registeredProbeForHistoryIndex(inventory.devices, lampId, blockedIndex)?.access.canViewHistory)
        );
        // A previously blocked index may not be silently bypassed by a regular
        // recovery batch. Wait for an explicit backend index registration or a
        // recent routed Probe witness to establish the binding.
        if (blockedIndex !== undefined && !canWitnessIdentity) {
          const registered = registeredProbeForHistoryIndex(inventory.devices, lampId, blockedIndex);
          const boundId = historyProbeBindings.get(lampId)?.get(blockedIndex);
          const bound = boundId ? historyDevice(inventory.devices, boundId, 'probe') : null;
          if ((registered && boundId && registered.id !== (bound?.id ?? boundId)) ||
              (!registered?.access.canViewHistory && !bound?.access.canViewHistory)) {
            logHistorySyncSkip(lampId, `probe_index_${blockedIndex}_still_unresolved`);
            return;
          }
          historyIdentityBlocks.delete(lampId);
        }
        if (canWitnessIdentity && hint) {
          // Inspect only the tail of the captured FRAM window. G4/WBA have already
          // validated and persisted the record, so a nearby timestamped
          // probe_environment record is sufficient to bind its G4 probe_index to
          // the uniquely assigned canonical Probe. Sensor-value re-validation here
          // would only make recovery brittle because the FRAM codec is quantized.
          const oldestAfter = historyStatus.oldestSequence - 1;
          const witnessAfter = Math.max(oldestAfter, historyStatus.newestSequence > 8 ? historyStatus.newestSequence - 8 : -1);
          historyIdentityWitnesses.set(lampId, {
            probeId: hint.probeId,
            snapshot: hint.snapshot,
            seenAt: hint.seenAt,
            requestedAfter: witnessAfter,
            scanned: 0,
            head: historyStatus.newestSequence,
            recoveryHead: range.head,
            framOldest: historyStatus.oldestSequence,
            cloudEnabled,
            drainAfter: range.after,
            userId,
            mappingCount: historyStatus.mappingCount,
            probeIntervalSeconds: historyStatus.probeIntervalSeconds ?? 300,
          });
          addMeshLog(`[HistorySync][IDENTITY_WITNESS] lamp=${lampId} probe=${hint.probeId} after=${witnessAfter} head=${historyStatus.newestSequence} recoveryHead=${range.head}`, lampId);
          await requestHistoryChunk(lampId, witnessAfter);
          return;
        }

        historyDrains.set(lampId, {
          startedAt: Date.now(),
          requestedAfter: range.after,
          downloaded: 0,
          head: range.head,
          batchThrough: range.after,
          userId,
          mappingCount: historyStatus.mappingCount,
          probeIntervalSeconds: historyStatus.probeIntervalSeconds ?? 300,
          framOldest: historyStatus.oldestSequence,
          cloudEnabled,
        });
        await requestHistoryBatchChunk(
          lampId,
          range.after,
          range.head,
        );
        });
      },
      onRecord: (lampId, record, context) => {
        const ingress = context;
        if (ingress?.owner === 'DEBUG_MAILBOX') {
          debugMailbox.onRecord(lampId, record, ingress.debugRunId);
          return; // A debug frame NEVER falls through to production, even after lease release.
        }
        if (ingress?.owner === 'NONE' || historyOwner.isDebug(lampId)) return; // never reclassify a foreign/retired frame
        queueHistoryRecordWork(lampId, record, async () => {
        const witness = historyIdentityWitnesses.get(lampId);
        if (witness) {
          const inventory = historyInventoryRef.current;
          if (witness.cloudEnabled !== historySyncPolicyRef.current.enabled || witness.userId !== currentCloudUserRef.current || inventory.userId !== witness.userId ||
              !historyDevice(inventory.devices, lampId, 'lamp')?.access.canViewHistory ||
              !historyDevice(inventory.devices, witness.probeId, 'probe')?.access.canViewHistory) {
            stopHistoryDrain(lampId);
            return;
          }
          if (!record) {
            stopHistoryDrain(lampId);
            addMeshLog(`[HistorySync][DEFER] lamp=${lampId} reason=identity_witness_empty retry=next_routed_sample`, lampId);
            return;
          }
          const decision = acceptHistorySequence(witness.requestedAfter, witness.head, record.sequence);
          if (decision === 'duplicate') return;
          if (decision !== 'accept') {
            stopHistoryDrain(lampId);
            addMeshLog(`[HistorySync][DEFER] lamp=${lampId} seq=${record.sequence} reason=identity_witness_${decision}`, lampId);
            return;
          }
          const scanned = witness.scanned + 1;
          historyRequestPhases.get(lampId)?.rememberWitness(record);
          if (record.recordType === 'probe_environment' && historyProbeRecordMatchesHint(record, witness)) {
            const bindings = historyProbeBindings.get(lampId) ?? new Map<number, string>();
            bindings.set(record.probeIndex, witness.probeId);
            historyProbeBindings.set(lampId, bindings);
            if (historyIdentityBlocks.get(lampId)?.probeIndex === record.probeIndex)
              historyIdentityBlocks.delete(lampId);
            addMeshLog(`[HistorySync][IDENTITY_BOUND] lamp=${lampId} probeIndex=${record.probeIndex} probe=${witness.probeId} seq=${record.sequence}`, lampId);
            stopHistoryDrain(lampId, true);
            historyDrains.set(lampId, {
              startedAt: Date.now(),
              requestedAfter: witness.drainAfter,
              downloaded: 0,
              head: witness.recoveryHead,
              batchThrough: witness.drainAfter,
              framOldest: witness.framOldest,
              cloudEnabled: witness.cloudEnabled,
              userId: witness.userId,
              mappingCount: witness.mappingCount,
              probeIntervalSeconds: witness.probeIntervalSeconds,
            });
            await requestHistoryBatchChunk(
              lampId,
              witness.drainAfter,
              witness.recoveryHead,
            );
            return;
          }
          if (record.sequence === witness.head || scanned >= 8) {
            stopHistoryDrain(lampId);
            addMeshLog(`[HistorySync][DEFER] lamp=${lampId} reason=identity_witness_no_match scanned=${scanned} retry=next_routed_sample`, lampId);
            return;
          }
          historyIdentityWitnesses.set(lampId, { ...witness, requestedAfter: record.sequence, scanned });
          await requestHistoryChunk(lampId, record.sequence);
          return;
        }

        if (!record) {
          const drain = historyDrains.get(lampId);
          if (!drain) {
            addMeshLog(`[HistorySync][DONE_DUPLICATE] lamp=${lampId}`, lampId);
            return;
          }
          addMeshLog(`[HistorySync][DONE] lamp=${lampId} downloaded=${drain?.downloaded ?? 0} durationMs=${drain ? Date.now() - drain.startedAt : 0}`, lampId);
          stopHistoryDrain(lampId);
          if (probeLoggingViewsOpenRef.current) {
            void refreshRecentProbeLogs();
            void refreshRecentLampLogs(lampId);
          }
          return;
        }
        const drain = historyDrains.get(lampId);
        if (!drain) {
          addMeshLog(`[HistorySync][STALE] lamp=${lampId} seq=${record.sequence} reason=no_active_drain`, lampId);
          return;
        }
        const inventory = historyInventoryRef.current;
        if (drain.cloudEnabled !== historySyncPolicyRef.current.enabled || drain.userId !== currentCloudUserRef.current || inventory.userId !== drain.userId ||
            !historyDevice(inventory.devices, lampId, 'lamp')?.access.canViewHistory) {
          stopHistoryDrain(lampId); return;
        }
        const decision = acceptHistorySequence(drain.requestedAfter, drain.head, record.sequence);
        if (decision === 'duplicate') return;
        if (decision !== 'accept') {
          stopHistoryDrain(lampId);
          addMeshLog(`[HistorySync][DEFER] lamp=${lampId} seq=${record.sequence} reason=${decision} retry=next_poll`, lampId);
          return;
        }
        const settings = probeLoggingSettingsRef.current;
        const receivedAtMs = Date.now();
        addMeshLog(`[HistorySync][RX] lamp=${lampId} seq=${record.sequence} type=${record.recordType} schema=${record.schemaVersion} ts=${record.unixTimeSeconds} tsValid=${record.timestampValid ? 1 : 0}`, lampId);
        if (record.recordType === 'probe_environment') {
          const sourceBinding=record.schemaVersion===3?resolveHardwareBinding(hardwareBindingsRef.current,record.sourceHardwareUid):{state:'unknown' as const};
          const assignedProbes = meshNodesRef.current.filter(
            (node) => node.nodeKind === 'probe' && node.provisioned && node.assignedBridgeId === lampId
          );
          const registeredProbe = registeredProbeForHistoryIndex(inventory.devices, lampId, record.probeIndex);
          const witnessedProbeId = historyProbeBindings.get(lampId)?.get(record.probeIndex) ?? null;
          const legacyProbeId = registeredProbe?.id ?? witnessedProbeId ?? (
            assignedProbes.length === 1 && drain.mappingCount === 1 && record.probeIndex === 0
              ? assignedProbes[0].id
              : `lamp-history:${lampId}:probe-${record.probeIndex}`
          );
          // Conflicting registered and witnessed identities must fail closed.
          const legacyConflictingSources = Boolean(registeredProbe && witnessedProbeId && registeredProbe.id !==
            (historyDevice(inventory.devices, witnessedProbeId, 'probe')?.id ?? witnessedProbeId));
          const probeId=record.schemaVersion===3?(sourceBinding.state==='known'?sourceBinding.arcDeviceId:`hardware:${record.sourceHardwareUid}`):legacyProbeId;
          const conflictingSources=record.schemaVersion===3?sourceBinding.state==='conflict':legacyConflictingSources;
          if (conflictingSources || !historyDevice(inventory.devices, probeId, 'probe')?.access.canViewHistory) {
            historyIdentityBlocks.set(lampId, {
              accountUid: drain.userId,
              probeIndex: record.probeIndex,
              lastHintSeenAt: routedHistoryHints.get(lampId)?.seenAt ?? 0,
              probeIntervalMs: Math.max(60_000, (drain.probeIntervalSeconds ?? 300) * 1000),
              conflictingRegisteredId: conflictingSources ? probeId : null,
              conflictingWitnessedId: conflictingSources ? witnessedProbeId : null,
            });
            stopHistoryDrain(lampId);
            addMeshLog(`[HistorySync][BLOCKED] lamp=${lampId} reason=${conflictingSources ? 'probe_identity_conflict' : 'probe_identity_or_history_grant_missing'} probeIndex=${record.probeIndex} seq=${record.sequence} retry=verified_identity_or_new_routed_sample`, lampId);
            return;
          }
          const snapshot = arcHistoryRecordToProbeStatus(record);
          await appendProbeLogRecord({
            probeId,
            recordId:hardwareHistoryRecordId(record,lampId),
            hardwareProvenance:hardwareHistoryProvenance(record),
            deviceTimestampMs: record.schemaVersion===3?(record.measurementTimestampValid?record.measurementUnixTimeSeconds*1000+record.measurementMilliseconds:null):(record.timestampValid?record.unixTimeSeconds*1000:null),
            receivedAtMs,
            timestampValid: record.schemaVersion===3?record.measurementTimestampValid:record.timestampValid,
            timestampOrigin:record.schemaVersion===3?(record.measurementTimestampValid?'probe_device':'unknown'):(record.timestampValid?'lamp_g4_receive_rtc':'unknown'),
            source: snapshot.source ?? null,
            syncMode: settings.syncMode,
            snapshot,
          }, { retentionDays: settings.retentionDays, storageBudgetMb: settings.storageBudgetMb });
        } else {
          await appendRecoveredLampOperationalRecord(lampId, record, receivedAtMs, {
            retentionDays: settings.retentionDays,
            storageBudgetMb: settings.storageBudgetMb,
          });
        }
        addMeshLog(`[HistorySync][LOCAL_OK] lamp=${lampId} seq=${record.sequence} type=${record.recordType} recordId=lamp:${lampId}:history:${record.sequence}`, lampId);
        // Durable append completes before the per-user local cursor advances.
        // No firmware ACK: reading must not change a global consumed/uploaded mark.
        if (!historySubscriptionsActive || historyDrains.get(lampId) !== drain || currentCloudUserRef.current !== drain.userId) return;
        await saveArcHistoryCursor(lampId, record.sequence, drain.userId, drain.framOldest);
        historyRequestPhases.get(lampId)?.advance(record.sequence);
        if (!historySubscriptionsActive || historyDrains.get(lampId) !== drain || currentCloudUserRef.current !== drain.userId) return;
        const downloaded = drain.downloaded + 1;
        const batchComplete = record.sequence >= drain.batchThrough;

        const nextDrain = {
          ...drain,
          requestedAfter: record.sequence,
          downloaded,
        };
        historyDrains.set(lampId, nextDrain);

        if (record.sequence === drain.head) {
          stopHistoryDrain(lampId);
          addMeshLog(
            `[HistorySync][PASS_DONE] lamp=${lampId} after=${record.sequence} head=${drain.head} downloaded=${downloaded} reason=head`,
            lampId
          );
          if (probeLoggingViewsOpenRef.current) {
            void refreshRecentProbeLogs();
            void refreshRecentLampLogs(lampId);
          }
          return;
        }

        // Remaining records in this WBA batch are already in flight.
        if (!batchComplete) {
          return;
        }

        // Stop a recovery pass only on a completed batch boundary.
        if (downloaded >= HISTORY_PASS_RECORD_LIMIT || Date.now() - drain.startedAt >= 30_000) {
          stopHistoryDrain(lampId);
          addMeshLog(
            `[HistorySync][PASS_DONE] lamp=${lampId} after=${record.sequence} head=${drain.head} downloaded=${downloaded} reason=bounded_pass retry=immediate`,
            lampId
          );
          if (probeLoggingViewsOpenRef.current) {
            void refreshRecentProbeLogs();
            void refreshRecentLampLogs(lampId);
          }
          // No fixed 60-second pause after a successfully persisted batch.
          // Finish the serialized write queue and release its lease before
          // immediately starting the next bounded pass, yielding to the UI.
          void (historyQueues.get(lampId) ?? Promise.resolve()).finally(() => {
            setTimeout(() => {
              if (!historySubscriptionsActive || historyOwner.debugRequested) return;
              void beginLampHistorySync(lampId).catch((error: any) =>
                addMeshLog(`[HistorySync][FAIL] lamp=${lampId} stage=resume error=${error?.message ?? String(error)}`, lampId));
            }, 0);
          });
          return;
        }

        await requestHistoryBatchChunk(
          lampId,
          record.sequence,
          drain.head,
        );
        }, ingress?.owner === 'PRODUCTION' ? ingress.phaseGeneration : undefined);
      },
      onError: (lampId, error, context) => {
        const ingress = context;
        if (ingress?.owner === 'DEBUG_MAILBOX') { debugMailbox.onError(lampId, error, ingress.debugRunId); return; }
        if (ingress?.owner === 'NONE' || historyOwner.isDebug(lampId)) return;
        clearHistoryStatusTimeout(lampId);
        historyStarts.delete(lampId);
        stopHistoryDrain(lampId);
        addMeshLog(`[HistorySync][FAIL] lamp=${lampId} stage=decode error=${error.message}`, lampId);
      },
      onAck: (lampId, context) => {
        if (context?.owner === 'DEBUG_MAILBOX' || context?.owner === 'NONE') return;
        addMeshLog(`[HistorySync][ACK_RX] lamp=${lampId}`, lampId);
      },
    });
    const resumeProduction = (id: string) => {
      void mesh.getHistorySessionState(id).then(state => {
        if (historySubscriptionsActive && state === 'SESSION_READY')
          void beginLampHistorySync(id).catch(() => undefined);
      }).catch(() => undefined);
    };
    debugHistoryBridgeRef.current = {
      resumeProduction,
      acquire: (id, signal) => historyOwner.acquireDebug(id, signal),
      release: id => {
        historyOwner.releaseDebug(id);
        // Confirm the native session before resuming normal coverage planning.
        resumeProduction(id);
      },
    };
    const unsubscribeConnection = mesh.subscribeConnection((nodeId, isConnected) => {
      if (!isConnected) debugMailbox.onDisconnect(nodeId);
      const node = meshNodesRef.current.find((candidate) => candidate.id === nodeId);
      const connectionChanged = Boolean(node && node.connected !== isConnected);
      // Probe firmware currently keeps its Thread route policy in RAM. A Probe
      // power-cycle therefore returns it to the compile-time policy. Treat a
      // fresh direct Probe connection as permission to re-send the persisted
      // mode-1 assignment; the retry effect then switches telemetry back to
      // the assigned Lamp/Gateway after the write succeeds.
      if (isConnected && node?.nodeKind === 'probe') {
        const bridgeId = node.assignedGatewayId ?? node.assignedBridgeId;
        if (bridgeId) {
          probeRouteRetryKeysRef.current.delete(`${node.id}:${bridgeId}`);
        }
      }
      setMeshNodes((prev) =>
        prev.map((node) => (node.id === nodeId ? { ...node, connected: isConnected } : node))
      );
      if (connectionChanged) {
        addMeshLog(isConnected ? 'Physical BLE connected' : 'Physical BLE disconnected', nodeId);
        setMeshStatus(isConnected ? 'Connected' : 'Disconnected');
      }
      if (!isConnected) {
        if (node?.nodeKind === 'probe') {
          probeTimeGenerationRef.current[nodeId] = (probeTimeGenerationRef.current[nodeId] ?? 0) + 1;
          probeTimeInFlightRef.current[nodeId] = false;
          delete probeTimeSentGenerationRef.current[nodeId];
          delete probeTimeLastAttemptRef.current[nodeId];
          setProbeSampleConfirmedById(prev => {const next={...prev};delete next[nodeId];return next;});
        }
        clearHistoryStatusTimeout(nodeId);
        historyStarts.delete(nodeId);
        const drain = historyDrains.get(nodeId);
        if (drain) addMeshLog(`[HistorySync][PAUSE] lamp=${nodeId} reason=disconnected after=${drain.requestedAfter}`, nodeId);
        stopHistoryDrain(nodeId);
      }
      if (selectedLampIdRef.current === nodeId) {
        setConnected(isConnected);
      }
      if (isConnected && node?.nodeKind === 'lamp') {
        void beginLampHistorySync(nodeId).catch((error: any) =>
          addMeshLog(`[HistorySync][FAIL] lamp=${nodeId} stage=start error=${error?.message ?? String(error)}`, nodeId)
        );
      }
    });
    meshNodesRef.current
      .filter((node) => node.nodeKind === 'lamp' && node.connected)
      .forEach((node) => void beginLampHistorySync(node.id).catch(() => undefined));
    const historyPollTimer = setInterval(() => {
      meshNodesRef.current
        .filter((node) => node.nodeKind === 'lamp' && node.connected)
        .forEach((node) => void beginLampHistorySync(node.id).catch((error: any) =>
          addMeshLog(`[HistorySync][FAIL] lamp=${node.id} stage=poll error=${error?.message ?? String(error)}`, node.id)
        ));
    }, 60_000);
    const unsubscribeProvisionDebug = mesh.subscribeProvisioningDebug((nodeId, message) => {
      const targetId = nodeId ?? selectedMeshNodeIdRef.current;
      if (!targetId) return;
      addMeshLog(message, targetId);
    });

    return () => {
      historySubscriptionsActive = false;
      productionHistoryLeases.forEach((lease, id) => historyOwner.closeProduction(id, lease));
      historyRequestPhases.forEach(phase => phase.stop());
      historyDrains.clear();
      productionHistoryLeases.forEach((lease, id) => {
        void (historyQueues.get(id) ?? Promise.resolve()).finally(() => {
          historyOwner.releaseProduction(id, lease);
          debugHistoryBridgeRef.current?.resumeProduction(id);
        });
      });
      debugMailbox.cancel();
      debugHistoryBridgeRef.current = null;
      historyRecordTimeouts.forEach(clearTimeout);
      historyRecordTimeouts.clear();
      routedHistoryKickTimers.forEach((timer) => clearTimeout(timer));
      routedHistoryKickTimers.clear();
      routedHistoryHints.clear();
      historyIdentityWitnesses.clear();
      historyProbeBindings.clear();
      historyIdentityBlocks.clear();
      historyCloudEpochSuspects.clear();
      requestRoutedHistorySync = null;
      clearInterval(historyPollTimer);
      historyStatusTimeouts.forEach((timer) => clearTimeout(timer));
      historyStatusTimeouts.clear();
      historyStarts.clear();
      historyFreshStatusRetries.clear();
      historySkipLoggedAt.clear();
      unsubscribeTelemetry();
      unsubscribeProbeGatewayConfirmation();
      unsubscribeHistory();
      unsubscribeConnection();
      unsubscribeProvisionDebug();
    };
  }, [mesh, meshEnabled]);

  useEffect(() => {
    let cancelled = false;

    const fetchLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setHasLocation(false);
          return;
        }

        const result = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setCoords({ lat: result.coords.latitude, lon: result.coords.longitude });
        setHasLocation(true);
      } catch (err) {
        if (!cancelled) setHasLocation(false);
      }
    };

    fetchLocation();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!coords) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const toMinutes = (date: Date) => date.getHours() * 60 + date.getMinutes();

    const updateDayCycle = () => {
      try {
        const times = SunCalc.getTimes(new Date(), coords.lat, coords.lon);
        const sunrise = times.sunrise;
        const sunset = times.sunset;

        if (!sunrise || !sunset || Number.isNaN(sunrise.getTime()) || Number.isNaN(sunset.getTime())) {
          setHasLocation(false);
        } else {
          setDayCycle({ sunrise: toMinutes(sunrise), sunset: toMinutes(sunset) });
          setHasLocation(true);
        }
      } catch (err) {
        setHasLocation(false);
      }

      const now = new Date();
      const nextUpdate = new Date(now);
      nextUpdate.setDate(now.getDate() + 1);
      nextUpdate.setHours(0, 5, 0, 0);
      const waitMs = Math.max(nextUpdate.getTime() - now.getTime(), 60 * 1000);
      timer = setTimeout(updateDayCycle, waitMs);
    };

    updateDayCycle();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [coords]);

  useEffect(() => {
    if (!meshEnabled) return;
    if (selectedLampNode?.connected && selectedLampNode.status) {
      // applyStatus already protects the Schedule tab. Do not re-apply the
      // persisted schedule on every telemetry frame: that would overwrite
      // an in-progress user edit (for example 06:30 -> 00:00).
      applyStatus(selectedLampNode.status, 'read');
    } else {
      setLampStatus(null);
    }
    setConnected(Boolean(selectedLampNode?.connected));
  }, [meshEnabled, selectedLampNode?.connected, selectedLampNode?.status, selectedLampNode?.id]);

  useEffect(() => {
    if (!lampSelectionReady) return;
    if (selectedLampId && lampNodes.some((node) => node.id === selectedLampId)) return;
    setSelectedLampId(lampNodes[0]?.id ?? null);
  }, [lampNodes, lampSelectionReady, selectedLampId]);

  useEffect(() => {
    if (!meshEnabled) return;
    if (!meshSelectedNodeId && meshNodes.length) {
      setMeshSelectedNodeId(meshNodes[0].id);
      return;
    }
    if (meshSelectedNodeId && !meshNodes.some((node) => node.id === meshSelectedNodeId && !isLegacyMeshNode(node))) {
      setMeshSelectedNodeId(meshNodes.find(node => !isLegacyMeshNode(node))?.id ?? null);
    }
  }, [meshEnabled, meshNodes, meshSelectedNodeId]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + now.getMilliseconds() / 60000);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  useEffect(() => {
    probeLoggingSettingsRef.current = probeLoggingSettings;
  }, [probeLoggingSettings]);

  useEffect(() => {
    probeSettingsByIdRef.current = probeSettingsById;
  }, [probeSettingsById]);

  useEffect(() => {
    probeLoggingViewsOpenRef.current = probeGraphOpen || probeSettingsOpen;

    if (!probeGraphOpen && !probeSettingsOpen) {
      if (graphLiveRefreshTimerRef.current) {
        clearTimeout(graphLiveRefreshTimerRef.current);
        graphLiveRefreshTimerRef.current = null;
      }
      graphLiveRefreshPendingProbeIdRef.current = null;
      graphLiveRefreshPendingLampIdRef.current = null;
    }
  }, [probeGraphOpen, probeSettingsOpen]);

  useEffect(() => {
    if (!probeSettingsOpen) setProbeNotesOpen(false);
  }, [probeSettingsOpen]);

  useEffect(() => {
    if (probeGraphOpen) {
      setProbeGraphDrawerOpen(false);
      setGraphFocusedPoint(null);
    }
  }, [probeGraphOpen]);

  useEffect(() => {
    return subscribeArcCloudSession((session) => {
      setArcCloudSession(session);
      setAuthResolved(true);
    }, (error) => {
      setArcCloudSession(signedOutArcCloudSession());
      setAuthMessage(error.message);
      setAuthResolved(true);
    });
  }, []);

  useEffect(() => {
    if (!arcCloudSession.userId || !arcCloudSession.emailVerified) {
      setAccountProfileReady(false);
      return;
    }
    let cancelled = false;
    const loadProfile = async () => {
      const profile = await loadArcAccountProfile();
      if (cancelled) return;
      setAccountProfile(profile);
      setAccountProfileReady(true);
    };
    void loadProfile().catch(() => {
      if (!cancelled) setAccountProfileReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [arcCloudSession.userId, arcCloudSession.emailVerified]);

  useEffect(() => {
    meshNodesRef.current = meshNodes;
  }, [meshNodes]);

  useEffect(() => {
    const probeId = selectedProbeNode?.id ?? null;
    if (!probeId || probeSettingsReadyById[probeId]) return;
    let cancelled = false;

    const loadSelectedProbeSettings = async () => {
      const settings = await loadProbeSettings(probeId, selectedProbeNode?.name ?? 'Probe');
      if (cancelled) return;
      setProbeSettingsById((prev) => ({ ...prev, [probeId]: settings }));
      setProbeSettingsReadyById((prev) => ({ ...prev, [probeId]: true }));
      setProbeLoggingSettings((prev) => ({
        ...prev,
        loggingEnabled: settings.localAppSettings.loggingEnabled,
        loggingIntervalSec: settings.localAppSettings.loggingIntervalSec,
        sensorReadIntervalSec: settings.desiredProbeSettings.regularMeasurementIntervalSec,
        gasReadIntervalSec: settings.desiredProbeSettings.gasMeasurementIntervalSec ?? prev.gasReadIntervalSec,
        retentionDays: settings.localAppSettings.retentionDays,
        storageBudgetMb: settings.localAppSettings.storageBudgetMb,
        rawPayloadRetention: settings.localAppSettings.rawPayloadRetention,
      }));
      setProbeGraphWindow(settings.localAppSettings.graphDefaultWindow);
      const defaultVisibleSignals: ProbeGraphSignal[] = settings.localAppSettings.defaultVisibleSignals.length
        ? settings.localAppSettings.defaultVisibleSignals
        : ['sht45Temp', 'soilTop', 'soilMid'];
      setProbeGraphVisibleSignals(defaultVisibleSignals);
      setProbeGraphYAxisSignals(normalizeProbeGraphYAxisSignals(defaultVisibleSignals, defaultVisibleSignals));
    };

    void loadSelectedProbeSettings();

    return () => {
      cancelled = true;
    };
  }, [selectedProbeNode?.id, selectedProbeNode?.name, probeSettingsReadyById]);

  useEffect(() => {
    const probeId = selectedProbeNode?.id ?? null;
    const settings = probeId ? probeSettingsById[probeId] : null;
    if (!probeId || !settings || !probeSettingsReadyById[probeId]) return;
    void saveProbeSettings(settings);
  }, [selectedProbeNode?.id, probeSettingsById, probeSettingsReadyById]);

  useEffect(() => {
    if (!selectedProbeSettings) return;
    setProbeLoggingSettings((prev) => {
      const next = {
        ...prev,
        loggingEnabled: selectedProbeSettings.localAppSettings.loggingEnabled,
        loggingIntervalSec: selectedProbeSettings.localAppSettings.loggingIntervalSec,
        sensorReadIntervalSec: selectedProbeSettings.desiredProbeSettings.regularMeasurementIntervalSec,
        gasReadIntervalSec: selectedProbeSettings.desiredProbeSettings.gasMeasurementIntervalSec ?? prev.gasReadIntervalSec,
        retentionDays: selectedProbeSettings.localAppSettings.retentionDays,
        storageBudgetMb: selectedProbeSettings.localAppSettings.storageBudgetMb,
        rawPayloadRetention: selectedProbeSettings.localAppSettings.rawPayloadRetention,
      };
      return (Object.keys(next) as Array<keyof typeof next>).every((key) => Object.is(prev[key], next[key]))
        ? prev : next;
    });
  }, [selectedProbeSettings]);

  useEffect(() => {
    const probeId = selectedProbeNode?.id ?? null;
    const probeName = selectedProbeNode?.name ?? 'Probe';
    const probeStatus = selectedProbeNode?.probeStatus ?? null;
    const regularMeasurementIntervalSec = probeStatus?.regularSampleIntervalS;
    const gasMeasurementIntervalSec = probeStatus?.gasSampleIntervalS;

    if (!probeId || probeStatus?.source !== 'probe-native' || typeof regularMeasurementIntervalSec !== 'number') return;

    const normalizedGasInterval = typeof gasMeasurementIntervalSec === 'number' && gasMeasurementIntervalSec > 0 ? gasMeasurementIntervalSec : null;
    setProbeSettingsById((prev) => {
      const current = prev[probeId] ?? buildDefaultProbeSettings(probeId, probeName);
      if (
        current.desiredProbeSettings.regularMeasurementIntervalSec === regularMeasurementIntervalSec &&
        current.desiredProbeSettings.gasMeasurementIntervalSec === normalizedGasInterval &&
        current.desiredProbeSettings.commandState === 'applied'
      ) {
        return prev;
      }

      return {
        ...prev,
        [probeId]: {
          ...current,
          updatedAtMs: Date.now(),
          desiredProbeSettings: {
            ...current.desiredProbeSettings,
            regularMeasurementIntervalSec,
            gasMeasurementIntervalSec: normalizedGasInterval,
            commandState: 'applied',
          },
        },
      };
    });
    setProbeSettingsReadyById((prev) => (prev[probeId] ? prev : { ...prev, [probeId]: true }));
  }, [
    selectedProbeNode?.id,
    selectedProbeNode?.name,
    selectedProbeNode?.probeStatus?.source,
    selectedProbeNode?.probeStatus?.regularSampleIntervalS,
    selectedProbeNode?.probeStatus?.gasSampleIntervalS,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadProbeLogging = async () => {
      const [settings, stats] = await Promise.all([
        loadProbeLoggingSettings(),
        getProbeLoggingStats(),
      ]);
      if (cancelled) return;
      setProbeLoggingSettings(settings);
      setProbeLoggingStats(stats);
      setProbeLoggingSettingsReady(true);
    };

    loadProbeLogging();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadCloudSyncEnabled().then((enabled) => {
      if (cancelled) return;
      setCloudSyncEnabled(ARC_CLOUD_SYNC_VALIDATION_HOLD ? false : enabled);
      setCloudSyncPreferenceReady(true);
    });
    void refreshLocalTelemetryStats();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!cloudSyncPreferenceReady) return;
    void saveCloudSyncEnabled(cloudSyncEnabled);
    setProbeLoggingSettings((current) => ({
      ...current,
      syncMode: cloudSyncEnabled ? 'cloud_later' : 'local_only',
    }));
  }, [cloudSyncEnabled, cloudSyncPreferenceReady]);

  useEffect(() => {
    if (ARC_CLOUD_SYNC_VALIDATION_HOLD || !cloudSyncPreferenceReady || !cloudSyncEnabled) {
      setCloudSyncState('idle');
      return;
    }
    if (!arcCloudSession.userId || !arcCloudSession.emailVerified) {
      console.log(
        `[CloudSync][AUTH_REQUIRED] firebaseConfigured=${arcCloudFirebaseConfigured ? 1 : 0} signedIn=${arcCloudSession.userId ? 1 : 0} emailVerified=${arcCloudSession.emailVerified ? 1 : 0}`
      );
      setCloudSyncState('auth_required');
      return;
    }
    let cancelled = false;
    let running = false;
    const run = async () => {
      if (running || cancelled) return;
      running = true;
      setCloudSyncState('syncing');
      console.log(`[CloudSync][RUN] organizationId=${arcCloudSession.orgId}`);
      try {
        const result = await drainCloudTelemetry(async (records) => {
          if (cancelled || currentCloudUserRef.current !== arcCloudSession.userId) throw new Error('Gateway account changed');
          const prepared = records.map(record => prepareHistoryUpload(record, historyInventoryRef.current.devices, hardwareBindingsRef.current, arcCloudSession.userId));
          if (prepared.some(record => !record)) throw new Error('History grant or canonical device mapping unavailable');
          return uploadArcCloudTelemetryBatch(arcCloudSession.orgId, prepared.filter((record): record is NonNullable<typeof record> => record !== null));
        }, record => historyInventoryRef.current.userId === arcCloudSession.userId && Boolean(prepareHistoryUpload(record, historyInventoryRef.current.devices, hardwareBindingsRef.current, arcCloudSession.userId)));
        const stats = await loadLocalTelemetryStats();
        if (cancelled) return;
        setLocalTelemetryStats(stats);
        setCloudSyncState(result.failed > 0 ? 'retrying' : stats.pendingCloudRecords > 0 ? 'pending' : 'synced');
      } catch (error: any) {
        if (cancelled) return;
        console.log(`[CloudSync][UPLOAD][RETRY] reason=${error?.message ?? String(error)}`);
        setCloudSyncState('retrying');
      } finally {
        running = false;
      }
    };
    void run();
    const timer = setInterval(() => void run(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [arcCloudSession.emailVerified, arcCloudSession.orgId, arcCloudSession.userId, cloudSyncEnabled, cloudSyncKick, cloudSyncPreferenceReady]);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(CONNECTIONS_SECTION_STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'spaces') {
          setConnectionsSection('projects');
        } else if (stored === 'local' || stored === 'devices' || stored === 'people' || stored === 'projects') {
          setConnectionsSection(stored);
        }
      })
      .finally(() => {
        if (!cancelled) setConnectionsSectionReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!connectionsSectionReady) return;
    void AsyncStorage.setItem(CONNECTIONS_SECTION_STORAGE_KEY, connectionsSection).catch((error: any) => {
      console.log(`[Connections][PERSIST] ${error?.message ?? String(error)}`);
    });
  }, [connectionsSection, connectionsSectionReady]);

  useEffect(() => {
    const userId = arcCloudSession.userId;
    if (!userId || !arcCloudSession.emailVerified) {
      portalInventorySourceRef.current = 'none';
      setPortalDevices([]);
      setPortalDevicesCachedAt(null);
      setPortalInventoryCached(false);
      return;
    }
    portalInventorySourceRef.current = 'none';
    setPortalDevices([]);
    setPortalInventoryCached(false);
    let cancelled = false;
    void loadPortalDevicePresentationCache(userId).then((cache) => {
      if (cancelled || !cache || portalInventorySourceRef.current === 'network') return;
      portalInventorySourceRef.current = 'cache';
      historyAccessUserRef.current = userId;
      setPortalDevices(cache.devices);
      setPortalDevicesCachedAt(cache.cachedAt);
      setPortalInventoryCached(true);
    });
    return () => { cancelled = true; };
  }, [arcCloudSession.emailVerified, arcCloudSession.userId]);

  useEffect(() => {
    if (activeTab !== 'comms' || connectionsSection === 'local') return;
    if (!arcCloudSession.userId || !arcCloudSession.emailVerified) return;
    void refreshPortalWorkspace();
  }, [activeTab, connectionsSection, arcCloudSession.emailVerified, arcCloudSession.userId]);

  useEffect(() => {
    if (!arcCloudSession.userId || !arcCloudSession.emailVerified) return;
    void refreshPortalInventory();
    const timer = setInterval(() => void refreshPortalInventory(), 60_000);
    return () => clearInterval(timer);
  }, [arcCloudSession.userId, arcCloudSession.emailVerified]);

  useEffect(() => {
    // Only a successful canonical inventory refresh may revoke a remembered selection.
    // Presentation-cache contents never become a permanent local authorization source.
    if (portalInventoryCached) return;
    if (selectedPortalDeviceId && !portalDevices.some((device) => device.id === selectedPortalDeviceId)) {
      setSelectedPortalDeviceId(null);
      setPortalDeviceGrants([]);
      setPortalGrantDeviceId(null);
    }
    if (selectedPortalProbeId && !portalDevices.some((device) => device.id === selectedPortalProbeId)) {
      setSelectedPortalProbeId(null);
      setCloudProbeLogs([]);
    }
  }, [portalDevices, portalInventoryCached, selectedPortalDeviceId, selectedPortalProbeId]);

  useEffect(() => {
    if (arcCloudSession.userId && arcCloudSession.emailVerified) return;
    setPortalConnections([]);
    setPortalIncomingRequests([]);
    setPortalOutgoingRequests([]);
    setPortalFriendSharedDeviceCounts({});
    setPortalProjects([]);
    setSelectedPortalProjectId(null);
    setPortalProjectDetail(null);
    setPortalProjectDeviceGrants([]);
    setPortalProjectPosts([]);
    setPortalProjectTasks([]);
    setPortalProjectFiles([]);
    setPortalProjectKnowledge([]);
    setPortalProjectComposerText('');
    setPortalProjectMenuOpen(false);
    setPortalProjectCalendarOpen(false);
    setPortalRooms([]);
    setPortalTransfers([]);
    setActivePortalRoomId(null);
    setPortalMessages([]);
  }, [arcCloudSession.emailVerified, arcCloudSession.userId]);

  useEffect(() => {
    if (!activePortalRoomId || !arcCloudSession.userId || !arcCloudSession.emailVerified) return;
    void refreshPortalRoom(activePortalRoomId);
    const timer = setInterval(() => void refreshPortalRoom(activePortalRoomId, true), 15_000);
    return () => clearInterval(timer);
  }, [activePortalRoomId, arcCloudSession.emailVerified, arcCloudSession.userId]);

  useEffect(() => {
    if (!localStorageOpen) return;
    const timer = setInterval(() => void refreshLocalTelemetryStats(), 10_000);
    return () => clearInterval(timer);
  }, [localStorageOpen]);

  useEffect(() => {
    if (!probeLoggingSettingsReady) return;
    void saveProbeLoggingSettings(probeLoggingSettings);
  }, [probeLoggingSettings, probeLoggingSettingsReady]);

  useEffect(() => {
    if (!probeGraphOpen && !probeSettingsOpen) return;
    void refreshProbeLoggingStats();
  }, [probeGraphOpen, probeSettingsOpen]);

  useEffect(() => {
    if (!probeGraphOpen && !probeSettingsOpen) return;
    const probeId = selectedProbeNode?.id ?? null;
    if (!probeId && probeGraphOpen) {
      setRecentProbeLogs([]);
      return;
    }
    void refreshRecentProbeLogs(probeId);
  }, [probeGraphOpen, probeSettingsOpen, selectedPortalProbe?.id, selectedProbeNode?.id]);

  useEffect(() => {
    if (!probeGraphOpen) return;
    const lampId = selectedLampNode?.id ?? null;
    setGraphFocusedPoint(null);
    if (!lampId) {
      setRecentLampLogs([]);
      return;
    }
    setRecentLampLogs([]);
    void refreshRecentLampLogs(lampId);
  }, [probeGraphOpen, selectedLampNode?.id]);

  useEffect(() => {
    if (!probeGraphOpen) return;
    setGraphFocusedPoint(null);
  }, [probeGraphOpen, selectedProbeNode?.id]);

  useEffect(() => {
    if (!cloudSyncEnabled || !probeGraphOpen || !selectedPortalProbe || !canOpenHistory(selectedPortalProbe)) return;
    void refreshSelectedPortalHistory();
  }, [probeGraphOpen, selectedPortalProbe?.id, cloudSyncEnabled]);

  useEffect(() => {
    if (!activeConnected) {
      setSaveState('idle');
    }
  }, [activeConnected]);

  useEffect(() => {
    return () => {
      if (saveStateTimer.current) {
        clearTimeout(saveStateTimer.current);
      }
    };
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setStatus('Scanning...');
    log('scan start');
    try {
      const found = await ble.scan();
      setDevices(found);
      log('scan done', { count: found.length });
      if (found.length) {
        setSelectedDeviceId(found[0].id);
        setStatus('Select a device');
      } else if (Platform.OS === 'web') {
        setStatus('Use browser picker to select a device');
      } else {
        setStatus('No devices found');
      }
    } catch (err: any) {
      log('scan failed', err);
      setStatus(`Scan failed: ${err?.message ?? String(err)}`);
    } finally {
      setScanning(false);
    }
  };

  const handleConnect = async () => {
    if (Platform.OS === 'android') {
      const node = meshNodes.find(candidate => candidate.id === selectedDeviceId);
      if (!node || !canConnectLocalNode(node)) {
        setStatus('Select and save a claimed ARC ID in the local node settings before connecting.');
        return;
      }
    }
    setStatus('Connecting...');
    log('connect pressed', { selectedDeviceId, platform: Platform.OS });
    const arcNode=meshNodes.find(node=>node.id===selectedDeviceId&&!isLegacyMeshNode(node));
    if(arcNode){await connectMeshNode(arcNode);return;}
    try {
      if (selectedDeviceId) {
        await ble.connectTo(selectedDeviceId);
      } else {
        await ble.connect();
      }
      setConnected(true);
      setStatus('Connected');
      log('connect success');
    } catch (err: any) {
      log('connect failed', err);
      setStatus(`Connect failed: ${err?.message ?? String(err)}`);
    }
  };

  const handleDisconnect = async () => {
    log('disconnect pressed');
    try {
      await ble.disconnect();
    } finally {
      setConnected(false);
      setLampStatus(null);
      setStatus('Disconnected');
      log('disconnect done');
    }
  };

  const openMeshEdit = (node: MeshNode) => {
    setOwnerLinkTargetId(hardwareBindings.find(binding=>binding.hardwareUid===lampHardwareIdentity[node.id]?.hardwareUid)?.arcDeviceId ?? null);
    setOwnerLinkPickerOpen(false);
    setMeshSelectedNodeId(node.id);
    setMeshEditNodeId(node.id);
    setMeshEditName(node.name);
    setMeshEditAbbrev(node.abbreviation);
    setMeshEditColor(node.color);

    setMeshEditError('');
  };

  const handleSaveMeshEdit = async () => {
    if (!meshEditNodeId) return;
    const name = meshEditName.trim();
    if (!name) {
      setMeshEditError('Name is required.');
      return;
    }
    const duplicate = meshNodes.some(
      (node) => node.id !== meshEditNodeId && node.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setMeshEditError('That name is already in use.');
      return;
    }
    const editingNode = meshNodes.find(node => node.id === meshEditNodeId);
    if(editingNode&&['lamp','probe'].includes(editingNode.nodeKind??'')&&ownerLinkTargetId!==ownerLinkExistingTarget){
      if(!await saveOwnerLink(ownerLinkTargetId))return;
    }
    const abbreviation = meshEditAbbrev.trim() || buildMeshAbbrev(name);
    setMeshNodes((prev) =>
      prev.map((node) =>
        node.id === meshEditNodeId
          ? {
              ...node,
              name,
              abbreviation,
              color: meshEditColor,
            }
          : node
      )
    );
    setMeshEditNodeId(null);
  };

  const handleMeshScan = async () => {
    if (!mesh.isAvailable) {
      setMeshStatus('ARC native transport module not available.');
      return;
    }
    setMeshScanning(true);
    setMeshStatus('Scanning for ARC devices...');
    try {
      const found = (await mesh.scanArcDevices()).filter(isArcScanCandidate);
      if (selectedMeshNodeIdRef.current) {
        addMeshLog(`Scan complete (${found.length} found)`, selectedMeshNodeIdRef.current);
      }
      mergeScannedMeshNodes(found);
      if (found.length) {
        setMeshSelectedNodeId(found[0].id);
        setMeshStatus(`Found ${found.length} nearby ARC device(s); known offline devices retained`);
      } else {
        setMeshStatus('No nearby ARC devices found; commissioned devices retained offline');
      }
    } catch (err: any) {
      setMeshStatus(`Scan failed: ${err?.message ?? String(err)}`);
    } finally {
      setMeshScanning(false);
    }
  };

  const connectMeshNode = async (node: MeshNode) => {
    // Public identity reads must precede association. Control stays gated separately.
    if (!mesh.isAvailable) {
      setMeshStatus('ARC native transport module not available.');
      return false;
    }
    setMeshSelectedNodeId(node.id);
    setMeshStatus('Connecting...');
    setMeshConnecting(true);
    try {
      addMeshLog('Connect start', node.id);
      await mesh.connectNode(node.id);
      mergeProvisionedMeshNodes(await mesh.listProvisionedNodes());
      addMeshLog('Physical BLE connection requested', node.id);
      setMeshStatus('Connection requested; waiting for the device...');
      return true;
    } catch (err: any) {
      const message = err?.message ?? String(err);
      addMeshLog(`Connect failed: ${message}`, node.id);
      setMeshStatus(`Connect failed: ${message}`);
      return false;
    } finally {
      setMeshConnecting(false);
    }
  };

  const disconnectMeshNode = async (node: MeshNode) => {
    if (!mesh.isAvailable) {
      setMeshStatus('ARC native transport module not available.');
      return;
    }
    setMeshSelectedNodeId(node.id);
    setMeshStatus('Disconnecting...');
    setMeshConnecting(true);
    try {
      await mesh.disconnectNode(node.id);
      setMeshNodes((prev) =>
        prev.map((entry) => (entry.id === node.id ? { ...entry, connected: false } : entry))
      );
      addMeshLog('Disconnected', node.id);
      setMeshStatus('Disconnected');
    } catch (err: any) {
      const message = err?.message ?? String(err);
      addMeshLog(`Disconnect failed: ${message}`, node.id);
      setMeshStatus(`Disconnect failed: ${message}`);
    } finally {
      setMeshConnecting(false);
    }
  };

  const handleMeshDisconnect = async () => {
    if (!selectedMeshNode) return;
    if (!mesh.isAvailable) {
      setMeshStatus('ARC native transport module not available.');
      return;
    }
    setMeshConnecting(true);
    setMeshStatus('Disconnecting...');
    try {
      await mesh.disconnectNode(selectedMeshNode.id);
      setMeshNodes((prev) =>
        prev.map((node) => (node.id === selectedMeshNode.id ? { ...node, connected: false } : node))
      );
      addMeshLog('Disconnected', selectedMeshNode.id);
      setMeshStatus('Disconnected');
    } catch (err: any) {
      addMeshLog(`Disconnect failed: ${err?.message ?? String(err)}`, selectedMeshNode.id);
      setMeshStatus(`Disconnect failed: ${err?.message ?? String(err)}`);
    } finally {
      setMeshConnecting(false);
    }
  };

  const authorizeLampCommand = async (permission: 'canControl' | 'canEditSettings') => {
    if(!meshEnabled){setStatus('This legacy BLE path cannot verify ARC hardware permissions');return false;}
    const view=selectedLampViewRef.current,subject=currentCloudUserRef.current;
    const grant=localHardwareGrant(view.node);
    if(!subject||!view.node?.connected||!isCurrentArcLamp(view.node)||!grant?.binding||grant.binding.deviceType!=='lamp')return false;
    const identity=lampHardwareIdentityRef.current[view.node.id];
    if(identity?.state!=='identified'||identity.session!==grant.session||identity.hardwareUid!==grant.binding.hardwareUid)return false;
    try{
      const local=await nativeOfflineAccess.read(subject,grant.binding.hardwareUid);
      if(!local||local.binding.deviceType!=='lamp'||local.binding.arcDeviceId!==view.device?.id||lampHardwareIdentityRef.current[view.node.id]?.session!==grant.session||currentCloudUserRef.current!==subject||selectedLampViewRef.current.node?.id!==view.node.id||!selectedLampViewRef.current.node.connected)return false;
      return local.device.access[permission];
    }catch(error){setStatus(String(error));return false;}
  };

  const handlePowerToggle = async (value: boolean) => {
    if (!await authorizeLampCommand('canControl')) return;
    const previousValue = power;
    setPower(value);
    if (!activeConnected) return;
    pendingPowerRef.current = { value, sentAt: Date.now() };
    setPendingPower(true);
    try {
      if (meshEnabled && selectedLampNode) {
        /* Direct BLE lamp control travels through the WBA Loader route.  This
         * dedicated power command gates output without overwriting whichever
         * owner (manual phases or schedule) was active before the override. */
        const setManualLampPower = (mesh as any).setManualLampPower as
          | ((nodeId: string, input: { power: boolean }) => Promise<void>)
          | undefined;
        if (!setManualLampPower) {
          throw new Error('This app build does not expose direct lamp power control.');
        }
        await setManualLampPower(selectedLampNode.id, { power: value });
      } else {
        await ble.setPower(value);
      }
    } catch (err: any) {
      pendingPowerRef.current = null;
      setPendingPower(false);
      setPower(previousValue);
      setStatus(`Lamp power command failed: ${err?.message ?? String(err)}`);
    }
  };

  const setManualChannel = (index: number, value: number) => {
    manualTelemetryLocksRef.current.channels[index] = true;
    setManualChannels((current) => current.map((item, itemIndex) => (
      itemIndex === index ? value : item
    )) as [number, number, number, number]);
  };

  const setManualTemperature = (value: number) => {
    manualTelemetryLocksRef.current.temperature = true;
    setManualTemperatureLimitC(value);
  };

  const setManualPowerLimit = (value: number) => {
    manualTelemetryLocksRef.current.power = true;
    setManualPowerLimitWatts(value);
  };

  const setManualFanTarget = (value: number) => {
    manualFanTelemetryLockedRef.current = true;
    setManualFanAutomatic(false);
    setManualFanTargetRpm(value);
  };

  const applyManualFanControl = async (automatic: boolean) => {
    if (!await authorizeLampCommand('canControl')) return;
    if (!meshEnabled || !selectedLampNode || !activeConnected) {
      setStatus('Fan control requires an active Lamp WBA connection.');
      return;
    }
    const sendManualFanControl = (mesh as any).setManualFanControl as
      | ((nodeId: string, control: { automatic: boolean; targetRpm: number }) => Promise<void>)
      | undefined;
    if (!sendManualFanControl) {
      setStatus('This app build does not yet expose fan control.');
      return;
    }
    setManualControlSending(true);
    const requestedControl: PendingManualFanControl = {
      automatic,
      targetRpm: Math.round(manualFanTargetRpm),
    };
    pendingManualFanControlRef.current = requestedControl;
    try {
      await sendManualFanControl(selectedLampNode.id, requestedControl);
      setManualFanAutomatic(automatic);
      setStatus(automatic ? 'Fan returned to automatic thermal control.' : 'Fan RPM target sent to G4.');
    } catch (err: any) {
      pendingManualFanControlRef.current = null;
      manualFanTelemetryLockedRef.current = false;
      setStatus(`Fan control failed: ${err?.message ?? String(err)}`);
    } finally {
      setManualControlSending(false);
    }
  };

  const setManualPwmFrequency = (value: number) => {
    setManualPwmFrequencyHz(Math.round(clampNumber(value, 0, 50000)));
  };

  const prepareManualPwmFrequency = async () => {
    if (!await authorizeLampCommand('canEditSettings')) return;
    if (!meshEnabled || !selectedLampNode || !activeConnected) {
      setStatus('PWM frequency control requires an active Lamp WBA connection.');
      return;
    }
    const prepareFrequency = (mesh as any).preparePwmFrequency as
      | ((nodeId: string, control: { targetHz: number }) => Promise<void>)
      | undefined;
    if (!prepareFrequency) {
      setStatus('This app build does not yet expose safe PWM frequency control.');
      return;
    }
    setManualControlSending(true);
    try {
      await prepareFrequency(selectedLampNode.id, { targetHz: manualPwmFrequencyHz });
      setStatus(manualPwmFrequencyHz === 0
        ? 'Outputs are being ramped down and will remain off.'
        : `Outputs are being ramped down; PWM will switch to ${manualPwmFrequencyHz.toLocaleString()} Hz and remain off.`);
    } catch (err: any) {
      setStatus(`PWM frequency preparation failed: ${err?.message ?? String(err)}`);
    } finally {
      setManualControlSending(false);
    }
  };

  const applyManualChannelControl = async (enabled = true) => {
    if (!await authorizeLampCommand('canControl')) return;
    if (!meshEnabled || !selectedLampNode || !activeConnected) {
      setStatus('Manual phase control requires an active Lamp mesh connection.');
      return;
    }
    const sendManualControl = (mesh as any).setManualChannelControl as
      | ((nodeId: string, control: {
          enabled: boolean;
          channels: [number, number, number, number];
          temperatureLimitC: number;
          powerLimitWatts: number;
        }) => Promise<void>)
      | undefined;
    if (!sendManualControl) {
      setStatus('This app build does not yet expose manual phase control.');
      return;
    }
    const nodeId = selectedLampNode.id;
    setManualControlSending(true);
    const requestedControl: PendingManualControl = {
      enabled,
      channels: manualChannels,
      temperatureLimitC: manualTemperatureLimitC,
      powerLimitWatts: manualPowerLimitWatts,
    };
    pendingManualControlRef.current = requestedControl;
    let scheduleDisabledForTakeover = false;
    try {
      // Enabling actual Manual Control is an ownership takeover. The global
      // Lamp Power button is intentionally excluded: ON/OFF is only an output
      // gate and must leave Schedule enabled.
      if (enabled) {
        scheduleDisabledForTakeover = await disableScheduleForManualTakeover(nodeId);
      }
      await sendManualControl(nodeId, requestedControl);
      setStatus(enabled ? 'Manual phase envelope sent to G4.' : 'Manual phase control disabled.');
    } catch (err: any) {
      pendingManualControlRef.current = null;
      const scheduleResumed = await rollbackScheduleAfterManualFailure(nodeId, scheduleDisabledForTakeover);
      setStatus(`Manual control failed: ${err?.message ?? String(err)}${scheduleResumed ? ' Schedule resumed.' : ''}`);
    } finally {
      setManualControlSending(false);
    }
  };

  const applyManualSafetyLimit = async (limit: 'temperature' | 'power') => {
    if (!await authorizeLampCommand('canEditSettings')) return;
    if (!meshEnabled || !selectedLampNode || !activeConnected) {
      setStatus('Safety-limit control requires an active Lamp WBA connection.');
      return;
    }
    const sendManualControl = (mesh as any).setManualChannelControl as
      | ((nodeId: string, control: PendingManualControl) => Promise<void>)
      | undefined;
    if (!sendManualControl) {
      setStatus('This app build does not yet expose independent safety-limit control.');
      return;
    }
    /* The G4's envelope frame carries phase profile plus both limits. Preserve
     * the currently applied profile and active state, changing only the one
     * limit chosen here; this control must never turn outputs on by itself. */
    const current = activeStatus?.manualControl;
    const requestedControl: PendingManualControl = {
      enabled: current?.active ?? false,
      channels: current?.requestedChannels ?? manualChannels,
      temperatureLimitC: manualTemperatureLimitC,
      powerLimitWatts: manualPowerLimitWatts,
    };
    setManualControlSending(true);
    pendingManualControlRef.current = requestedControl;
    try {
      await sendManualControl(selectedLampNode.id, requestedControl);
      setStatus(limit === 'temperature'
        ? `Temperature ceiling set to ${Math.round(manualTemperatureLimitC)} °C.`
        : `Power ceiling set to ${Math.round(manualPowerLimitWatts)} W.`);
    } catch (err: any) {
      pendingManualControlRef.current = null;
      setStatus(`Safety-limit update failed: ${err?.message ?? String(err)}`);
    } finally {
      setManualControlSending(false);
    }
  };

  const applyManualPowerTarget = async () => {
    if (!await authorizeLampCommand('canControl')) return;
    if (!meshEnabled || !selectedLampNode || !activeConnected) {
      setStatus('Power-target control requires an active Lamp WBA connection.');
      return;
    }
    const sendManualPowerTarget = (mesh as any).setManualPowerTarget as
      | ((nodeId: string, control: { enabled: boolean; channels: [number, number, number, number]; targetWatts: number }) => Promise<void>)
      | undefined;
    if (!sendManualPowerTarget) {
      setStatus('This app build does not yet expose power-target control.');
      return;
    }
    const nodeId = selectedLampNode.id;
    const ceilingWatts = clampNumber(activeStatus?.manualControl?.powerLimitWatts ?? manualPowerLimitWatts, 20, 120);
    const targetWatts = clampNumber(intensity, 0, ceilingWatts);
    const profile = activeStatus?.manualControl?.requestedChannels ?? manualChannels;
    setManualControlSending(true);
    let scheduleDisabledForTakeover = false;
    try {
      // Manual power target owns Lamp output, even when the target is 0 W.
      // This differs from the global Power button, which is only a gate.
      scheduleDisabledForTakeover = await disableScheduleForManualTakeover(nodeId);
      await sendManualPowerTarget(nodeId, {
        enabled: targetWatts > 0,
        channels: profile,
        targetWatts,
      });
      setIntensity(targetWatts);
      setStatus(`Power target set to ${targetWatts.toFixed(1)} W.`);
    } catch (err: any) {
      const scheduleResumed = await rollbackScheduleAfterManualFailure(nodeId, scheduleDisabledForTakeover);
      setStatus(`Power-target update failed: ${err?.message ?? String(err)}${scheduleResumed ? ' Schedule resumed.' : ''}`);
    } finally {
      setManualControlSending(false);
    }
  };

  const handleSend = async () => {
    if (!await authorizeLampCommand('canControl')) return;
    if (!activeConnected) return;
    if (saveStateTimer.current) {
      clearTimeout(saveStateTimer.current);
    }
    if (arcAcceptanceTimer.current) {
      clearTimeout(arcAcceptanceTimer.current);
      arcAcceptanceTimer.current = null;
    }
    setSaveState('saving');
    const powerCeilingWatts = clampNumber(activeStatus?.manualControl?.powerLimitWatts ?? manualPowerLimitWatts, 20, 120);
    const intensityValue = clampNumber(intensity, 0, powerCeilingWatts);
    const hueValue = clampNumber(hue, 0, 1);
    const pwmValue = clampNumber(parseInt(pwmFreq, 10), 5000, 50000);

    pendingWriteRef.current = {
      intensity: intensityValue,
      hue: hueValue,
      pwmFreq: pwmValue,
      sentAt: Date.now(),
    };

    try {
      if (meshEnabled && selectedLampNode) {
        const sendManualPowerTarget = (mesh as any).setManualPowerTarget as
          | ((nodeId: string, control: { enabled: boolean; channels: [number, number, number, number]; targetWatts: number }) => Promise<void>)
          | undefined;
        if (!sendManualPowerTarget) throw new Error('Manual watt-target control is unavailable in this app build.');

        /* A watt target must preserve the current manual spectrum.  Normalize
         * against the strongest active phase, then scale the entire profile;
         * zero channels stay zero, and a small red/blue contribution remains
         * small relative to the active whites. */
        const existingProfile = activeStatus?.manualControl?.requestedChannels ?? manualChannels;
        const strongestActivePhase = Math.max(...existingProfile.map((value) => Math.max(0, value)));
        const channels = strongestActivePhase > 0.01
          ? existingProfile.map((value) => Math.max(0, value))
          : channelsFromSpectrum(hueValue);
        await sendManualPowerTarget(selectedLampNode.id, {
          enabled: intensityValue > 0,
          channels: channels as [number, number, number, number],
          targetWatts: intensityValue,
        });
      } else {
        await ble.setIntensity(intensityValue);
        await ble.setHue(hueValue);
        await ble.setPwmFreq(pwmValue);
      }
      pendingIntensityRef.current = false;
      pendingHueRef.current = false;
      confirmedArcValuesRef.current = { intensity: intensityValue, hue: hueValue };
      mainViewTargetPinnedRef.current = true;
      setStatus(`Output target sent: ${intensityValue.toFixed(1)} W.`);
      saveStateTimer.current = setTimeout(() => {
        if (saveStateRef.current === 'saving') {
          setSaveState('saved');
          saveStateTimer.current = setTimeout(() => {
            setSaveState('idle');
          }, 1200);
        }
      }, 1500);
    } catch (err: any) {
      pendingIntensityRef.current = false;
      pendingHueRef.current = false;
      setIntensity(confirmedArcValuesRef.current.intensity);
      setHue(confirmedArcValuesRef.current.hue);
      setSaveState('idle');
      setStatus(`Send failed: ${err?.message ?? String(err)}`);
    }
  };

  const validateScheduleConfigV3 = (config: LampScheduleConfigV3): string | null => {
    if (config.onMinutes + config.sunriseFadeMinutes > config.daylightStartMinutes) {
      return t('schedule.validationSunrise');
    }
    if (config.daylightStartMinutes + config.daylightFadeMinutes > config.eveningStartMinutes) {
      return t('schedule.validationDaylight');
    }
    if (config.eveningStartMinutes + config.eveningFadeMinutes > config.offMinutes - config.nightFadeMinutes) {
      return t('schedule.validationEvening');
    }
    if (config.onMinutes >= config.offMinutes) {
      return t('schedule.validationWithinDay');
    }
    return null;
  };

  const acceptScheduleReplyV3 = (
    nodeId: string,
    reply: LampScheduleConfigV3Reply,
    expected?: { version: number; enabled: boolean; config: LampScheduleConfigV3 }
  ) => {
    if (expected) {
      const exactMatch =
        reply.configVersion === expected.version &&
        reply.enabled === expected.enabled &&
        scheduleConfigMatches(reply.config, expected.config);
      if (!exactMatch) {
        console.warn('[Schedule][ACK][MISMATCH]', {
          nodeId,
          expectedVersion: expected.version,
          receivedVersion: reply.configVersion,
          expectedEnabled: expected.enabled,
          receivedEnabled: reply.enabled,
          expectedConfig: expected.config,
          receivedConfig: reply.config,
        });
        return false;
      }
    }

    const confirmedState: LocalLampScheduleState = {
      version: reply.configVersion,
      synced: true,
      updatedAt: Date.now(),
      timerEnabled: reply.enabled,
      config: reply.config,
    };
    saveLocalLampScheduleState(nodeId, confirmedState);
    const canonical = canonicalDeviceForNode(meshNodes.find(node => node.id === nodeId) ?? null, portalDevices);
    if (canonical?.access.canEditSettings && !portalInventoryCached && selectedLampNode?.connected) {
      void portalClient.recordConfirmedSchedule(canonical.id, {
        schemaVersion: 3, deviceId: canonical.id, configVersion: reply.configVersion,
        enabled: reply.enabled, config: reply.config, observedAt: new Date().toISOString(),
        source: 'local_lamp_response',
      }).then(snapshot => setPortalDevices(devices => devices.map(device => device.id === canonical.id
        ? { ...device, confirmedSchedule: snapshot } : device))).catch(error => {
        console.warn('[Schedule][SNAPSHOT] Read-model upload unavailable', error.message);
      });
    }

    delete schedulePendingWaitLogKeyByNodeRef.current[nodeId];
    meshConfigVersionByNodeRef.current[nodeId] = reply.configVersion;
    meshTelemetryVersionByNodeRef.current[nodeId] = reply.configVersion;
    setMeshTelemetryVersionByNode((previous) => ({ ...previous, [nodeId]: reply.configVersion }));
    applyClockSettingsFromLocalState(confirmedState);
    clearScheduleDirty();
    setTimeSettingsSet(true);
    console.log('[Schedule][ACK][CONFIRMED]', {
      nodeId,
      version: reply.configVersion,
      enabled: reply.enabled,
      config: reply.config,
    });
    return true;
  };

  const setScheduleEnabledPreservingConfig = async (
    nodeId: string,
    enabled: boolean,
    reason: 'manual_takeover' | 'manual_rollback'
  ): Promise<boolean> => {
    const setTimerEnable = (mesh as any).setTimerEnable as
      | ((targetNodeId: string, nextEnabled: boolean) => Promise<unknown>)
      | undefined;
    if (!setTimerEnable) {
      throw new Error('This app build does not expose schedule enable control.');
    }

    const rawReply = await setTimerEnable(nodeId, enabled);
    const reply = normalizeScheduleReplyV3(rawReply);
    if (!reply || reply.enabled !== enabled) {
      throw new Error(`Schedule ${enabled ? 'enable' : 'disable'} confirmation mismatch.`);
    }
    if (!acceptScheduleReplyV3(nodeId, reply)) {
      throw new Error(`Schedule ${enabled ? 'enable' : 'disable'} confirmation rejected.`);
    }
    addMeshLog(
      `[Schedule][OWNERSHIP] reason=${reason} enabled=${enabled ? 1 : 0} version=${reply.configVersion}`,
      nodeId
    );
    return true;
  };

  const scheduleIsCurrentlyEnabled = (nodeId: string) => {
    const localState = meshLocalConfigByNodeRef.current[nodeId];
    return Boolean(
      timerEnabled ||
      localState?.timerEnabled ||
      (selectedLampNode?.id === nodeId && activeStatus?.timerEnabled)
    );
  };

  const disableScheduleForManualTakeover = async (nodeId: string): Promise<boolean> => {
    if (!scheduleIsCurrentlyEnabled(nodeId)) return false;
    await setScheduleEnabledPreservingConfig(nodeId, false, 'manual_takeover');
    return true;
  };

  const rollbackScheduleAfterManualFailure = async (nodeId: string, disabledForTakeover: boolean): Promise<boolean> => {
    if (!disabledForTakeover) return false;
    try {
      await setScheduleEnabledPreservingConfig(nodeId, true, 'manual_rollback');
      return true;
    } catch (rollbackError: any) {
      addMeshLog(
        `[Schedule][OWNERSHIP][ROLLBACK_FAIL] error=${rollbackError?.message ?? String(rollbackError)}`,
        nodeId
      );
      return false;
    }
  };

  const readPersistedScheduleV3 = async (nodeId: string): Promise<LampScheduleConfigV3Reply> => {
    const rawReply = await mesh.readScheduleConfigV3(nodeId);
    const reply = normalizeScheduleReplyV3(rawReply);
    if (!reply) {
      throw new Error(t('schedule.invalidResponse'));
    }
    return reply;
  };

  const saveClockSettingsWithEnabled = async (desiredTimerEnabled: boolean) => {
    if (!await authorizeLampCommand('canEditSettings')) return;
    if (!activeConnected) return;
    if (!meshEnabled || !selectedLampNode) {
      setStatus(t('schedule.localRouteRequired'));
      return;
    }

    const onMinutes = timeToMinutes(onTime);
    const daylightStartMinutes = timeToMinutes(daylightStartTime);
    const eveningStartMinutes = timeToMinutes(eveningStartTime);
    const offMinutes = timeToMinutes(offTime);
    const parseFade = (value: string) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? clampNumber(parsed, 0, 720) : null;
    };
    const sunriseFade = parseFade(sunriseFadeMinutes);
    const daylightFade = parseFade(daylightFadeMinutes);
    const eveningFade = parseFade(eveningFadeMinutes);
    const nightFade = parseFade(nightFadeMinutes);

    if (
      onMinutes === null || daylightStartMinutes === null || eveningStartMinutes === null || offMinutes === null ||
      sunriseFade === null || daylightFade === null || eveningFade === null || nightFade === null
    ) {
      setStatus(t('schedule.invalidTimeValues'));
      return;
    }

    const config: LampScheduleConfigV3 = {
      onMinutes,
      sunriseFadeMinutes: sunriseFade,
      daylightStartMinutes,
      daylightFadeMinutes: daylightFade,
      eveningStartMinutes,
      eveningFadeMinutes: eveningFade,
      offMinutes,
      nightFadeMinutes: nightFade,
      sunriseTarget: clampScheduleTargets(scheduleSunriseTarget),
      daylightTarget: clampScheduleTargets(scheduleDaylightTarget),
      eveningTarget: clampScheduleTargets(scheduleEveningTarget),
    };
    const validationError = validateScheduleConfigV3(config);
    if (validationError) {
      setStatus(validationError);
      return;
    }

    const nodeId = selectedLampNode.id;
    let localBeforeSave: LocalLampScheduleState | undefined;
    let pendingVersion: number | undefined;
    try {
      localBeforeSave = meshLocalConfigByNodeRef.current[nodeId];
      const knownRemoteVersion = meshTelemetryVersionByNodeRef.current[nodeId];
      const previousVersion =
        typeof knownRemoteVersion === 'number'
          ? knownRemoteVersion
          : meshConfigVersionByNodeRef.current[nodeId] ?? localBeforeSave?.version ?? 0;
      const nextVersion = (previousVersion + 1) & 0xff;
      pendingVersion = nextVersion;
      delete schedulePendingWaitLogKeyByNodeRef.current[nodeId];
      const pendingState: LocalLampScheduleState = {
        version: previousVersion,
        pendingVersion: nextVersion,
        synced: false,
        updatedAt: Date.now(),
        timerEnabled: desiredTimerEnabled,
        config,
      };
      saveLocalLampScheduleState(nodeId, pendingState);

      console.log('[Schedule][TX][SCHEMA3]', {
        nodeId,
        version: nextVersion,
        enabled: desiredTimerEnabled,
        config,
      });
      setStatus(t('schedule.sending', { version: nextVersion }));

      // src/mesh waits for G4's full 31-byte 0x31 response before resolving.
      const rawReply = await mesh.setScheduleConfigV3(nodeId, nextVersion, {
        schema: 3,
        enabled: desiredTimerEnabled,
        ...config,
      });
      const reply = normalizeScheduleReplyV3(rawReply);
      if (!reply) {
        throw new Error(t('schedule.invalidAck'));
      }
      if (!acceptScheduleReplyV3(nodeId, reply, { version: nextVersion, enabled: desiredTimerEnabled, config })) {
        throw new Error(t('schedule.ackMismatch', { version: reply.configVersion }));
      }
      setStatus(t('schedule.confirmed', { version: nextVersion }));
    } catch (err: any) {
      // Do not leave the UI permanently locked in PENDING_WAIT_FULL_ECHO when
      // the bridge rejects the frame or the acknowledgement is lost.  A later
      // persisted fetch is the authoritative recovery path; retaining this
      // unconfirmed draft blocked that path indefinitely and caused the v0/v1
      // telemetry loop seen in production logs.
      const pending = meshLocalConfigByNodeRef.current[nodeId];
      if (typeof pendingVersion === 'number' && pending?.pendingVersion === pendingVersion) {
        if (localBeforeSave) {
          saveLocalLampScheduleState(nodeId, localBeforeSave);
        } else {
          delete meshLocalConfigByNodeRef.current[nodeId];
          void persistLampScheduleMap();
        }
        delete schedulePendingWaitLogKeyByNodeRef.current[nodeId];
        console.warn('[Schedule][TX][ROLLBACK_UNCONFIRMED]', {
          nodeId,
          pendingVersion,
          error: err?.message ?? String(err),
        });
      }
      setStatus(t('schedule.saveFailed', { error: err?.message ?? String(err) }));
    }
  };

  const handleSaveClockSettings = async () => {
    await saveClockSettingsWithEnabled(timerEnabled);
  };

  const handleScheduleEnabledToggle = async (value: boolean) => {
    if (scheduleEnableSending || value === timerEnabled) return;
    setScheduleEnableSending(true);
    try {
      // The switch is authoritative, not a local-only draft. Persist current
      // schedule fields and the requested enabled state in one schema-3 write.
      // Turning it back ON therefore returns output ownership to the scheduler
      // immediately, evaluated against the G4's current clock.
      await saveClockSettingsWithEnabled(value);
    } finally {
      setScheduleEnableSending(false);
    }
  };

  const fetchClockSettingsFromLamp = async (options?: {
    silent?: boolean;
    reason?: string;
    preserveEdits?: boolean;
  }) => {
    if (!meshEnabled || !selectedLampNode) {
      if (!options?.silent) setStatus(t('schedule.fetchLocalOnly'));
      return false;
    }

    const nodeId = selectedLampNode.id;
    if (scheduleFetchInFlightRef.current[nodeId]) return false;
    const previous = meshLocalConfigByNodeRef.current[nodeId];
    if (scheduleDirtyRef.current || typeof previous?.pendingVersion === 'number') {
      if (!options?.silent) {
        setStatus(typeof previous?.pendingVersion === 'number'
          ? t('schedule.waitingExact', { version: previous.pendingVersion })
          : t('schedule.localEdits'));
      }
      return false;
    }

    const editRevisionAtStart = scheduleEditRevisionRef.current;
    scheduleFetchInFlightRef.current[nodeId] = true;
    try {
      if (!options?.silent) setStatus(t('schedule.fetching'));
      console.log('[Schedule][FETCH][SCHEMA3_START]', { nodeId, reason: options?.reason ?? 'manual' });
      const reply = await readPersistedScheduleV3(nodeId);

      const editsMustBePreserved = Boolean(options?.preserveEdits) && (
        scheduleDirtyRef.current ||
        scheduleEditRevisionRef.current !== editRevisionAtStart
      );
      if (editsMustBePreserved) {
        console.log('[Schedule][FETCH][PRESERVE_EDIT]', {
          nodeId,
          reason: options?.reason ?? 'auto',
          editRevisionAtStart,
          editRevisionNow: scheduleEditRevisionRef.current,
        });
        return true;
      }

      acceptScheduleReplyV3(nodeId, reply);
      allowTimeSettingsUpdateRef.current = false;
      console.log('[Schedule][FETCH][SCHEMA3_OK]', {
        nodeId,
        reason: options?.reason ?? 'manual',
        version: reply.configVersion,
        enabled: reply.enabled,
        config: reply.config,
      });
      if (!options?.silent) setStatus(t('schedule.fetched', { version: reply.configVersion }));
      return true;
    } catch (err: any) {
      console.warn('[Schedule][FETCH][FAIL]', {
        nodeId,
        reason: options?.reason ?? 'manual',
        error: err?.message ?? String(err),
      });
      if (!options?.silent) setStatus(t('schedule.fetchFailed', { error: err?.message ?? String(err) }));
      return false;
    } finally {
      scheduleFetchInFlightRef.current[nodeId] = false;
    }
  };

  useEffect(() => {
    if (!schedulePersistenceReady || !meshEnabled || activeTab !== 'clock') return;
    if (!selectedLampNode?.id || !selectedLampNode.connected) return;

    // Once the user touches any Schedule control, the draft is authoritative
    // until Save or explicit Fetch. Do not let telemetry/config-version churn
    // reset the form underneath them.
    if (scheduleDirtyRef.current) return;

    const local = meshLocalConfigByNodeRef.current[selectedLampNode.id];
    if (local) {
      applyClockSettingsFromLocalState(local);
      setTimeSettingsSet(true);
    }

    const remoteVersion = meshTelemetryVersionByNodeRef.current[selectedLampNode.id] ?? 'unknown';
    const autoKey = `${selectedLampNode.id}:${remoteVersion}`;
    if (scheduleAutoFetchKeyRef.current === autoKey) return;
    scheduleAutoFetchKeyRef.current = autoKey;

    const timer = setTimeout(() => {
      void fetchClockSettingsFromLamp({
        silent: true,
        reason: 'clock-open',
        preserveEdits: true,
      }).then((ok) => {
        if (!ok && scheduleAutoFetchKeyRef.current === autoKey) {
          // Allow a later retry if the ARC loader was busy with another command.
          scheduleAutoFetchKeyRef.current = null;
        }
      });
    }, 180);

    return () => clearTimeout(timer);
  }, [
    activeTab,
    meshEnabled,
    schedulePersistenceReady,
    selectedLampNode?.connected,
    selectedLampNode?.id,
    meshTelemetryVersionByNode,
  ]);

  const handleToggleMesh = (value: boolean) => {
    setMeshEnabled(value);
    if (value) setThreadEnabled(false);
  };

  const handleToggleThread = (value: boolean) => {
    setThreadEnabled(value);
    if (value) setMeshEnabled(false);
  };

  const assignNodeToBridge = async (
    nodeId: string,
    bridgeId: string | null,
    bridgeKind: 'gateway' | 'lamp'
  ) => {
    const routedNode = meshNodesRef.current.find((node) => node.id === nodeId) ?? null;
    const previousBridgeId = bridgeKind === 'gateway'
      ? routedNode?.assignedGatewayId ?? null
      : routedNode?.assignedBridgeId ?? null;
    const bridge = bridgeId ? meshNodesRef.current.find((node) => node.id === bridgeId) ?? null : null;
    const routeUpdatedAt = Date.now();

    if (routedNode?.nodeKind !== 'probe') {
      console.log(`[ProbeRoute][ASSIGN][SKIP] probe=${nodeId} kind=${routedNode?.nodeKind ?? 'unknown'}`);
      addMeshLog('Thread route configuration is only available for Probes.', nodeId);
      return;
    }

    if (Platform.OS === 'android' &&
        (!canConnectLocalNode(routedNode) ||
         (bridge && !canConnectLocalNode(bridge)) ||
         (previousBridgeId && !canConnectLocalNode(meshNodesRef.current.find(n => n.id === previousBridgeId) ?? routedNode)))) {
      setMeshStatus('Associate the Probe and its Lamp with claimed ARC IDs before changing the route.');
      return;
    }

    if (!bridgeId) {
      if (previousBridgeId) {
        try {
          await mesh.configureProbeGatewayRoute(nodeId, previousBridgeId, 0);
        } catch (err: any) {
          const detail = `Could not return Probe to standalone BLE: ${err?.message ?? String(err)}`;
          console.log(`[ProbeRoute][UNASSIGN][FAIL] probe=${nodeId} bridge=${previousBridgeId} error=${err?.message ?? String(err)}`);
          addMeshLog(detail, nodeId);
          return;
        }
      }

      setMeshNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                assignedGatewayId: bridgeKind === 'gateway' ? null : node.assignedGatewayId ?? null,
                assignedBridgeId: bridgeKind === 'lamp' ? null : node.assignedBridgeId ?? null,
                probeGatewayRoute: null,
                probeActiveTelemetryRoute: node.connected ? 'direct' : 'none',
                probePowerRole: node.connected ? 'activeBle' : 'standalone',
                gatewayChildState: null,
                lastSeenViaGatewayAt: bridgeKind === 'gateway' ? null : node.lastSeenViaGatewayAt ?? null,
                lastSeenViaLampAt: bridgeKind === 'lamp' ? null : node.lastSeenViaLampAt ?? null,
              }
            : node
        )
      );
      addMeshLog(`returned ${routedNode.name} to standalone BLE`, nodeId);
      console.log(`[ProbeRoute][UNASSIGN][DONE] probe=${nodeId} bridge=${previousBridgeId ?? 'none'} mode=0`);
      return;
    }

    // The persisted-route retry effect observes the optimistic assignment below.
    // Mark this route before updating state so it cannot race the explicit write
    // and send a duplicate 0x52 command.
    probeRouteRetryKeysRef.current.add(`${nodeId}:${bridgeId}`);

    setMeshNodes((prev) =>
      prev.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              assignedGatewayId: bridgeKind === 'gateway' ? bridgeId : null,
              assignedBridgeId: bridgeKind === 'lamp' ? bridgeId : null,
              probeGatewayRoute: {
                gatewayId: bridgeId,
                state: 'config-requested',
                updatedAt: routeUpdatedAt,
                detail: `Probe-to-${bridgeKind === 'gateway' ? 'Gateway' : 'Lamp'} Thread route configuration requested.`,
              },
              // Assignment is intent, not proof of Thread attachment. Routed
              // telemetry or a child-confirmation frame promotes this to an
              // active sleepy-child route below.
              probeActiveTelemetryRoute: 'none',
              probePowerRole: 'unknown',
              gatewayChildState: 'unknown',
              lastSeenViaGatewayAt: bridgeKind === 'gateway' ? null : node.lastSeenViaGatewayAt ?? null,
              lastSeenViaLampAt: bridgeKind === 'lamp' ? null : node.lastSeenViaLampAt ?? null,
            }
          : node
      )
    );

    addMeshLog(`assigned ${routedNode.name} to ${bridge?.name ?? (bridgeKind === 'gateway' ? 'Gateway' : 'Lamp')}`, nodeId);
    console.log(
      `[ProbeRoute][ASSIGN][BEGIN] probe=${nodeId} bridge=${bridgeId} bridgeKind=${bridgeKind}`
    );

    try {
      const routeResult = await mesh.configureProbeGatewayRoute(nodeId, bridgeId, 1);
      console.log(`[ProbeRoute][ASSIGN][RESULT] probe=${nodeId} bridge=${bridgeId} bridgeKind=${bridgeKind} result=${JSON.stringify(routeResult)}`);

      // Mode 1 disables the Probe's direct telemetry path. Switch the native
      // telemetry subscription to the bridge so its Loader-TX notifications
      // (including routed 0x51 Probe frames) reach JavaScript.
      try {
        await mesh.connectNode(bridgeId);
        console.log(`[ProbeRoute][BRIDGE][CONNECTED] probe=${nodeId} bridge=${bridgeId} bridgeKind=${bridgeKind}`);
      } catch (bridgeError: any) {
        console.log(
          `[ProbeRoute][BRIDGE][CONNECT_FAIL] probe=${nodeId} bridge=${bridgeId} bridgeKind=${bridgeKind} error=${bridgeError?.message ?? String(bridgeError)}`
        );
        addMeshLog(
          `Probe route requested, but ${bridgeKind} telemetry subscription failed: ${bridgeError?.message ?? String(bridgeError)}`,
          bridgeId
        );
      }
      setMeshNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                assignedGatewayId: bridgeKind === 'gateway' ? bridgeId : null,
                assignedBridgeId: bridgeKind === 'lamp' ? bridgeId : null,
                probeGatewayRoute: {
                  gatewayId: bridgeId,
                  state: routeResult.state,
                  updatedAt: Date.now(),
                  detail: routeResult.detail,
                },
                probeActiveTelemetryRoute: 'none',
                probePowerRole: 'unknown',
                gatewayChildState: 'unknown',
                lastSeenViaGatewayAt: bridgeKind === 'gateway' ? null : node.lastSeenViaGatewayAt ?? null,
                lastSeenViaLampAt: bridgeKind === 'lamp' ? null : node.lastSeenViaLampAt ?? null,
              }
            : node
        )
      );
      addMeshLog(routeResult.detail, nodeId);
    } catch (err: any) {
      const detail = `Probe ${bridgeKind === 'gateway' ? 'Gateway' : 'Lamp'} route config failed: ${err?.message ?? String(err)}`;
      console.log(`[ProbeRoute][ASSIGN][FAIL] probe=${nodeId} bridge=${bridgeId} bridgeKind=${bridgeKind} error=${err?.message ?? String(err)}`);
      setMeshNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                assignedGatewayId: bridgeKind === 'gateway' ? bridgeId : null,
                assignedBridgeId: bridgeKind === 'lamp' ? bridgeId : null,
                probeGatewayRoute: {
                  gatewayId: bridgeId,
                  state: 'failed',
                  updatedAt: Date.now(),
                  detail,
                },
                probeActiveTelemetryRoute: node.connected ? 'direct' : 'none',
                probePowerRole: node.connected ? 'activeBle' : 'unknown',
                gatewayChildState: null,
              }
            : node
        )
      );
      addMeshLog(detail, nodeId);
    }
  };

  const assignNodeToGateway = (nodeId: string, gatewayId: string | null) =>
    assignNodeToBridge(nodeId, gatewayId, 'gateway');

  const assignNodeToLamp = (nodeId: string, lampId: string | null) =>
    assignNodeToBridge(nodeId, lampId, 'lamp');

  useEffect(() => {
    if (!meshEnabled || !mesh.isAvailable || !meshTransportReady) return;
    meshNodes.filter(node => !isLegacyMeshNode(node)).forEach((node) => {
      const bridgeId = node.assignedGatewayId ?? node.assignedBridgeId;
      const bridgeKind = node.assignedGatewayId ? 'Gateway' : 'Lamp';
      if (node.nodeKind !== 'probe' || !bridgeId) return;
      const bridgeNode = meshNodes.find(candidate => candidate.id === bridgeId);
      if (Platform.OS === 'android' && (!canConnectLocalNode(node) || !bridgeNode || !canConnectLocalNode(bridgeNode))) return;

      const canonicalProbe = canonicalDeviceForNode(node, portalDevices);
      if (canonicalProbe && (!canonicalProbe.access.canEditSettings || portalInventoryCached)) return;
      const retryKey = `${node.id}:${bridgeId}`;
      if (probeRouteRetryKeysRef.current.has(retryKey)) return;
      probeRouteRetryKeysRef.current.add(retryKey);

      // The native route-config path retrieves and temporarily connects the
      // Probe without making it the telemetry owner. Restore the RAM-backed
      // mode-1 policy once per app launch even when no direct Probe BLE link
      // is represented in JavaScript.
      addMeshLog(`retrying Probe ${bridgeKind} route-set for ${node.name}`, node.id);
      mesh
        .configureProbeGatewayRoute(node.id, bridgeId, 1)
        .then(async (routeResult) => {
          try {
            await mesh.connectNode(bridgeId);
            console.log(`[ProbeRoute][BRIDGE][CONNECTED] probe=${node.id} bridge=${bridgeId} bridgeKind=${bridgeKind} source=retry`);
          } catch (bridgeError: any) {
            console.log(
              `[ProbeRoute][BRIDGE][CONNECT_FAIL] probe=${node.id} bridge=${bridgeId} bridgeKind=${bridgeKind} source=retry error=${bridgeError?.message ?? String(bridgeError)}`
            );
          }
          setMeshNodes((prev) =>
            prev.map((current) =>
              current.id === node.id
                ? {
                    ...current,
                    probeGatewayRoute: {
                      gatewayId: bridgeId,
                      state: routeResult.state,
                      updatedAt: Date.now(),
                      detail: routeResult.detail,
                    },
                    probeActiveTelemetryRoute: isRoutedProbeTelemetryRecent(current)
                      ? (node.assignedGatewayId ? 'viaGateway' : 'viaLamp')
                      : 'none',
                    probePowerRole: isRoutedProbeTelemetryRecent(current) ? 'sleepyChild' : 'unknown',
                    gatewayChildState: current.gatewayChildState ?? 'unknown',
                  }
                : current
            )
          );
          addMeshLog(routeResult.detail, node.id);
        })
        .catch((err: any) => {
          const detail = `Probe ${bridgeKind} route retry failed: ${err?.message ?? String(err)}`;
          setMeshNodes((prev) =>
            prev.map((current) =>
              current.id === node.id
                ? {
                    ...current,
                    probeGatewayRoute: {
                      gatewayId: bridgeId,
                      state: 'failed',
                      updatedAt: Date.now(),
                      detail,
                    },
                    probeActiveTelemetryRoute: current.connected ? 'direct' : 'none',
                    probePowerRole: current.connected ? 'activeBle' : 'unknown',
                    gatewayChildState: null,
                  }
                : current
            )
          );
          addMeshLog(detail, node.id);
        });
    });
  }, [mesh, meshEnabled, meshNodes, meshTransportReady]);

  const openAssignedNodeFromGateway = (node: MeshNode) => {
    setMeshEditNodeId(null);
    setMeshEditError('');

    setMeshSelectedNodeId(node.id);
    setActiveTabSafe(node.nodeKind === 'probe' ? 'sensors' : 'home');
  };

  const selectProbeForDataView = (node: MeshNode) => {
    setSelectedPortalProbeId(null);
    setSelectedProbeSourceId(node.id);
    setMeshSelectedNodeId(node.id);
    setProbePickerOpen(false);
    setActiveTabSafe('sensors');
  };

  const updateSelectedProbeSettings = (updater: (settings: ProbeSettings) => ProbeSettings) => {
    if (!selectedProbeNode) return;
    setProbeSettingsById((prev) => {
      const current = prev[selectedProbeNode.id] ?? buildDefaultProbeSettings(selectedProbeNode.id, selectedProbeNode.name);
      const next = updater(current);
      return {
        ...prev,
        [selectedProbeNode.id]: {
          ...next,
          probeId: selectedProbeNode.id,
          updatedAtMs: Date.now(),
        },
      };
    });
  };

  const updateSelectedProbeLocalSettings = (patch: Partial<ProbeSettings['localAppSettings']>) => {
    updateSelectedProbeSettings((settings) => ({
      ...settings,
      localAppSettings: {
        ...settings.localAppSettings,
        ...patch,
      },
    }));
  };

  const updateSelectedProbeDesiredSettings = (patch: Partial<ProbeSettings['desiredProbeSettings']>) => {
    if (!selectedProbeView.canEditSettings &&
        !(selectedProbeNode && localHardwareGrant(selectedProbeNode)?.device?.access.canEditSettings)) return;
    updateSelectedProbeSettings((settings) => ({
      ...settings,
      desiredProbeSettings: {
        ...settings.desiredProbeSettings,
        ...patch,
        commandState: patch.commandState ?? 'unsupported',
      },
    }));
  };


  const handleArcAuthSubmit = async () => {
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      const session = authMode === 'register'
        ? await registerArcCloudEmail(authEmail, authPassword)
        : await signInArcCloudEmail(authEmail, authPassword);
      setAuthMessage(
        authMode === 'register'
          ? 'Account created. Check your email and verify before telemetry unlocks.'
          : session.emailVerified
            ? 'Signed in.'
            : 'Signed in. Verify your email before telemetry unlocks.'
      );
    } catch (err: any) {
      setAuthMessage(err?.message ? String(err.message) : 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleArcVerificationResend = async () => {
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      await resendArcCloudVerification();
      setAuthMessage('Verification email sent.');
    } catch (err: any) {
      setAuthMessage(err?.message ? String(err.message) : t('auth.verifySendFailed'));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleArcPasswordReset = async () => {
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      await resetArcCloudPassword(authEmail);
      setAuthMessage(t('auth.resetSent'));
    } catch (err: any) {
      setAuthMessage(err?.message ? String(err.message) : t('auth.resetFailed'));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleArcSignOut = async () => {
    setAuthSigningOut(true);
    try {
      await signOutArcCloud();
      setArcCloudSession(signedOutArcCloudSession());
      setAuthPassword('');
      setAuthMessage(null);
      setAccountOpen(false);
      setChildAccountOpen(false);
      setSettingsOpen(false);
      setLanguagePickerOpen(false);
      setAccountProfile(emptyArcAccountProfile);
      setAccountProfileReady(false);
    } catch (error: any) {
      Alert.alert(t('account.signOut'), error?.message ?? 'Sign out failed.');
    } finally {
      setAuthSigningOut(false);
    }
  };

  const openAccountView = async () => {
    setAccountOpen(true);
    setAccountMessage(null);
    if (!accountProfileReady) {
      const profile = await loadArcAccountProfile();
      setAccountProfile(profile);
      setAccountProfileReady(true);
    }
  };

  const updateAccountProfile = (patch: Partial<ArcAccountProfile>) => {
    setAccountProfile((prev) => ({ ...prev, ...patch }));
  };

  const handleSaveAccountProfile = async () => {
    setAccountSaving(true);
    setAccountMessage(null);
    try {
      await saveArcAccountProfile(accountProfile);
      setAccountMessage(t('account.saved'));
    } catch (err: any) {
      setAccountMessage(err?.message ? String(err.message) : t('account.saveFailed'));
    } finally {
      setAccountSaving(false);
    }
  };

  const handleCreateChildAccount = async () => {
    setChildAccountMessage(null);
    try {
      const invite = await createArcChildAccountInvite({
        email: childEmail,
        displayName: childName,
        relation: childRelation,
      });
      setChildAccountMessage(
        `${invite.role} prepared for ${invite.email}. Backend Admin SDK invite is required to create the Firebase user.`
      );
    } catch (err: any) {
      setChildAccountMessage(err?.message ? String(err.message) : t('account.childPrepareFailed'));
    }
  };

  const renderLoginLanding = () => (
    <SafeAreaView style={styles.authScreen}>
      <StatusBar
        barStyle={resolvedAppTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={appTheme.colors.backgroundDeep}
      />
      <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
        <View style={styles.authCard}>
          <Text style={styles.logo}>{t('auth.cloud')}</Text>
          <Text style={styles.title}>{t('auth.signInWorkspace')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.workspaceHint')}
          </Text>

          {!arcCloudFirebaseConfigured ? (
            <View style={styles.authNotice}>
              <Text style={styles.muted}>
                {t('auth.firebaseMissing')}
              </Text>
            </View>
          ) : null}

          <View style={styles.authModeRow}>
            {(['signin', 'register'] as const).map((mode) => {
              const active = authMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  style={[styles.authModeButton, active && styles.authModeButtonActive]}
                  onPress={() => setAuthMode(mode)}
                >
                  <Text style={[styles.authModeText, active && styles.authModeTextActive]}>
                    {mode === 'signin' ? t('auth.signIn') : t('auth.createAccount')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('auth.email')}</Text>
            <TextInput
              style={styles.input}
              value={authEmail}
              onChangeText={setAuthEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={appTheme.colors.placeholder}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{t('auth.password')}</Text>
            <TextInput
              style={styles.input}
              value={authPassword}
              onChangeText={setAuthPassword}
              secureTextEntry
              placeholder={authMode === 'register' ? t('auth.passwordHint') : t('auth.password')}
              placeholderTextColor={appTheme.colors.placeholder}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, styles.actionButton]}
            onPress={handleArcAuthSubmit}
            disabled={!arcCloudFirebaseConfigured || authBusy}
          >
            <Text style={styles.buttonText}>{authBusy ? t('auth.working') : authMode === 'signin' ? t('auth.signIn') : t('auth.createVerify')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonSecondary} onPress={handleArcPasswordReset} disabled={!arcCloudFirebaseConfigured || authBusy}>
            <Text style={styles.buttonTextLight}>{t('auth.forgotPassword')}</Text>
          </TouchableOpacity>

          {authMessage ? <Text style={styles.authMessage}>{authMessage}</Text> : null}

          <View style={styles.authNotice}>
            <Text style={styles.sectionTitle}>{t('auth.sharedAccounts')}</Text>
            <Text style={styles.muted}>
              {t('auth.sharedAccountsHint')}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  const renderEmailVerificationGate = () => (
    <SafeAreaView style={styles.authScreen}>
      <StatusBar
        barStyle={resolvedAppTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={appTheme.colors.backgroundDeep}
      />
      <View style={styles.authContentCentered}>
        <View style={styles.authCard}>
          <Text style={styles.logo}>{t('auth.cloud')}</Text>
          <Text style={styles.title}>{t('auth.verifyEmail')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.verifyHint', { email: arcCloudSession.email ?? t('auth.unknownEmail') })}
          </Text>
          <TouchableOpacity style={[styles.button, styles.actionButton]} onPress={handleArcVerificationResend} disabled={authBusy}>
            <Text style={styles.buttonText}>{authBusy ? t('auth.sending') : t('auth.resendVerification')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonSecondary} onPress={handleArcSignOut}>
            <Text style={styles.buttonTextLight}>{t('account.signOut')}</Text>
          </TouchableOpacity>
          {authMessage ? <Text style={styles.authMessage}>{authMessage}</Text> : null}
        </View>
      </View>
    </SafeAreaView>
  );

  const renderChildAccountModal = () => (
    <Modal visible={childAccountOpen} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.modalTitle}>{t('account.childAccessTitle')}</Text>
            <TouchableOpacity style={styles.iconButton} onPress={() => setChildAccountOpen(false)}>
              <Text style={styles.iconButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.muted}>
              {t('account.childAccessHint')}
            </Text>
            <View style={styles.field}>
              <Text style={styles.label}>{t('auth.email')}</Text>
              <TextInput style={styles.input} value={childEmail} onChangeText={setChildEmail} autoCapitalize="none" keyboardType="email-address" />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{t('account.displayName')}</Text>
              <TextInput style={styles.input} value={childName} onChangeText={setChildName} />
            </View>
            <View style={styles.graphChipWrap}>
              {(['student', 'child', 'family_viewer'] as const).map((relation) => {
                const active = childRelation === relation;
                return (
                  <TouchableOpacity
                    key={relation}
                    style={[styles.nodeKindButton, active && styles.nodeKindButtonActive]}
                    onPress={() => setChildRelation(relation)}
                  >
                    <Text style={[styles.nodeKindButtonText, active && styles.nodeKindButtonTextActive]}>{relation.replace('_', ' ')}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.authNotice}>
              <Text style={styles.sectionTitle}>{t('account.permissions')}</Text>
              <Text style={styles.muted}>{t('account.canView', { value: t('common.yes') })}</Text>
              <Text style={styles.muted}>{t('account.canEdit', { value: t('common.no') })}</Text>
              <Text style={styles.muted}>{t('account.canClaim', { value: t('common.no') })}</Text>
              <Text style={styles.muted}>{t('account.canManage', { value: t('common.no') })}</Text>
              <Text style={styles.muted}>{t('account.canSend', { value: t('common.no') })}</Text>
            </View>
            <TouchableOpacity style={[styles.button, styles.actionButton]} onPress={handleCreateChildAccount}>
              <Text style={styles.buttonText}>{t('account.prepareInvite')}</Text>
            </TouchableOpacity>
            {childAccountMessage ? <Text style={styles.authMessage}>{childAccountMessage}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderAccountModal = () => (
    <Modal visible={accountOpen} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.modalTitle}>{t('account.userAccount')}</Text>
            <TouchableOpacity style={styles.iconButton} onPress={() => setAccountOpen(false)}>
              <Text style={styles.iconButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {!arcCloudSession.userId ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('auth.signInWorkspace')}</Text>
                <Text style={styles.muted}>{t('auth.workspaceHint')}</Text>
                <View style={styles.authModeRow}>
                  {(['signin', 'register'] as const).map((mode) => {
                    const active = authMode === mode;
                    return (
                      <TouchableOpacity
                        key={mode}
                        style={[styles.authModeButton, active && styles.authModeButtonActive]}
                        onPress={() => setAuthMode(mode)}
                      >
                        <Text style={[styles.authModeText, active && styles.authModeTextActive]}>
                          {mode === 'signin' ? t('auth.signIn') : t('auth.createAccount')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>{t('auth.email')}</Text>
                  <TextInput
                    style={styles.input}
                    value={authEmail}
                    onChangeText={setAuthEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    placeholder="you@example.com"
                    placeholderTextColor={appTheme.colors.placeholder}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>{t('auth.password')}</Text>
                  <TextInput
                    style={styles.input}
                    value={authPassword}
                    onChangeText={setAuthPassword}
                    secureTextEntry
                    placeholder={authMode === 'register' ? t('auth.passwordHint') : t('auth.password')}
                    placeholderTextColor={appTheme.colors.placeholder}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.button, styles.actionButton]}
                  onPress={handleArcAuthSubmit}
                  disabled={!arcCloudFirebaseConfigured || authBusy}
                >
                  <Text style={styles.buttonText}>
                    {authBusy ? t('auth.working') : authMode === 'signin' ? t('auth.signIn') : t('auth.createVerify')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.buttonSecondary} onPress={handleArcPasswordReset} disabled={!arcCloudFirebaseConfigured || authBusy}>
                  <Text style={styles.buttonTextLight}>{t('auth.forgotPassword')}</Text>
                </TouchableOpacity>
                {authMessage ? <Text style={styles.authMessage}>{authMessage}</Text> : null}
              </View>
            ) : !arcCloudSession.emailVerified ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('auth.verifyEmail')}</Text>
                <Text style={styles.muted}>{t('auth.verifyHint', { email: arcCloudSession.email ?? t('auth.unknownEmail') })}</Text>
                <TouchableOpacity style={[styles.button, styles.actionButton]} onPress={handleArcVerificationResend} disabled={authBusy}>
                  <Text style={styles.buttonText}>{authBusy ? t('auth.sending') : t('auth.resendVerification')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.buttonSecondary} onPress={handleArcSignOut}>
                  <Text style={styles.buttonTextLight}>{t('account.signOut')}</Text>
                </TouchableOpacity>
                {authMessage ? <Text style={styles.authMessage}>{authMessage}</Text> : null}
              </View>
            ) : (
              <>
            <View style={styles.accountHeaderCard}>
              <View style={styles.accountAvatarFrame}>
                {accountProfile.avatarUrl.trim() ? (
                  <Image source={{ uri: accountProfile.avatarUrl.trim() }} style={styles.accountAvatarImage} />
                ) : (
                  <Text style={styles.accountAvatarInitial}>
                    {(accountProfile.displayName || arcCloudSession.email || 'A').slice(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={styles.accountHeaderCopy}>
                <Text style={styles.sectionTitle}>{accountProfile.displayName || arcCloudSession.email || t('account.arcUser')}</Text>
                <Text style={styles.muted}>{arcCloudSession.email ?? t('account.noEmail')}</Text>
                <Text style={styles.muted}>{t('account.role', { role: arcCloudSession.role.replace('_', ' ') })}</Text>
                <Text style={styles.muted}>{t('account.emailVerified', { value: arcCloudSession.emailVerified ? t('common.yes') : t('common.no') })}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('account.profile')}</Text>
              <View style={styles.field}>
                <Text style={styles.label}>{t('account.avatarUrl')}</Text>
                <TextInput style={styles.input} value={accountProfile.avatarUrl} onChangeText={(value) => updateAccountProfile({ avatarUrl: value })} autoCapitalize="none" />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t('account.displayName')}</Text>
                <TextInput style={styles.input} value={accountProfile.displayName} onChangeText={(value) => updateAccountProfile({ displayName: value })} />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t('account.phone')}</Text>
                <TextInput style={styles.input} value={accountProfile.phone} onChangeText={(value) => updateAccountProfile({ phone: value })} keyboardType="phone-pad" />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('account.address')}</Text>
              <View style={styles.field}>
                <Text style={styles.label}>{t('account.address')}</Text>
                <TextInput style={styles.input} value={accountProfile.addressLine1} onChangeText={(value) => updateAccountProfile({ addressLine1: value })} />
              </View>
              <View style={styles.rowBetween}>
                <View style={[styles.field, styles.accountHalfField]}>
                  <Text style={styles.label}>{t('account.postalCode')}</Text>
                  <TextInput style={styles.input} value={accountProfile.postalCode} onChangeText={(value) => updateAccountProfile({ postalCode: value })} />
                </View>
                <View style={[styles.field, styles.accountHalfField]}>
                  <Text style={styles.label}>{t('account.city')}</Text>
                  <TextInput style={styles.input} value={accountProfile.city} onChangeText={(value) => updateAccountProfile({ city: value })} />
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t('account.country')}</Text>
                <TextInput style={styles.input} value={accountProfile.country} onChangeText={(value) => updateAccountProfile({ country: value })} />
              </View>
            </View>

            {arcCloudSession.role !== 'child_viewer' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('account.billingShop')}</Text>
                <Text style={styles.muted}>{t('account.billingHint')}</Text>
                <View style={styles.field}>
                  <Text style={styles.label}>{t('account.billingEmail')}</Text>
                  <TextInput style={styles.input} value={accountProfile.billingEmail} onChangeText={(value) => updateAccountProfile({ billingEmail: value })} autoCapitalize="none" keyboardType="email-address" />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>{t('account.subscriptionStatus')}</Text>
                  <TextInput style={styles.input} value={accountProfile.subscriptionStatus} onChangeText={(value) => updateAccountProfile({ subscriptionStatus: value })} />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>{t('account.subscriptionNote')}</Text>
                  <TextInput style={[styles.input, styles.accountMultilineInput]} value={accountProfile.subscriptionNote} onChangeText={(value) => updateAccountProfile({ subscriptionNote: value })} multiline />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>{t('account.shopCustomerRef')}</Text>
                  <TextInput style={styles.input} value={accountProfile.shopCustomerRef} onChangeText={(value) => updateAccountProfile({ shopCustomerRef: value })} autoCapitalize="none" />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>{t('account.paymentNote')}</Text>
                  <TextInput style={[styles.input, styles.accountMultilineInput]} value={accountProfile.paymentNote} onChangeText={(value) => updateAccountProfile({ paymentNote: value })} multiline />
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('account.permissions')}</Text>
              <Text style={styles.muted}>{t('account.canView', { value: arcCloudSession.permissions.canViewTelemetry ? t('common.yes') : t('common.no') })}</Text>
              <Text style={styles.muted}>{t('account.canEdit', { value: arcCloudSession.permissions.canEditSettings ? t('common.yes') : t('common.no') })}</Text>
              <Text style={styles.muted}>{t('account.canClaim', { value: arcCloudSession.permissions.canClaimDevices ? t('common.yes') : t('common.no') })}</Text>
              <Text style={styles.muted}>{t('account.canManage', { value: arcCloudSession.permissions.canManageMembers ? t('common.yes') : t('common.no') })}</Text>
              <Text style={styles.muted}>{t('account.canSend', { value: arcCloudSession.permissions.canSendCommands ? t('common.yes') : t('common.no') })}</Text>
            </View>

            {arcCloudSession.permissions.canManageMembers ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('account.childAccounts')}</Text>
                <Text style={styles.muted}>{t('account.childAccountsHint')}</Text>
                <TouchableOpacity style={styles.buttonSecondary} onPress={() => setChildAccountOpen(true)}>
                  <Text style={styles.buttonTextLight}>{t('account.childLogin')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity style={[styles.button, styles.actionButton]} onPress={handleSaveAccountProfile} disabled={accountSaving}>
              <Text style={styles.buttonText}>{accountSaving ? t('account.saving') : t('account.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonSecondary} onPress={handleArcSignOut}>
              <Text style={styles.buttonTextLight}>{t('account.signOut')}</Text>
            </TouchableOpacity>
            {accountMessage ? <Text style={styles.authMessage}>{accountMessage}</Text> : null}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const applySelectedProbeSampleInterval = async () => {
    const node = selectedProbeNode;
    const desired = selectedProbeSettings?.desiredProbeSettings.regularMeasurementIntervalSec;
    const grant = node ? localHardwareGrant(node) : undefined;
    if (!node || !node.connected || node.nodeKind !== 'probe' ||
        node.assignedGatewayId || node.assignedBridgeId ||
        lampHardwareIdentityRef.current[node.id]?.state !== 'identified' ||
        lampHardwareIdentityRef.current[node.id]?.deviceType !== 'probe' ||
        !grant?.device?.access.canEditSettings || Platform.OS !== 'ios' ||
        typeof desired !== 'number' || probeSampleBusyById[node.id]) return;
    const nodeId = node.id;
    const expectedSession = lampHardwareIdentityRef.current[nodeId]?.session;
    setProbeSampleBusyById(prev => ({...prev,[nodeId]:true}));
    setProbeSampleErrorById(prev => ({...prev,[nodeId]:''}));
    updateSelectedProbeDesiredSettings({commandState:'pending'});
    try {
      const reply = await mesh.setProbeSampleInterval(nodeId,desired);
      if (lampHardwareIdentityRef.current[nodeId]?.session !== expectedSession ||
          !meshNodesRef.current.some(n => n.id===nodeId && n.connected))
        throw new Error('Probe connection changed during Apply');
      setProbeSampleConfirmedById(prev => ({...prev,[nodeId]:reply.activeSeconds}));
      updateSelectedProbeDesiredSettings({commandState:'applied'});
      addMeshLog(`[ProbeSample][ACK_CONFIRMED] probe=${nodeId} active=${reply.activeSeconds}s persisted=${reply.persisted ? 1 : 0}`,nodeId);
    } catch(error:any) {
      updateSelectedProbeDesiredSettings({commandState:'failed'});
      const reason=String(error?.message ?? error);
      setProbeSampleErrorById(prev => ({...prev,[nodeId]:reason}));
      addMeshLog(`[ProbeSample][FAIL] probe=${nodeId} reason=${reason}`,nodeId);
    } finally {
      setProbeSampleBusyById(prev => ({...prev,[nodeId]:false}));
    }
  };

  const setSelectedProbeRegularInterval = (regularMeasurementIntervalSec: number) => {
    updateSelectedProbeDesiredSettings({
      powerProfile: 'custom',
      regularMeasurementIntervalSec,
      commandState: 'local_only',
    });
  };

  const setSelectedProbeGasInterval = (gasMeasurementIntervalSec: number | null) => {
    updateSelectedProbeDesiredSettings({
      powerProfile: 'custom',
      gasMeasurementIntervalSec,
    });
  };


  const renderSettingsLanguagePicker = () => (
    <>
      <View style={styles.settingsSubHeader}>
        <TouchableOpacity
          style={styles.settingsSubBackButton}
          onPress={() => setLanguagePickerOpen(false)}
          accessibilityLabel={t('access.backHome')}
        >
          <Text style={styles.settingsSubBackText}>←</Text>
        </TouchableOpacity>
        <View style={styles.settingsSubHeaderCopy}>
          <Text style={styles.modalTitle}>{t('language.title')}</Text>
          <Text style={styles.muted}>{t('language.subtitle')}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.settingsLanguageContent}>
        <View style={styles.languagePickerList}>
          {languageOptions.map((option) => {
            const selected = languagePreference === option.value;
            const label = option.value === 'system' ? t('common.systemDefault') : option.label;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.languagePickerRow, selected && styles.languagePickerRowSelected]}
                onPress={() => {
                  setLanguagePreference(option.value);
                  setLanguagePickerOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.languagePickerRowText, selected && styles.languagePickerRowTextSelected]}>
                  {label}
                </Text>
                <Text style={[styles.languagePickerCheck, selected && styles.languagePickerCheckSelected]}>
                  {selected ? '✓' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </>
  );

  const renderLocalStorageView = () => (
    <View style={styles.storageScreen}>
      <View style={styles.storageHeader}>
        <TouchableOpacity
          style={styles.storageBackButton}
          onPress={closeLocalStorage}
          accessibilityLabel={t('access.backHome')}
        >
          <Text style={styles.storageBackText}>←</Text>
        </TouchableOpacity>
        <View style={styles.storageHeaderCopy}>
          <Text style={styles.storageTitle}>{t('storage.title')}</Text>
          <Text style={styles.storageSubtitle} numberOfLines={1}>{t('storage.subtitle')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.storageContent} showsVerticalScrollIndicator={false}>
        <View style={styles.storageCard}>
          <View style={styles.storageSummaryHeader}>
            <View style={styles.storageSummaryCopy}>
              <Text style={styles.storageSectionTitle}>
                {t('storage.recordCount', { count: localTelemetryStats.totalRecords, countFormatted: formatNumber(localTelemetryStats.totalRecords) })}
              </Text>
              <Text style={styles.storageMeta}>
                {localTelemetryStats.oldestTimestampMs ? formatDate(localTelemetryStats.oldestTimestampMs) : t('common.noHistory')}
                {' → '}
                {localTelemetryStats.newestTimestampMs ? formatDate(localTelemetryStats.newestTimestampMs) : t('common.noHistory')}
              </Text>
            </View>
            <Text style={styles.storageSizeValue}>
              {formatNumber(localTelemetryStats.fileSizeBytes / (1024 * 1024), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB
            </Text>
          </View>

          <View style={styles.storageStatGrid}>
            <View style={styles.storageStatItem}>
              <Text style={styles.storageStatValue}>{formatNumber(localTelemetryStats.lampRecords)}</Text>
              <Text style={styles.storageStatLabel}>{t('storage.lampRecords')}</Text>
            </View>
            <View style={styles.storageStatItem}>
              <Text style={styles.storageStatValue}>{formatNumber(localTelemetryStats.probeRecords)}</Text>
              <Text style={styles.storageStatLabel}>{t('storage.probeRecords')}</Text>
            </View>
            <View style={styles.storageStatItem}>
              <Text style={styles.storageStatValue}>{formatNumber(localTelemetryStats.pendingCloudRecords)}</Text>
              <Text style={styles.storageStatLabel}>{t('storage.pendingCloudSync')}</Text>
            </View>
            <View style={styles.storageStatItem}>
              <Text style={styles.storageStatValue}>{formatNumber(localTelemetryStats.syncedCloudRecords)}</Text>
              <Text style={styles.storageStatLabel}>{t('storage.syncedRecords')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.storageCard}>
          <Text style={styles.storageSectionTitle}>{t('storage.devices')}</Text>
          <View style={styles.storageDeviceList}>
            {localTelemetryStats.devices.length ? localTelemetryStats.devices.map((device) => {
              const nodeName = meshNodes.find((node) => node.id === device.deviceId)?.name ?? device.deviceId;
              return (
                <View key={device.key} style={styles.storageDeviceRow}>
                  <View style={styles.storageDeviceCopy}>
                    <Text style={styles.storageDeviceName} numberOfLines={1} ellipsizeMode="tail">
                      {device.kind === 'lamp' ? t('node.lamp') : t('node.probe')} · {nodeName}
                    </Text>
                    <Text style={styles.storageMeta}>
                      {device.oldestTimestampMs ? formatDate(device.oldestTimestampMs) : '--'} → {' '}
                      {device.newestTimestampMs ? formatDate(device.newestTimestampMs) : '--'}
                    </Text>
                  </View>
                  <Text style={styles.storageDeviceCount}>{formatNumber(device.recordCount)}</Text>
                </View>
              );
            }) : <Text style={styles.storageMeta}>{t('storage.empty')}</Text>}
          </View>
        </View>

        <View style={styles.storageCard}>
          <Text style={styles.storageSectionTitle}>{t('storage.deleteTitle')}</Text>
          <Text style={styles.storageMeta}>{t('storage.preserve')}</Text>

          <View style={styles.storageDateRow}>
            <View style={styles.storageDateField}>
              <Text style={styles.label}>{t('storage.from')}</Text>
              <TextInput
                style={styles.input}
                value={localDeleteFrom}
                onChangeText={setLocalDeleteFrom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={appTheme.colors.placeholder}
              />
            </View>
            <View style={styles.storageDateField}>
              <Text style={styles.label}>{t('storage.to')}</Text>
              <TextInput
                style={styles.input}
                value={localDeleteTo}
                onChangeText={setLocalDeleteTo}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={appTheme.colors.placeholder}
              />
            </View>
          </View>

          <Text style={styles.label}>{t('storage.scope')}</Text>
          <View style={styles.graphChipWrap}>
            <TouchableOpacity
              style={[styles.nodeKindButton, !localDeleteDeviceKey && styles.nodeKindButtonActive]}
              onPress={() => setLocalDeleteDeviceKey(null)}
            >
              <Text style={[styles.nodeKindButtonText, !localDeleteDeviceKey && styles.nodeKindButtonTextActive]}>{t('storage.allDevices')}</Text>
            </TouchableOpacity>
            {localTelemetryStats.devices.map((device) => (
              <TouchableOpacity
                key={`scope-${device.key}`}
                style={[styles.nodeKindButton, localDeleteDeviceKey === device.key && styles.nodeKindButtonActive]}
                onPress={() => setLocalDeleteDeviceKey(device.key)}
              >
                <Text style={[styles.nodeKindButtonText, localDeleteDeviceKey === device.key && styles.nodeKindButtonTextActive]} numberOfLines={1}>
                  {device.kind === 'lamp' ? t('node.lamp') : t('node.probe')} · {meshNodes.find((node) => node.id === device.deviceId)?.name ?? device.deviceId}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.storageActionRow}>
            <TouchableOpacity
              style={[styles.storageDeleteButton, localStorageBusy && styles.headerActionButtonDisabled]}
              disabled={localStorageBusy}
              onPress={() => void handleDeleteLocalRange()}
            >
              <Text style={styles.storageDeleteButtonText}>{localStorageBusy ? '…' : t('storage.deleteTitle')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.storageClearButton, localStorageBusy && styles.headerActionButtonDisabled]}
              disabled={localStorageBusy}
              onPress={handleClearAllLocalHistory}
            >
              <Text style={styles.storageClearButtonText}>{t('storage.clearAll')}</Text>
            </TouchableOpacity>
          </View>
          {localStorageNotice ? <Text style={styles.storageMeta}>{localStorageNotice}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );



  const renderHome = () => (
    <View style={styles.homeContainer}>
      <View style={styles.homeTop}>
        <View style={styles.topBar}>
          {hasConnectedProbeLink ? (
            <TouchableOpacity
              style={styles.probeLink}
              onPress={() => setActiveTabSafe('sensors')}
              accessibilityLabel={t('access.openProbe')}
            >
              <Text style={styles.probeLinkText}>{mainProbeLabel}</Text>
            </TouchableOpacity>
          ) : <View style={styles.futureMenuSlot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />}
          <View style={styles.topBarActions}>
            <TouchableOpacity
              style={[styles.dataLink, (!canReadHistory) && styles.headerActionButtonDisabled]}
              onPress={() => {
                if (canReadHistory) void openProbeGraphView().catch(() => undefined);
              }}
              disabled={!canReadHistory}
              accessibilityLabel={selectedLampNode ? t('home.openHistory', { name: selectedLampName }) : mainDataLabel}
            >
              <Text style={styles.dataLinkText}>{mainDataLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, styles.homeIconButton]}
              onPress={() => setActiveTabSafe('manual')}
              accessibilityLabel={t('home.openManual')}
            >
              <Text style={styles.iconButtonText}>💡</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconButton, styles.homeIconButton, settingsLocked && styles.headerActionButtonDisabled]} onPress={() => !settingsLocked && setSettingsOpen(true)} disabled={settingsLocked} accessibilityLabel={t('home.openSettings')}>
              <Text style={styles.iconButtonText}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          {selectedLampNode ? (
            <TouchableOpacity
              style={[styles.rowBetween, styles.lampStatusHeader]}
              onPress={() => setLampSelectorOpen(true)}
              accessibilityLabel={t('home.selectLamp', { name: selectedLampName })}
            >
              <View><Text style={styles.cardTitle}>{selectedLampName}</Text>
                {cloudLampView ? <Text style={styles.muted}>{t('devices.latestCloudRecord')}{selectedLampView.sampledAt ? ` · ${formatTime(selectedLampView.sampledAt)}` : ''}</Text> : null}
              </View>
              <View style={styles.statusRow}>
                {lampHealth.style !== 'nominal' ? (
                  <Text style={[styles.lampHealthText, lampHealth.style === 'warning' && styles.lampHealthWarning, lampHealth.style === 'error' && styles.lampHealthError]}>{lampHealth.label}</Text>
                ) : null}
                <View style={[styles.dot, lampHealth.style === 'nominal' ? styles.dotConnected : lampHealth.style === 'warning' ? styles.dotWarning : styles.dotDisconnected]} />
              </View>
            </TouchableOpacity>
          ) : (
            <View style={[styles.rowBetween, styles.lampStatusHeader]}>
              <View />
              <View style={styles.statusRow}>
                <View style={[styles.dot, styles.dotDisconnected]} />
              </View>
            </View>
          )}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.muted}>{t('home.coreTemp')}</Text>
              <Text style={styles.statValue}>
                {activeStatus?.telemetryValidity?.coreTemp !== false ? `${activeStatus?.tempHeatsink.toFixed(1) ?? '--'} °C` : '-- °C'}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.muted}>{t('home.boardTemp')}</Text>
              <Text style={styles.statValue}>
                {activeStatus?.telemetryValidity?.boardTemp !== false ? `${activeStatus?.tempBoard.toFixed(1) ?? '--'} °C` : '-- °C'}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.muted}>{t('home.power')}</Text>
              <Text style={styles.statValue}>
                {activeStatus?.telemetryValidity?.power !== false && typeof (activeStatus?.displayPowerWatts ?? activeStatus?.inputPowerWatts) === 'number'
                  ? `${(activeStatus?.displayPowerWatts ?? activeStatus?.inputPowerWatts ?? 0).toFixed(1)} W`
                  : '-- W'}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.muted}>{t('home.fans')}</Text>
              <Text style={styles.statValue}>
                {activeStatus?.fan?.tachPresent
                  ? `${Math.round(activeStatus.fan.rpm)}${activeStatus.fan.tach2Present ? ` / ${Math.round(activeStatus.fan.tach2Rpm)}` : ''} ${t('unit.rpm')}`
                  : `-- ${t('unit.rpm')}`}
              </Text>
            </View>
          </View>
        </View>
        {latestLampHealthEvent ? (
          <TouchableOpacity
            style={[styles.lampHealthBanner, latestLampHealthEvent.severity === 'warning' ? styles.lampHealthBannerWarning : styles.lampHealthBannerError]}
            onPress={() => setLampHealthLogOpen(true)}
            accessibilityLabel={t('home.openWarnings')}
          >
            <Text style={styles.lampHealthBannerText} numberOfLines={1}>
              {`${latestLampHealthEvent.severity === 'warning' ? t('lamp.warning') : t('lamp.error')} · ${latestLampHealthEvent.message}`}
            </Text>
            <Text style={styles.lampHealthBannerTime}>
              {formatTime(latestLampHealthEvent.atMs)}
            </Text>
          </TouchableOpacity>
        ) : null}

      </View>

      <View
        style={[styles.homeBottom, { minHeight: containerHeight }]}
        onLayout={() => setMainVisualLayoutVersion((version) => {
          const nextVersion = version + 1;
          mainVisualLayoutVersionRef.current = nextVersion;
          const transitionToken = mainRevealPendingTokenRef.current || graphTransitionTokenRef.current;
          if (mainRevealPendingTokenRef.current) {
            console.log('[GraphTransition] Main visual onLayout', {
              token: transitionToken,
              nextVersion,
              minLayoutVersion: mainRevealMinLayoutVersionRef.current,
              window: `${Math.round(windowWidth)}x${Math.round(windowHeight)}`,
            });
          }
          return nextVersion;
        })}
      >
        <TimeRings
          connected={canControlLamp}
          power={remoteLampView ? activeStatus?.power ?? false : power}
          powerKnown={selectedLampView.telemetryAllowed && (!remoteLampView || typeof selectedLampView.device?.latestTelemetry?.values.lamp_output_enabled === 'boolean')}
          pendingPower={pendingPower}
          intensity={remoteLampView ? activeStatus?.inputPowerWatts ?? 0 : intensity}
          powerCeilingWatts={mainViewPowerCeilingWatts}
          hue={remoteLampView ? 0.5 : hue}
          saveState={saveState}
          dayCycle={dayCycle}
          hasLocation={hasLocation}
          scheduleEnabled={!selectedLampView.telemetryAllowed ? false : selectedLampNode && !selectedLampNode.connected
            ? Boolean(selectedLampView.schedule?.enabled || (!selectedLampView.device && meshLocalConfigByNodeRef.current[selectedLampNode.id]?.timerEnabled)) : timerEnabled}
          schedule={(() => {
            if (selectedLampView.device && !selectedLampNode?.connected) {
              return scheduleRing(selectedLampView.schedule) ?? { on: 0, off: 0, hueFadeStart: 0, hueFadeDuration: 0, morningFade: 0, nightFade: 0 };
            }
            if (meshEnabled && selectedLampNode) {
              const localConfig = meshLocalConfigByNodeRef.current[selectedLampNode.id]?.config;
              if (localConfig) {
                return {
                  on: clampNumber(localConfig.onMinutes, 0, 1439),
                  off: clampNumber(localConfig.offMinutes, 0, 1439),
                  // TimeRings still exposes the older visual schedule shape.
                  // Map its evening arc to schema-3 Evening until TimeRings is
                  // upgraded to render all three keyframes explicitly.
                  hueFadeStart: clampNumber(localConfig.eveningStartMinutes, 0, 1439),
                  hueFadeDuration: clampNumber(localConfig.eveningFadeMinutes, 0, 720),
                  morningFade: clampNumber(localConfig.sunriseFadeMinutes, 0, 720),
                  nightFade: clampNumber(localConfig.nightFadeMinutes, 0, 720),
                };
              }
            }

            return {
              on: timeToMinutes(onTime) ?? 0,
              off: timeToMinutes(offTime) ?? 0,
              hueFadeStart: timeToMinutes(eveningStartTime) ?? 0,
              hueFadeDuration: clampNumber(parseInt(eveningFadeMinutes, 10), 0, 720),
              morningFade: clampNumber(parseInt(sunriseFadeMinutes, 10), 0, 720),
              nightFade: clampNumber(parseInt(nightFadeMinutes, 10), 0, 720),
            };
          })()}
          nowMinutes={nowMinutes}
          timeFormat={timeFormat}
          onPowerToggle={handlePowerToggle}
          onIntensityChange={(value) => {
            if (!canControlLamp) return;
            pendingIntensityRef.current = true;
            setIntensity(clampNumber(value, 0, mainViewPowerCeilingWatts));
            setSaveState('dirty');
            if (arcAcceptanceTimer.current) clearTimeout(arcAcceptanceTimer.current);
            arcAcceptanceTimer.current = setTimeout(() => {
              pendingIntensityRef.current = false;
              pendingHueRef.current = false;
              setIntensity(confirmedArcValuesRef.current.intensity);
              setHue(confirmedArcValuesRef.current.hue);
              setSaveState('idle');
              arcAcceptanceTimer.current = null;
            }, 10_000);
          }}
          onSave={handleSend}
        />
      </View>
    </View>
  );

  const saveLampCadence = async () => {
    const id = selectedLampNode?.id;
    const confirmed = id ? lampCadenceById[id] : undefined;
    if (!id || !confirmed || !lampCadenceReadById[id] || lampCadenceBusyById[id]) return;
    if (!await authorizeLampCommand('canEditSettings')) return;
    if (selectedLampViewRef.current.node?.id !== id) return;
    setLampCadenceBusyById(prev => ({ ...prev, [id]: true }));
    try {
      const reply = await mesh.requestLampCadence(id, lampCadenceDraftById[id] ?? confirmed.seconds, confirmed.revision);
      setLampCadenceById(prev => ({ ...prev, [id]: reply }));
      setLampCadenceReadById(prev => ({ ...prev, [id]: true }));
      setLampCadenceErrorById(prev => ({ ...prev, [id]: '' }));
    } catch (error: any) {
      setLampCadenceDraftById(prev => ({ ...prev, [id]: confirmed.seconds }));
      setLampCadenceErrorById(prev => ({ ...prev, [id]: String(error.message ?? error) }));
      setLampCadenceReadById(prev => ({ ...prev, [id]: false }));
      // A lost ACK can follow a successful hardware commit. Reconcile instead
      // of calling the old cached value confirmed after an ambiguous timeout.
      try {
        const actual = await mesh.requestLampCadence(id);
        setLampCadenceById(prev => ({ ...prev, [id]: actual }));
        setLampCadenceDraftById(prev => ({ ...prev, [id]: actual.seconds }));
        setLampCadenceReadById(prev => ({ ...prev, [id]: true }));
      } catch { /* retain last known display, writes remain disabled */ }
    } finally { setLampCadenceBusyById(prev => ({ ...prev, [id]: false })); }
  };

  const renderManual = () => {
    const phases: Array<{ label: string; detail: string; colors: [string, string] }> = [
      { label: t('channel.phase', { number: 1 }), detail: '4000 K', colors: ['#a8d8ff', '#fff1a8'] },
      { label: t('channel.phase', { number: 2 }), detail: t('channel.orangeRed'), colors: ['#ffbd6b', '#f04444'] },
      { label: t('channel.phase', { number: 3 }), detail: t('channel.whiteBlue'), colors: ['#f8fafc', '#438ff5'] },
      { label: t('channel.phase', { number: 4 }), detail: '4000 K', colors: ['#fff1a8', '#a8d8ff'] },
    ];
    const connected = Boolean(meshEnabled && selectedLampNode && canControlLamp);
    const cadenceId = selectedLampNode?.id ?? '';
    const cadence = lampCadenceById[cadenceId];
    const cadenceBusy = Boolean(lampCadenceBusyById[cadenceId]);
    const cadenceRead = Boolean(lampCadenceReadById[cadenceId] && selectedLampNode?.connected);
    const cadenceEditable = Boolean(meshEnabled && selectedLampNode?.connected && canConfigureLamp && cadenceRead && !cadenceBusy);
    const cadenceSeconds = cadenceRead ? lampCadenceDraftById[cadenceId] ?? cadence?.seconds ?? 300 : cadence?.seconds ?? 300;
    const cadenceIndex = Math.max(0, LAMP_TELEMETRY_INTERVALS.indexOf(cadenceSeconds));
    const setCadenceIndex = (index: number) => { if (cadenceEditable) setLampCadenceDraftById(prev => ({ ...prev, [cadenceId]: LAMP_TELEMETRY_INTERVALS[Math.max(0, Math.min(9, index))] })); };
    const powerTargetState = activeStatus?.manualControl?.powerTargetActive ? t('common.active') : t('common.inactive');

    return (
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, styles.manualScreenContent]}>
        <View style={styles.screenHeader}>
          <Text style={styles.title}>{t('manual.title')}</Text>
          <Text style={styles.subtitle}>{t('manual.subtitle')}</Text>
        </View>

        <TouchableOpacity style={styles.manualLampSummary} onPress={() => setLampSelectorOpen(true)} accessibilityLabel={t('access.selectLamp')}>
          <View style={[styles.dot, connected ? styles.dotConnected : styles.dotDisconnected]} />
          <View style={styles.manualLampSummaryCopy}>
            <Text style={styles.manualLampSummaryName}>{selectedLampNode?.name ?? t('lamp.noSelected')}</Text>
            <Text style={styles.muted}>{connected ? t('manual.connectedProtection') : t('manual.connectLamp')}</Text>
          </View>
          {activeStatus?.manualControl?.limiting ? <Text style={styles.manualLimitPill}>{t('manual.limiting')}</Text> : null}
        </TouchableOpacity>

        <View style={styles.manualControlGroup}>
          <View style={styles.manualGroupHeader}>
            <Text style={styles.manualGroupTitle}>{t('manual.channels')}</Text>
            <Text style={styles.manualGroupHint}>{t('manual.tapHint')}</Text>
          </View>
          {phases.map((phase, index) => (
            <View key={phase.label} style={styles.manualControlRow}>
              <View style={styles.manualControlTitleRow}>
                <View>
                  <Text style={styles.manualSliderLabel}>{phase.label}</Text>
                  <Text style={styles.manualControlDetail}>{phase.detail}</Text>
                </View>
                <View style={styles.manualValueStepper}>
                  <ManualStepButton direction="minus" appStyles={styles} label={t('manual.decreasePhase', { phase: phase.label })} onPress={() => setManualChannel(index, clampNumber(manualChannels[index] - 1, 0, 100))} />
                  <Text style={styles.manualLargeValue}>{Math.round(manualChannels[index])}<Text style={styles.manualUnit}>%</Text></Text>
                  <ManualStepButton direction="plus" appStyles={styles} label={t('manual.increasePhase', { phase: phase.label })} onPress={() => setManualChannel(index, clampNumber(manualChannels[index] + 1, 0, 100))} />
                </View>
              </View>
              <ManualSlider appStyles={styles} value={manualChannels[index]} minimum={0} maximum={100} colors={phase.colors} onChange={(value) => setManualChannel(index, value)} />
            </View>
          ))}
          <View style={styles.manualControlButtonRow}>
            <TouchableOpacity style={[styles.manualApplyButton, (!connected || manualControlSending) && styles.headerActionButtonDisabled]} disabled={!connected || manualControlSending} onPress={() => void applyManualChannelControl(true)}>
              <Text style={styles.manualApplyButtonText}>{manualControlSending ? t('manual.applying') : t('manual.apply')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.manualDisableButton, manualControlSending && styles.headerActionButtonDisabled]} disabled={!connected || manualControlSending} onPress={() => void applyManualChannelControl(false)}>
              <Text style={styles.manualDisableButtonText}>{t('manual.disable')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.manualControlRow}>
            <View style={styles.manualControlTitleRow}>
              <View>
                <Text style={styles.manualSliderLabel}>{t('manual.pwmFrequency')}</Text>
              </View>
              <View style={styles.manualValueStepper}>
                <ManualStepButton direction="minus" appStyles={styles} label={t('manual.decreasePwm')} onPress={() => setManualPwmFrequency(manualPwmFrequencyHz - 1)} />
                <Text style={styles.manualLargeValue}>{manualPwmFrequencyHz === 0 ? t('interval.off') : `${manualPwmFrequencyHz.toLocaleString()}`}<Text style={styles.manualUnit}>{manualPwmFrequencyHz === 0 ? '' : ' Hz'}</Text></Text>
                <ManualStepButton direction="plus" appStyles={styles} label={t('manual.increasePwm')} onPress={() => setManualPwmFrequency(manualPwmFrequencyHz + 1)} />
              </View>
            </View>
            <ManualSlider appStyles={styles} value={manualPwmFrequencyHz} minimum={0} maximum={50000} colors={['#a780e8', '#6941c6']} onChange={setManualPwmFrequency} />
          </View>
          <View style={styles.manualControlButtonRow}>
            <TouchableOpacity style={[styles.manualDisableButton, (!connected || manualControlSending) && styles.headerActionButtonDisabled]} disabled={!connected || manualControlSending} onPress={() => void prepareManualPwmFrequency()}>
              <Text style={styles.manualDisableButtonText}>{manualControlSending ? t('manual.preparing') : manualPwmFrequencyHz === 0 ? t('manual.rampDownKeepOff') : t('manual.prepareFrequencyChange')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.manualControlGroup}>
          <View style={styles.manualGroupHeader}>
            <Text style={styles.manualGroupTitle}>{t('manual.fan')}</Text>
            <Text style={styles.manualGroupHint}>
              {activeStatus?.fan?.tachPresent
                ? t('manual.rpmMeasured', { rpm: `${Math.round(activeStatus.fan.rpm)}${activeStatus.fan.tach2Present ? ` / ${Math.round(activeStatus.fan.tach2Rpm)}` : ''}` })
                : t('manual.waitingTachometer')}
            </Text>
          </View>
          <View style={styles.manualControlRow}>
            <View style={styles.manualControlTitleRow}>
              <View>
                <Text style={styles.manualSliderLabel}>{t('manual.targetSpeed')}</Text>
                <Text style={styles.manualControlDetail}>
                  {manualFanAutomatic ? t('manual.autoCurve') : t('manual.closedLoop')}
                </Text>
              </View>
              <View style={styles.manualValueStepper}>
                <ManualStepButton direction="minus" appStyles={styles} label={t('manual.decreaseFanTarget', { amount: 50, unit: t('unit.rpm') })} onPress={() => setManualFanTarget(clampNumber(manualFanTargetRpm - 50, 0, 4000))} />
                <Text style={styles.manualLargeValue}>{Math.round(manualFanTargetRpm)}<Text style={styles.manualUnit}>{t('unit.rpm')}</Text></Text>
                <ManualStepButton direction="plus" appStyles={styles} label={t('manual.increaseFanTarget', { amount: 50, unit: t('unit.rpm') })} onPress={() => setManualFanTarget(clampNumber(manualFanTargetRpm + 50, 0, 4000))} />
              </View>
            </View>
            <ManualSlider appStyles={styles} value={manualFanTargetRpm} minimum={0} maximum={4000} colors={['#82cce6', '#2775a6']} onChange={setManualFanTarget} />
          </View>
          <View style={styles.manualControlButtonRow}>
            <TouchableOpacity style={[styles.manualApplyButton, (!connected || manualControlSending) && styles.headerActionButtonDisabled]} disabled={!connected || manualControlSending} onPress={() => void applyManualFanControl(false)}>
              <Text style={styles.manualApplyButtonText}>{manualControlSending ? t('manual.applying') : t('manual.applyRpmTarget')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.manualDisableButton, manualControlSending && styles.headerActionButtonDisabled]} disabled={!connected || manualControlSending} onPress={() => void applyManualFanControl(true)}>
              <Text style={styles.manualDisableButtonText}>{t('manual.automaticFan')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.manualControlGroup}>
          <Text style={styles.manualGroupTitle}>{t('manual.outputLimits')}</Text>
          <View style={styles.manualControlRow}>
            <View style={styles.manualControlTitleRow}>
              <View>
                <Text style={styles.manualSliderLabel}>{t('manual.temperatureCeiling')}</Text>
                <Text style={styles.manualControlDetail}>{t('manual.thermalActive')}</Text>
              </View>
              <View style={styles.manualValueStepper}>
                <ManualStepButton direction="minus" appStyles={styles} label={t('manual.decreaseTemperatureCeiling')} onPress={() => setManualTemperature(clampNumber(manualTemperatureLimitC - 1, 30, 55))} />
                <Text style={styles.manualLargeValue}>{Math.round(manualTemperatureLimitC)}<Text style={styles.manualUnit}>°</Text></Text>
                <ManualStepButton direction="plus" appStyles={styles} label={t('manual.increaseTemperatureCeiling')} onPress={() => setManualTemperature(clampNumber(manualTemperatureLimitC + 1, 30, 55))} />
              </View>
            </View>
            <ManualSlider appStyles={styles} value={manualTemperatureLimitC} minimum={30} maximum={55} colors={['#f9d65c', '#ef6756']} onChange={setManualTemperature} />
            <View style={styles.manualControlButtonRow}>
              <TouchableOpacity style={[styles.manualApplyButton, (!connected || manualControlSending) && styles.headerActionButtonDisabled]} disabled={!connected || manualControlSending} onPress={() => void applyManualSafetyLimit('temperature')}>
                <Text style={styles.manualApplyButtonText}>{manualControlSending ? t('manual.applying') : t('manual.apply')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.manualGroupDivider} />
          <View style={styles.manualControlRow}>
            <View style={styles.manualControlTitleRow}>
              <View>
                <Text style={styles.manualSliderLabel}>{t('manual.powerTargetState', { state: powerTargetState })}</Text>
                <Text style={styles.manualControlDetail}>{t('manual.slowTarget')}</Text>
              </View>
              <View style={styles.manualValueStepper}>
                <ManualStepButton direction="minus" appStyles={styles} label={t('manual.decreasePowerTarget')} onPress={() => setIntensity(clampNumber(intensity - 1, 0, manualPowerLimitWatts))} />
                <Text style={styles.manualLargeValue}>{intensity.toFixed(1)}<Text style={styles.manualUnit}>W</Text></Text>
                <ManualStepButton direction="plus" appStyles={styles} label={t('manual.increasePowerTarget')} onPress={() => setIntensity(clampNumber(intensity + 1, 0, manualPowerLimitWatts))} />
              </View>
            </View>
            <ManualSlider appStyles={styles} value={intensity} minimum={0} maximum={manualPowerLimitWatts} colors={['#b99cff', '#6d45c5']} onChange={(value) => setIntensity(clampNumber(value, 0, manualPowerLimitWatts))} />
            <View style={styles.manualControlButtonRow}>
              <TouchableOpacity style={[styles.manualApplyButton, (!connected || manualControlSending) && styles.headerActionButtonDisabled]} disabled={!connected || manualControlSending} onPress={() => void applyManualPowerTarget()}>
                <Text style={styles.manualApplyButtonText}>{manualControlSending ? t('manual.applying') : t('manual.apply')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.manualGroupDivider} />
          <View style={styles.manualControlRow}>
            <View style={styles.manualControlTitleRow}>
              <View>
                <Text style={styles.manualSliderLabel}>{t('manual.powerCeiling')}</Text>
                <Text style={styles.manualControlDetail}>{t('manual.currentEnvelope')}</Text>
              </View>
              <View style={styles.manualValueStepper}>
                <ManualStepButton direction="minus" appStyles={styles} label={t('manual.decreasePowerCeiling')} onPress={() => setManualPowerLimit(clampNumber(manualPowerLimitWatts - 1, 20, 120))} />
                <Text style={styles.manualLargeValue}>{Math.round(manualPowerLimitWatts)}<Text style={styles.manualUnit}>W</Text></Text>
                <ManualStepButton direction="plus" appStyles={styles} label={t('manual.increasePowerCeiling')} onPress={() => setManualPowerLimit(clampNumber(manualPowerLimitWatts + 1, 20, 120))} />
              </View>
            </View>
            <ManualSlider appStyles={styles} value={manualPowerLimitWatts} minimum={20} maximum={120} colors={['#76d39b', '#37a9d6']} onChange={setManualPowerLimit} />
            <View style={styles.manualControlButtonRow}>
              <TouchableOpacity style={[styles.manualApplyButton, (!connected || manualControlSending) && styles.headerActionButtonDisabled]} disabled={!connected || manualControlSending} onPress={() => void applyManualSafetyLimit('power')}>
                <Text style={styles.manualApplyButtonText}>{manualControlSending ? t('manual.applying') : t('manual.apply')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>


        <View style={styles.manualControlGroup}>
          <Text style={styles.manualGroupTitle}>{t('cadence.title')}</Text>
          <View style={styles.manualControlRow}>
            <View style={styles.manualControlTitleRow}>
              <View>
                <Text style={styles.manualSliderLabel}>{t('cadence.history')}</Text>
                <Text style={styles.manualControlDetail}>{cadenceBusy ? t('cadence.pending') : cadenceRead ? cadence && cadenceSeconds !== cadence.seconds ? t('cadence.unsaved') : cadence?.persisted ? t('cadence.confirmed') : t('cadence.default') : t('cadence.unavailable')}</Text>
              </View>
              <View style={styles.manualValueStepper}>
                <ManualStepButton direction="minus" appStyles={styles} label={t('cadence.more')} disabled={!cadenceEditable || cadenceIndex === 0} onPress={() => setCadenceIndex(cadenceIndex - 1)} />
                <Text style={styles.manualLargeValue}>{cadence ? cadenceSeconds / 60 : '—'}<Text style={styles.manualUnit}> {t('cadence.minutes')}</Text></Text>
                <ManualStepButton direction="plus" appStyles={styles} label={t('cadence.longer')} disabled={!cadenceEditable || cadenceIndex === 9} onPress={() => setCadenceIndex(cadenceIndex + 1)} />
              </View>
            </View>
            <ManualSlider appStyles={styles} value={cadenceIndex} minimum={0} maximum={9} colors={['#82cce6', '#2775a6']} disabled={!cadenceEditable} onChange={setCadenceIndex} />
            <View style={styles.rowBetween}><Text style={styles.muted}>{t('cadence.more')}</Text><Text style={styles.muted}>{t('cadence.longer')}</Text></View>
            {lampCadenceErrorById[cadenceId] ? <Text style={styles.muted}>{lampCadenceErrorById[cadenceId]}</Text> : null}
            <View style={styles.manualControlButtonRow}>
              <TouchableOpacity style={[styles.manualApplyButton, !cadenceEditable && styles.headerActionButtonDisabled]} disabled={!cadenceEditable} onPress={() => void saveLampCadence()} accessibilityLabel={t('cadence.save')}>
                <Text style={styles.manualApplyButtonText}>{t('cadence.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderClock = () => {
    const scheduleReadOnly = Boolean(selectedLampView.device && !activeConnected);
    const scheduleEditable = canConfigureLamp && !scheduleReadOnly && activeConnected;
    const scheduleSnapshot = scheduleReadOnly ? selectedLampView.schedule : null;
    const scheduleSnapshotConfig = scheduleSnapshot?.config ?? null;
    const displayTimerEnabled = scheduleSnapshot ? scheduleSnapshot.enabled : scheduleReadOnly ? false : timerEnabled;
    const displayOnTime = scheduleSnapshotConfig ? minutesToTime(scheduleSnapshotConfig.onMinutes) : scheduleReadOnly ? '--:--' : onTime;
    const displayDaylightStartTime = scheduleSnapshotConfig ? minutesToTime(scheduleSnapshotConfig.daylightStartMinutes) : scheduleReadOnly ? '--:--' : daylightStartTime;
    const displayEveningStartTime = scheduleSnapshotConfig ? minutesToTime(scheduleSnapshotConfig.eveningStartMinutes) : scheduleReadOnly ? '--:--' : eveningStartTime;
    const displayOffTime = scheduleSnapshotConfig ? minutesToTime(scheduleSnapshotConfig.offMinutes) : scheduleReadOnly ? '--:--' : offTime;
    const displaySunriseFadeMinutes = scheduleSnapshotConfig ? String(scheduleSnapshotConfig.sunriseFadeMinutes) : scheduleReadOnly ? '--' : sunriseFadeMinutes;
    const displayDaylightFadeMinutes = scheduleSnapshotConfig ? String(scheduleSnapshotConfig.daylightFadeMinutes) : scheduleReadOnly ? '--' : daylightFadeMinutes;
    const displayEveningFadeMinutes = scheduleSnapshotConfig ? String(scheduleSnapshotConfig.eveningFadeMinutes) : scheduleReadOnly ? '--' : eveningFadeMinutes;
    const displayNightFadeMinutes = scheduleSnapshotConfig ? String(scheduleSnapshotConfig.nightFadeMinutes) : scheduleReadOnly ? '--' : nightFadeMinutes;


    const selectedNodeId = selectedLampNode?.id ?? null;
    const localConfigState = selectedNodeId ? meshLocalConfigByNodeRef.current[selectedNodeId] : undefined;
    const localVersionDisplay = localConfigState
      ? typeof localConfigState.pendingVersion === 'number'
        ? `${localConfigState.version} → ${localConfigState.pendingVersion}`
        : `${localConfigState.version}`
      : '-';
    const meshVersionDisplay =
      selectedNodeId && typeof meshTelemetryVersionByNode[selectedNodeId] === 'number'
        ? `${meshTelemetryVersionByNode[selectedNodeId]}`
        : '-';
    const activeTargets: ScheduleChannelTargets = scheduleSnapshotConfig
      ? clampScheduleTargets(
          schedulePhase === 'sunrise'
            ? scheduleSnapshotConfig.sunriseTarget
            : schedulePhase === 'daylight'
              ? scheduleSnapshotConfig.daylightTarget
              : scheduleSnapshotConfig.eveningTarget
        )
      : scheduleReadOnly
        ? [0, 0, 0, 0]
        : scheduleTargetForPhase(schedulePhase);
    const scheduleChannels: Array<{ label: string; detail: string; colors: [string, string] }> = [
      { label: t('channel.phase', { number: 1 }), detail: '4000 K', colors: ['#a8d8ff', '#fff1a8'] },
      { label: t('channel.phase', { number: 2 }), detail: t('channel.orangeRed'), colors: ['#ffbd6b', '#f04444'] },
      { label: t('channel.phase', { number: 3 }), detail: t('channel.whiteBlue'), colors: ['#f8fafc', '#438ff5'] },
      { label: t('channel.phase', { number: 4 }), detail: '4000 K', colors: ['#fff1a8', '#a8d8ff'] },
    ];
    const phaseLabels: Array<{ key: SchedulePhaseKey; label: string }> = [
      { key: 'sunrise', label: t('schedule.sunrise') },
      { key: 'daylight', label: t('schedule.daylight') },
      { key: 'evening', label: t('schedule.evening') },
    ];
    const activePhaseLabel = phaseLabels.find((phase) => phase.key === schedulePhase)?.label ?? schedulePhase;
    const renderTimeField = (
      label: string,
      field: 'on' | 'daylight' | 'evening' | 'off',
      value: string,
      setter: (value: string) => void,
      placeholder: string
    ) => (
      <View style={[styles.field, styles.scheduleFieldColumn]}>
        <Text style={styles.scheduleCompactLabel}>{label}</Text>
        {Platform.OS === 'web' ? (
          <TextInput
            style={[styles.input, !scheduleEditable && styles.headerActionButtonDisabled]}
            editable={scheduleEditable}
            value={value}
            onChangeText={(next) => { markScheduleDirty(); setter(next); }}
            placeholder={placeholder}
            placeholderTextColor={appTheme.colors.placeholder}
          />
        ) : (
          <TouchableOpacity style={[styles.inputButton, !scheduleEditable && styles.headerActionButtonDisabled]} disabled={!scheduleEditable} onPress={() => openTimePicker(field)}>
            <Text style={styles.inputText}>{value}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
    const renderFadeField = (label: string, value: string, setter: (value: string) => void) => (
      <View style={[styles.field, styles.scheduleFieldColumn]}>
        <Text style={styles.scheduleCompactLabel}>{label}</Text>
        <TextInput
          style={[styles.input, !scheduleEditable && styles.headerActionButtonDisabled]}
          editable={scheduleEditable}
          value={value}
          onChangeText={(next) => { markScheduleDirty(); setter(next); }}
          keyboardType="numeric"
        />
      </View>
    );
    const renderSectionHeader = (
      key: 'times' | 'output',
      title: string
    ) => {
      const expanded = scheduleOpenPanel === key;
      return (
        <TouchableOpacity
          style={styles.scheduleSectionHeader}
          onPress={() => setScheduleOpenPanel(key)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={styles.scheduleSectionTitle}>{title}</Text>
          <Text style={styles.scheduleSectionChevron}>{expanded ? '−' : '+'}</Text>
        </TouchableOpacity>
      );
    };

    return (
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, styles.scheduleScreenContent]}>
        <View style={styles.scheduleHeaderBlock}>
          <View style={styles.scheduleVersionDataRow}>
            <Text style={styles.scheduleVersionLine}>
              {t('schedule.versionLine', { settings: localVersionDisplay, lamp: meshVersionDisplay })}
            </Text>
            <TouchableOpacity
              style={styles.scheduleDataLink}
              onPress={() => setScheduleOutputGraphOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('schedule.openOutputData')}
            >
              <Text style={styles.dataLinkText}>{t('home.dataShort')}</Text>
            </TouchableOpacity>
          </View>

          {scheduleReadOnly ? (
            <Text style={styles.scheduleReadOnlyNotice}>
              {t('devices.remoteReadOnly')}
              {scheduleSnapshot
                ? ` · ${t('devices.latestCloudRecord')} · ${formatDateTime(Date.parse(scheduleSnapshot.observedAt))}`
                : ` · ${t('devices.noConfirmedSchedule')}`}
            </Text>
          ) : null}

          <View style={[styles.scheduleToggleCard, scheduleReadOnly && styles.scheduleReadOnlyMuted]}>
            <View style={styles.scheduleToggleCopy}>
              <Text style={styles.scheduleToggleTitle}>{t('schedule.enabled')}</Text>
              <Text style={styles.scheduleToggleHint}>{t('schedule.enabledHint')}</Text>
            </View>
            <Switch
              value={displayTimerEnabled}
              onValueChange={(value) => { if (!scheduleEditable) return; void handleScheduleEnabledToggle(value); }}
              disabled={!scheduleEditable || scheduleEnableSending}
            />
          </View>

          <View style={styles.scheduleToggleCard}>
            <View style={styles.scheduleToggleCopy}>
              <Text style={styles.scheduleToggleTitle}>{t('schedule.trackLocal')}</Text>
              <Text style={styles.scheduleToggleHint}>{t('schedule.trackLocalHint')}</Text>
            </View>
            <Switch
              value={scheduleOutputTrackingEnabled}
              onValueChange={setScheduleOutputTracking}
              disabled={!scheduleOutputTrackingReady}
            />
          </View>
        </View>

        <View style={styles.scheduleSectionCard}>
          {renderSectionHeader('times', t('schedule.times'))}
          {scheduleOpenPanel === 'times' ? (
            <View style={[styles.scheduleSectionBody, scheduleReadOnly && styles.scheduleReadOnlyMuted]}>
              <View style={styles.scheduleFieldGridRow}>
                {renderTimeField(t('schedule.onTime'), 'on', displayOnTime, setOnTime, '07:00')}
                {renderFadeField(t('schedule.sunriseFadeShort'), displaySunriseFadeMinutes, setSunriseFadeMinutes)}
              </View>
              <View style={styles.scheduleFieldGridRow}>
                {renderTimeField(t('schedule.daylightStart'), 'daylight', displayDaylightStartTime, setDaylightStartTime, '08:30')}
                {renderFadeField(t('schedule.daylightFadeShort'), displayDaylightFadeMinutes, setDaylightFadeMinutes)}
              </View>
              <View style={styles.scheduleFieldGridRow}>
                {renderTimeField(t('schedule.eveningStart'), 'evening', displayEveningStartTime, setEveningStartTime, '19:30')}
                {renderFadeField(t('schedule.eveningFadeShort'), displayEveningFadeMinutes, setEveningFadeMinutes)}
              </View>
              <View style={styles.scheduleFieldGridRow}>
                {renderTimeField(t('schedule.offTime'), 'off', displayOffTime, setOffTime, '22:30')}
                {renderFadeField(t('schedule.nightFadeShort'), displayNightFadeMinutes, setNightFadeMinutes)}
              </View>
              <TouchableOpacity
                style={[styles.scheduleApplyButton, !scheduleEditable && styles.headerActionButtonDisabled]}
                onPress={() => void handleSaveClockSettings()}
                disabled={!scheduleEditable}
              >
                <Text style={styles.scheduleApplyButtonText}>{t('manual.apply')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.scheduleSectionCard}>
          {renderSectionHeader('output', t('schedule.targetOutput'))}
          {scheduleOpenPanel === 'output' ? (
            <View style={styles.scheduleOutputBody}>
              <View style={styles.schedulePhaseTabs}>
                {phaseLabels.map((phase) => {
                  const active = schedulePhase === phase.key;
                  return (
                    <TouchableOpacity
                      key={phase.key}
                      style={[styles.schedulePhaseButton, active && styles.schedulePhaseButtonActive]}
                      onPress={() => setSchedulePhase(phase.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.schedulePhaseButtonText, active && styles.schedulePhaseButtonTextActive]}>{phase.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {scheduleChannels.map((channel, index) => (
                <React.Fragment key={channel.label}>
                  {index > 0 ? <View style={styles.manualGroupDivider} /> : null}
                  <View style={[styles.scheduleOutputControlRow, scheduleReadOnly && styles.scheduleReadOnlyMuted]}>
                    <View style={styles.manualControlTitleRow}>
                      <View>
                        <Text style={styles.manualSliderLabel}>{channel.label}</Text>
                        <Text style={styles.manualControlDetail}>{channel.detail}</Text>
                      </View>
                      <View style={styles.manualValueStepper}>
                        <ManualStepButton
                          direction="minus"
                          appStyles={styles}
                          label={t('schedule.decreasePhase', { phase: activePhaseLabel, channel: channel.label })}
                          disabled={!scheduleEditable}
                          onPress={() => updateScheduleTargetChannel(schedulePhase, index, activeTargets[index] - 1)}
                        />
                        <Text style={styles.manualLargeValue}>
                          {Math.round(activeTargets[index])}<Text style={styles.manualUnit}>%</Text>
                        </Text>
                        <ManualStepButton
                          direction="plus"
                          appStyles={styles}
                          label={t('schedule.increasePhase', { phase: activePhaseLabel, channel: channel.label })}
                          disabled={!scheduleEditable}
                          onPress={() => updateScheduleTargetChannel(schedulePhase, index, activeTargets[index] + 1)}
                        />
                      </View>
                    </View>
                    <ManualSlider
                      appStyles={styles}
                      value={activeTargets[index]}
                      minimum={0}
                      maximum={100}
                      colors={channel.colors}
                      disabled={!scheduleEditable}
                      onChange={(value) => scheduleEditable && updateScheduleTargetChannel(schedulePhase, index, value)}
                    />
                  </View>
                </React.Fragment>
              ))}

              <TouchableOpacity
                style={[styles.scheduleApplyButton, styles.scheduleOutputApplyButton, !scheduleEditable && styles.headerActionButtonDisabled]}
                onPress={() => void handleSaveClockSettings()}
                disabled={!scheduleEditable}
              >
                <Text style={styles.scheduleApplyButtonText}>{t('manual.apply')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </ScrollView>
    );
  };

  const renderScheduleOutputGraph = () => {
    const lampId = selectedLampNode?.id ?? null;
    const allSamples = lampId ? scheduleOutputSamplesByLamp[lampId] ?? [] : [];
    const windowMs = scheduleOutputGraphWindow === '1h'
      ? 60 * 60 * 1000
      : scheduleOutputGraphWindow === '6h'
        ? 6 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
    const endMs = Date.now();
    const startMs = endMs - windowMs;
    const samples = allSamples.filter((sample) => sample.timestampMs >= startMs && sample.timestampMs <= endMs);
    // Both the persisted schedule and G4 status telemetry exposed to the App
    // are already in slider/app phase order: Phase 1, 2, 3, 4.
    const chartWidth = Math.max(210, windowWidth - 92);
    const chartHeight = clampNumber(Math.floor((windowHeight - 420) / 4), 88, 120);
    const plotTop = 6;
    const plotBottom = chartHeight - 6;
    const plotHeight = plotBottom - plotTop;
    const scheduleChannels: Array<{ label: string; detail: string; color: string; channelIndex: number }> = [
      { label: t('channel.phase', { number: 1 }), detail: '4000 K', color: '#7cbcf1', channelIndex: 0 },
      { label: t('channel.phase', { number: 2 }), detail: t('channel.orangeRed'), color: '#ef4444', channelIndex: 1 },
      { label: t('channel.phase', { number: 3 }), detail: t('channel.whiteBlue'), color: '#438ff5', channelIndex: 2 },
      { label: t('channel.phase', { number: 4 }), detail: '4000 K', color: '#d9ad57', channelIndex: 3 },
    ];
    const makePath = (channelIndex: number, kind: 'planned' | 'applied') => {
      const points = samples.map((sample) => ({
        xPx: clampNumber(((sample.timestampMs - startMs) / windowMs) * chartWidth, 0, chartWidth),
        yPx: plotTop + (1 - clampNumber(sample[kind][channelIndex], 0, 100) / 100) * plotHeight,
      }));
      return buildMonotoneSvgPath(points);
    };
    const latest = samples[samples.length - 1] ?? null;
    const formatGraphTime = (timestampMs: number) => formatTime(timestampMs, { hour: '2-digit', minute: '2-digit' });

    return (
      <View
        style={[
          styles.scheduleDataScreen,
          { paddingTop: Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight ?? 0) },
        ]}
      >
        <View style={styles.scheduleDataHeader}>
          <TouchableOpacity style={styles.scheduleDataBackButton} onPress={() => setScheduleOutputGraphOpen(false)} accessibilityLabel={t('schedule.back')}>
            <Text style={styles.scheduleDataBackText}>←</Text>
          </TouchableOpacity>
          <View style={styles.scheduleDataHeaderCopy}>
            <Text style={styles.scheduleDataTitle}>{t('schedule.outputTitle')}</Text>
            <Text style={styles.scheduleDataSubtitle}>{t('schedule.outputSubtitle', { name: selectedLampName })}</Text>
          </View>
          <View style={styles.scheduleDataWindowTabs}>
            {(['1h', '6h', '24h'] as ScheduleOutputGraphWindow[]).map((windowKey) => (
              <TouchableOpacity
                key={windowKey}
                style={[styles.scheduleDataWindowButton, scheduleOutputGraphWindow === windowKey && styles.scheduleDataWindowButtonActive]}
                onPress={() => setScheduleOutputGraphWindow(windowKey)}
              >
                <Text style={[styles.scheduleDataWindowText, scheduleOutputGraphWindow === windowKey && styles.scheduleDataWindowTextActive]}>{windowKey}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <ScrollView style={styles.scheduleDataScroll} contentContainerStyle={styles.scheduleDataContent}>
          <View style={styles.scheduleDataLegendRow}>
            <View style={styles.scheduleDataLegendItem}>
              <View style={styles.scheduleDataLegendRequested} />
              <Text style={styles.scheduleDataLegendText}>{t('schedule.planned')}</Text>
            </View>
            <View style={styles.scheduleDataLegendItem}>
              <View style={styles.scheduleDataLegendApplied} />
              <Text style={styles.scheduleDataLegendText}>{t('schedule.applied')}</Text>
            </View>
            <Text style={styles.scheduleDataSampleCount}>{t('schedule.sampleCount', { count: samples.length })}</Text>
          </View>

          {scheduleChannels.map((channel) => {
            const plannedPath = makePath(channel.channelIndex, 'planned');
            const appliedPath = makePath(channel.channelIndex, 'applied');
            const latestPlanned = latest ? Math.round(latest.planned[channel.channelIndex]) : null;
            const latestApplied = latest ? Math.round(latest.applied[channel.channelIndex]) : null;
            return (
              <View key={channel.label} style={styles.scheduleDataChartCard}>
                <View style={styles.scheduleDataChartHeader}>
                  <View>
                    <Text style={styles.scheduleDataChartTitle}>{channel.label}</Text>
                    <Text style={styles.scheduleDataChartDetail}>{channel.detail}</Text>
                  </View>
                  <Text style={styles.scheduleDataLatestValue}>
                    {latestPlanned === null ? '--' : latestPlanned}% → {latestApplied === null ? '--' : latestApplied}%
                  </Text>
                </View>
                <View style={styles.scheduleDataChartPlot}>
                  <View style={[styles.scheduleDataYAxisLabels, { height: chartHeight }]}>
                    <Text style={styles.scheduleDataAxisText}>100</Text>
                    <Text style={styles.scheduleDataAxisText}>50</Text>
                    <Text style={styles.scheduleDataAxisText}>0</Text>
                  </View>
                  <View>
                    <Svg width={chartWidth} height={chartHeight}>
                      <SvgPath d={`M 0 ${plotTop} L ${chartWidth} ${plotTop}`} stroke={appTheme.colors.border} strokeWidth={1} fill="none" />
                      <SvgPath d={`M 0 ${plotTop + plotHeight / 2} L ${chartWidth} ${plotTop + plotHeight / 2}`} stroke={appTheme.colors.border} strokeWidth={1} fill="none" />
                      <SvgPath d={`M 0 ${plotBottom} L ${chartWidth} ${plotBottom}`} stroke={appTheme.colors.border} strokeWidth={1} fill="none" />
                      {plannedPath ? <SvgPath d={plannedPath} stroke={channel.color} strokeWidth={2} strokeDasharray="5 4" opacity={0.55} fill="none" /> : null}
                      {appliedPath ? <SvgPath d={appliedPath} stroke={channel.color} strokeWidth={2.5} fill="none" /> : null}
                    </Svg>
                    <View style={[styles.scheduleDataXAxis, { width: chartWidth }]}>
                      <Text style={styles.scheduleDataAxisText}>{formatGraphTime(startMs)}</Text>
                      <Text style={styles.scheduleDataAxisText}>{formatGraphTime(endMs)}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}

          {!samples.length ? (
            <View style={styles.scheduleDataEmptyCard}>
              <Text style={styles.scheduleDataEmptyTitle}>{t('schedule.noTrackedOutput')}</Text>
              <Text style={styles.scheduleDataEmptyText}>{t('schedule.noTrackedOutputHint')}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  };

  const formatProbeRgb = (probeStatus?: ProbeSensorStatus | null) => {
    const red = typeof probeStatus?.lightRedRaw === 'number' ? Math.round(probeStatus.lightRedRaw) : '--';
    const green = typeof probeStatus?.lightGreenRaw === 'number' ? Math.round(probeStatus.lightGreenRaw) : '--';
    const blue = typeof probeStatus?.lightBlueRaw === 'number' ? Math.round(probeStatus.lightBlueRaw) : '--';
    return `${red} / ${green} / ${blue}`;
  };


  const formatHexByte = (value?: number | null) => (typeof value === 'number' ? `0x${value.toString(16).padStart(2, '0').toUpperCase()}` : '--');

  const getProbeActiveTelemetryRoute = (node?: MeshNode | null) => {
    if (!node || node.nodeKind !== 'probe') return 'unknown';
    if (node.probeActiveTelemetryRoute === 'viaGateway' || node.probeActiveTelemetryRoute === 'viaLamp') {
      return node.probeActiveTelemetryRoute;
    }
    if (isRoutedProbeTelemetryRecent(node)) return node.assignedGatewayId ? 'viaGateway' : 'viaLamp';
    if (node.assignedGatewayId || node.assignedBridgeId) return 'none';
    if (node.probeActiveTelemetryRoute && node.probeActiveTelemetryRoute !== 'unknown') return node.probeActiveTelemetryRoute;
    if (node.connected) return 'direct';
    if (node.provisioned) return 'none';
    return 'unknown';
  };

  const getProbePowerRole = (node?: MeshNode | null) => {
    if (!node || node.nodeKind !== 'probe') return 'unknown';
    const route = getProbeActiveTelemetryRoute(node);
    if (route === 'viaGateway' || route === 'viaLamp') return 'sleepyChild';
    if (node.assignedGatewayId || node.assignedBridgeId) return 'unknown';
    if (node.probePowerRole && node.probePowerRole !== 'unknown') return node.probePowerRole;
    if (route === 'direct') return 'activeBle';
    return node.provisioned ? 'standalone' : 'unknown';
  };

  const formatProbeRouteLabel = (node?: MeshNode | null, gateway?: MeshNode | null, lamp?: MeshNode | null) => {
    if (node?.assignedGatewayId) {
      const gatewayName = gateway?.name ?? 'Gateway';
      const route = getProbeActiveTelemetryRoute(node);
      const powerRole = getProbePowerRole(node);
      if (route === 'viaGateway' && powerRole === 'sleepyChild') return `Sleepy child via ${gatewayName}`;
      if (route === 'direct') return `Assigned to ${gatewayName} - Direct BLE fallback`;
      return `Assigned to ${gatewayName} - route pending`;
    }
    if (node?.assignedBridgeId) {
      const lampName = lamp?.name ?? 'Lamp';
      const route = getProbeActiveTelemetryRoute(node);
      if (route === 'direct') return `Assigned to ${lampName} - Direct BLE fallback`;
      if (route !== 'viaLamp') return `Assigned to ${lampName} - route pending`;
    }
    const route = getProbeActiveTelemetryRoute(node);
    const powerRole = getProbePowerRole(node);
    if (route === 'viaGateway') return `${powerRole === 'sleepyChild' ? 'Sleepy child' : 'Seen'} via ${gateway?.name ?? 'Gateway'}`;
    if (route === 'viaLamp') return `${powerRole === 'sleepyChild' ? 'Sleepy child' : 'Seen'} via ${lamp?.name ?? 'Lamp'}`;
    if (route === 'direct') return 'Direct BLE setup link';
    if (powerRole === 'standalone') return 'Standalone Probe';
    return 'No active route';
  };

  const formatProbeConnectionLabel = (node?: MeshNode | null, gateway?: MeshNode | null, lamp?: MeshNode | null) => {
    if (!node) return 'No Probe selected';
    const route = getProbeActiveTelemetryRoute(node);
    if (node.assignedGatewayId && route === 'direct') return `Assigned to ${gateway?.name ?? 'Gateway'}, using Direct BLE fallback`;
    if (node.assignedBridgeId && route === 'direct') return `Assigned to ${lamp?.name ?? 'Lamp'}, using Direct BLE fallback`;
    if (route === 'viaGateway') return `Visible via ${gateway?.name ?? 'Gateway'}`;
    if (route === 'viaLamp') return `Visible via ${lamp?.name ?? 'Lamp'}`;
    if (node.connected) return 'Direct BLE connected';
    if (getProbePowerRole(node) === 'standalone') return 'Standalone, direct link idle';
    return 'No active Probe link';
  };

  const mergeProbeStatus = (previous: ProbeSensorStatus | null | undefined, next: ProbeSensorStatus): ProbeSensorStatus => ({
    ...previous,
    ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined && value !== null)),
    updatedAt: next.updatedAt ?? previous?.updatedAt ?? Date.now(),
    source: next.source ?? previous?.source ?? null,
  });

  async function refreshProbeLoggingStats() {
    const stats = await getProbeLoggingStats();
    setProbeLoggingStats(stats);
  }

  async function refreshLocalTelemetryStats() {
    const stats = await loadLocalTelemetryStats();
    setLocalTelemetryStats(stats);
    console.log(`[LocalStore][STATS] total=${stats.totalRecords} bytes=${stats.fileSizeBytes}`);
  }

  const openLocalStorage = (returnToSettings = false) => {
    setLocalStorageNotice(null);
    setLocalStorageReturnToSettings(returnToSettings);
    setLocalStorageOpen(true);
    void refreshLocalTelemetryStats();
  };

  const closeLocalStorage = () => {
    const reopenSettings = localStorageReturnToSettings;
    setLocalStorageOpen(false);
    setLocalStorageReturnToSettings(false);
    if (reopenSettings) setSettingsOpen(true);
  };

  const parseLocalDateBoundary = (value: string, endOfDay: boolean) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
    return Number.isFinite(date.getTime()) ? date.getTime() : null;
  };

  const handleDeleteLocalRange = async () => {
    const fromMs = parseLocalDateBoundary(localDeleteFrom, false);
    const toMs = parseLocalDateBoundary(localDeleteTo, true);
    if (fromMs === null || toMs === null || fromMs > toMs) {
      setLocalStorageNotice(t('storage.invalidRange'));
      return;
    }
    const options = { fromMs, toMs, deviceKey: localDeleteDeviceKey };
    const unsynced = await countUnsyncedLocalRecords(options);
    Alert.alert(
      t('storage.deleteConfirm'),
      t('storage.deleteBody', {
        warning: unsynced ? t('storage.unsyncedWarning', { count: formatNumber(unsynced) }) : '',
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            setLocalStorageBusy(true);
            void deleteLocalTelemetry(options)
              .then(async (deleted) => {
                setLocalStorageNotice(t('storage.deleted', { count: formatNumber(deleted) }));
                await refreshLocalTelemetryStats();
                if (probeGraphOpen) await openProbeGraphView();
              })
              .catch((error: any) => setLocalStorageNotice(error?.message ?? String(error)))
              .finally(() => setLocalStorageBusy(false));
          },
        },
      ]
    );
  };

  const handleClearAllLocalHistory = () => {
    Alert.alert(
      t('storage.clearConfirm'),
      t('storage.clearBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.clearAll'),
          style: 'destructive',
          onPress: () => {
            setLocalStorageBusy(true);
            void clearAllLocalTelemetry()
              .then(async (deleted) => {
                setRecentProbeLogs([]);
                setRecentLampLogs([]);
                setLocalStorageNotice(t('storage.cleared', { count: formatNumber(deleted) }));
                await refreshLocalTelemetryStats();
              })
              .catch((error: any) => setLocalStorageNotice(error?.message ?? String(error)))
              .finally(() => setLocalStorageBusy(false));
          },
        },
      ]
    );
  };

  async function refreshRecentProbeLogs(probeId?: string | null) {
    const records = await loadRecentProbeLogRecords({
      limit: 180,
      probeId: probeId ?? null,
    });
    setRecentProbeLogs(records);
  }

  async function refreshRecentLampLogs(lampId?: string | null) {
    if (!lampId) {
      setRecentLampLogs([]);
      return;
    }
    const records = await loadRecentLampOperationalRecords(lampId, 240);
    setRecentLampLogs(records);
  }

  function armGraphLiveRefresh() {
    if (graphLiveRefreshTimerRef.current || graphLiveRefreshInFlightRef.current) return;

    graphLiveRefreshTimerRef.current = setTimeout(() => {
      graphLiveRefreshTimerRef.current = null;
      void flushGraphLiveRefresh();
    }, GRAPH_LIVE_UI_REFRESH_MS);
  }

  async function flushGraphLiveRefresh() {
    if (!probeLoggingViewsOpenRef.current) {
      graphLiveRefreshPendingProbeIdRef.current = null;
      graphLiveRefreshPendingLampIdRef.current = null;
      return;
    }

    if (graphLiveRefreshInFlightRef.current) {
      armGraphLiveRefresh();
      return;
    }

    const probeId = graphLiveRefreshPendingProbeIdRef.current;
    const lampId = graphLiveRefreshPendingLampIdRef.current;
    graphLiveRefreshPendingProbeIdRef.current = null;
    graphLiveRefreshPendingLampIdRef.current = null;

    if (!probeId && !lampId) return;

    graphLiveRefreshInFlightRef.current = true;
    try {
      await Promise.all([
        probeId ? refreshRecentProbeLogs(probeId) : Promise.resolve(),
        lampId ? refreshRecentLampLogs(lampId) : Promise.resolve(),
      ]);
    } finally {
      graphLiveRefreshInFlightRef.current = false;
      if (
        graphLiveRefreshPendingProbeIdRef.current ||
        graphLiveRefreshPendingLampIdRef.current
      ) {
        armGraphLiveRefresh();
      }
    }
  }

  function queueGraphLiveRefresh(request: { probeId?: string | null; lampId?: string | null }) {
    if (!probeLoggingViewsOpenRef.current) return;

    if (request.probeId) graphLiveRefreshPendingProbeIdRef.current = request.probeId;
    if (request.lampId) graphLiveRefreshPendingLampIdRef.current = request.lampId;
    armGraphLiveRefresh();
  }

  const portalErrorMessage = (error: unknown) =>
    error instanceof PortalApiError || error instanceof Error ? error.message : String(error);

  const connectedPersonFor = (connection: PortalConnection) => {
    const uid = arcCloudSession.userId;
    if (!uid) return connection.userB;
    return connection.userA.uid === uid ? connection.userB : connection.userA;
  };

  useEffect(() => {
    const userId = arcCloudSession.userId;
    if (connectionsSection !== 'people' || !userId || !arcCloudSession.emailVerified) return;

    const acceptedConnections = portalConnections.filter((connection) => connection.status === 'accepted');
    if (!acceptedConnections.length) {
      setPortalFriendSharedDeviceCounts({});
      return;
    }

    const friendUids = new Set(
      acceptedConnections.map((connection) =>
        connection.userA.uid === userId ? connection.userB.uid : connection.userA.uid
      )
    );

    // Devices shared with this account are already present in the canonical inventory.
    // For owned devices, fetch direct grants only while People is open. Room/Project
    // grants are deliberately not counted as person-to-person sharing.
    const deviceIdsByFriend = new Map<string, Set<string>>();
    friendUids.forEach((uid) => deviceIdsByFriend.set(uid, new Set<string>()));

    portalDevices.forEach((device) => {
      if (device.owner.uid !== userId && friendUids.has(device.owner.uid)) {
        deviceIdsByFriend.get(device.owner.uid)?.add(device.id);
      }
    });

    const ownedShareableDevices = portalDevices.filter(
      (device) => device.access.isOwner && device.access.canShare
    );
    let cancelled = false;

    void Promise.all(
      ownedShareableDevices.map(async (device) => {
        try {
          return { deviceId: device.id, grants: await portalClient.deviceGrants(device.id) };
        } catch (error) {
          console.warn('[People][SHARED_DEVICE_STATS] Could not load grants', device.id, portalErrorMessage(error));
          return { deviceId: device.id, grants: [] as DeviceGrant[] };
        }
      })
    ).then((results) => {
      if (cancelled || currentCloudUserRef.current !== userId) return;

      results.forEach(({ deviceId, grants }) => {
        grants.forEach((grant) => {
          const projectGrant = 'projectId' in grant && Boolean(grant.projectId);
          if (grant.roomId || projectGrant || !grant.granteeUid || !friendUids.has(grant.granteeUid)) return;
          deviceIdsByFriend.get(grant.granteeUid)?.add(deviceId);
        });
      });

      const counts: Record<string, number> = {};
      deviceIdsByFriend.forEach((deviceIds, uid) => {
        counts[uid] = deviceIds.size;
      });
      setPortalFriendSharedDeviceCounts(counts);
    });

    return () => {
      cancelled = true;
    };
  }, [
    connectionsSection,
    arcCloudSession.userId,
    arcCloudSession.emailVerified,
    portalConnections,
    portalDevices,
  ]);

  async function refreshPortalInventory() {
    const userId = arcCloudSession.userId;
    if (!userId || !arcCloudSession.emailVerified) return;
    try {
      const devices = await portalClient.devices();
      if (currentCloudUserRef.current !== userId) return;
      portalInventorySourceRef.current = 'network';
      historyAccessUserRef.current = currentCloudUserRef.current;
      void narrowOfflinePermissions(devices,userId);
      setPortalDevices(previous => {
        const merged = mergePortalInventory(previous, devices);
        void savePortalDevicePresentationCache(userId, merged).catch(() => undefined);
        return merged;
      });
      setPortalDevicesCachedAt(Date.now());
      setPortalInventoryCached(false);
    } catch {
      // Keep last-known presentation, but an unavailable authority cannot authorize commands.
      if (currentCloudUserRef.current === userId) setPortalInventoryCached(true);
    }
  }

  async function narrowOfflinePermissions(devices:PortalDeviceSummary[],subject:string){
    if(currentCloudUserRef.current!==subject)return;
    try{const affected=await nativeOfflineAccess.narrowFromFreshInventory(subject,devices);
      if(currentCloudUserRef.current!==subject)return;
      for(const state of hardwareOnboarding.snapshot())if(state.binding&&affected.includes(state.binding.hardwareUid)){void hardwareOnboarding.retry(state.nodeId);}
    }catch(error){setMeshStatus(`Local permission reconciliation failed: ${String(error)}`);}
  }

  async function refreshPortalWorkspace() {
    const requestedUserId = arcCloudSession.userId;
    if (!arcCloudSession.userId || !arcCloudSession.emailVerified) return;
    setPortalLoading(true);
    setPortalError(null);
    const [devicesResult, connectionsResult, requestsResult, projectsResult, roomsResult, transfersResult] = await Promise.allSettled([
      portalClient.devices(),
      portalClient.connections(),
      portalClient.connectionRequests(),
      portalClient.projects(),
      portalClient.rooms(),
      portalClient.deviceTransfers(),
    ]);

    if (currentCloudUserRef.current !== requestedUserId) return;
    const errors: string[] = [];
    if (devicesResult.status === 'fulfilled') {
      portalInventorySourceRef.current = 'network';
      historyAccessUserRef.current = currentCloudUserRef.current;
      void narrowOfflinePermissions(devicesResult.value,requestedUserId!);
      setPortalDevices(previous => mergePortalInventory(previous, devicesResult.value));
      setPortalDevicesCachedAt(Date.now());
      setPortalInventoryCached(false);
      void savePortalDevicePresentationCache(arcCloudSession.userId!, devicesResult.value).catch(() => undefined);
    } else {
      errors.push(portalErrorMessage(devicesResult.reason));
      setPortalInventoryCached(portalDevices.length > 0);
    }
    if (connectionsResult.status === 'fulfilled') setPortalConnections(connectionsResult.value);
    else errors.push(portalErrorMessage(connectionsResult.reason));
    if (requestsResult.status === 'fulfilled') {
      setPortalIncomingRequests(requestsResult.value.incoming);
      setPortalOutgoingRequests(requestsResult.value.outgoing);
    } else errors.push(portalErrorMessage(requestsResult.reason));
    if (projectsResult.status === 'fulfilled') setPortalProjects(projectsResult.value);
    else errors.push(portalErrorMessage(projectsResult.reason));
    if (roomsResult.status === 'fulfilled') setPortalRooms(roomsResult.value);
    else errors.push(portalErrorMessage(roomsResult.reason));
    if (transfersResult.status === 'fulfilled') setPortalTransfers(transfersResult.value);
    else errors.push(portalErrorMessage(transfersResult.reason));

    if (errors.length) setPortalError(errors[0]);
    setPortalLoading(false);
  }

  async function refreshPortalRoom(roomId: string, silent = false) {
    try {
      const [room, messages] = await Promise.all([portalClient.room(roomId), portalClient.messages(roomId)]);
      setPortalRooms((current) => current.some((item) => item.id === room.id)
        ? current.map((item) => item.id === room.id ? room : item)
        : [room, ...current]);
      if (activePortalRoomId === roomId) setPortalMessages(messages);
      if (!silent) setPortalError(null);
    } catch (error) {
      if (!silent) setPortalError(portalErrorMessage(error));
    }
  }

  async function refreshSelectedPortalHistory() {
    if (!cloudSyncEnabled || !selectedPortalProbe || !canOpenHistory(selectedPortalProbe)) {
      setCloudProbeLogs([]);
      return;
    }
    setArcCloudStatus('loading');
    setArcCloudError(null);
    try {
      const userId = currentCloudUserRef.current;
      const device = selectedPortalProbe;
      const history = await portalClient.deviceHistory(device.id);
      if (userId !== currentCloudUserRef.current || selectedPortalProbeRef.current?.id !== device.id || !selectedPortalProbeRef.current.access.canViewHistory) return;
      setCloudProbeLogs(previous => mergeHistoryRecords(previous.filter(record => record.probeId === device.id), portalHistoryToProbeLogs(device, history), portalDevices));
      setArcCloudStatus('ready');
    } catch (error) {
      setArcCloudStatus('error');
      setArcCloudError(portalErrorMessage(error));
    }
  }

  const formatProbeGraphValue = (record: ProbeLogEnvelope, signalKey: ProbeGraphSignal) => {
    if (signalKey === 'sht45Temp') return record.telemetry.sht45TemperatureC ?? record.telemetry.bme690TemperatureC;
    if (signalKey === 'sht45Humidity') return record.telemetry.sht45HumidityPct ?? record.telemetry.bme690HumidityPct;
    if (signalKey === 'bmePressure') return record.telemetry.bme690PressureHpa;
    if (signalKey === 'bmeGas') return record.telemetry.bme690GasOhms;
    if (signalKey === 'soilTop') return record.telemetry.tscDepth0Raw ?? record.telemetry.tscDepth0Delta;
    if (signalKey === 'soilMid') return record.telemetry.tscDepth1Raw ?? record.telemetry.tscDepth1Delta;
    if (signalKey === 'soilBottom') return record.telemetry.tscDepth2Raw ?? record.telemetry.tscDepth2Delta;
    if (signalKey === 'soilTemp') return record.telemetry.earthTemperatureC;
    if (signalKey === 'lightRed') return record.telemetry.lightRedRaw;
    if (signalKey === 'lightGreen') return record.telemetry.lightGreenRaw;
    if (signalKey === 'lightBlue') return record.telemetry.lightBlueRaw;
    if (signalKey === 'lightIntensity') return record.telemetry.lightIntensityRaw ?? record.telemetry.lightLux;
    return record.telemetry.batteryPct;
  };

  const getProbeGraphWindowMs = (windowKey: '15m' | '1h' | '6h' | '24h') => {
    if (windowKey === '15m') return 15 * 60 * 1000;
    if (windowKey === '6h') return 6 * 60 * 60 * 1000;
    if (windowKey === '24h') return 24 * 60 * 60 * 1000;
    return 60 * 60 * 1000;
  };

  const getLampGraphTimestamp = (record: LampOperationalRecord) => {
    const edgeTimestamp = record.timeline.lampSampledAtMs;
    return typeof edgeTimestamp === 'number' && Number.isFinite(edgeTimestamp)
      ? edgeTimestamp
      : record.timeline.receivedAtMs;
  };

  const getProbeGraphSignalMeta = (signalKey: ProbeGraphSignal) => {
    const meta: Record<ProbeGraphSignal, { label: string; unit: string; decimals: number; color: string }> = {
      sht45Temp: { label: t('graph.signal.sht45Temp'), unit: 'C', decimals: 1, color: '#f8fafc' },
      sht45Humidity: { label: t('graph.signal.sht45Humidity'), unit: '%', decimals: 1, color: '#38bdf8' },
      bmePressure: { label: t('graph.signal.bmePressure'), unit: 'hPa', decimals: 0, color: '#a78bfa' },
      bmeGas: { label: t('graph.signal.bmeGas'), unit: 'ohm', decimals: 0, color: '#fb7185' },
      soilTop: { label: t('graph.signal.soilTop'), unit: 'raw', decimals: 0, color: '#86efac' },
      soilMid: { label: t('graph.signal.soilMid'), unit: 'raw', decimals: 0, color: '#22c55e' },
      soilBottom: { label: t('graph.signal.soilBottom'), unit: 'raw', decimals: 0, color: '#15803d' },
      soilTemp: { label: t('graph.signal.soilTemp'), unit: 'C', decimals: 1, color: '#f59e0b' },
      lightRed: { label: t('graph.signal.lightRed'), unit: 'raw', decimals: 0, color: '#ef4444' },
      lightGreen: { label: t('graph.signal.lightGreen'), unit: 'raw', decimals: 0, color: '#84cc16' },
      lightBlue: { label: t('graph.signal.lightBlue'), unit: 'raw', decimals: 0, color: '#60a5fa' },
      lightIntensity: { label: t('graph.signal.lightIntensity'), unit: 'raw', decimals: 0, color: '#fde68a' },
      battery: { label: t('graph.signal.battery'), unit: '%', decimals: 0, color: '#facc15' },
    };
    return meta[signalKey];
  };

  const lampGraphSignalMeta: Record<LampGraphSignal, { label: string; unit: string; decimals: number; color: string }> = {
    lampCoreTemp: { label: t('graph.signal.lampCore'), unit: 'C', decimals: 1, color: '#fb923c' },
    lampBoardTemp: { label: t('graph.signal.lampBoard'), unit: 'C', decimals: 1, color: '#facc15' },
    lampPower: { label: t('graph.signal.lampPower'), unit: 'W', decimals: 1, color: '#f472b6' },
    lampFan1: { label: t('graph.signal.fan1'), unit: t('unit.rpm'), decimals: 0, color: '#2dd4bf' },
    lampFan2: { label: t('graph.signal.fan2'), unit: t('unit.rpm'), decimals: 0, color: '#06b6d4' },
    lampOutput: { label: t('graph.signal.output'), unit: '%', decimals: 0, color: '#a3e635' },
  };
  const isLampGraphSignal = (signalKey: ArcGraphSignal): signalKey is LampGraphSignal =>
    signalKey.startsWith('lamp');
  const getArcGraphSignalMeta = (signalKey: ArcGraphSignal) =>
    isLampGraphSignal(signalKey) ? lampGraphSignalMeta[signalKey] : getProbeGraphSignalMeta(signalKey);
  const getArcGraphAxisFamily = (signalKey: ArcGraphSignal) => {
    if (signalKey === 'lampCoreTemp' || signalKey === 'lampBoardTemp') return 'celsius';
    if (signalKey === 'lampFan1' || signalKey === 'lampFan2') return 'lamp-fan';
    if (isLampGraphSignal(signalKey)) return signalKey;
    return getProbeGraphAxisFamily(signalKey);
  };
  const formatLampGraphValue = (record: LampOperationalRecord, signalKey: LampGraphSignal) => {
    if (signalKey === 'lampCoreTemp') return record.measured.coreTemperatureC;
    if (signalKey === 'lampBoardTemp') return record.measured.boardTemperatureC;
    if (signalKey === 'lampPower') return record.derived.inputPowerWatts;
    if (signalKey === 'lampFan1') return record.measured.fan1Rpm;
    if (signalKey === 'lampFan2') return record.measured.fan2Rpm;
    const channels = record.state.appliedChannelsPercent;
    return channels?.length ? channels.reduce((sum, value) => sum + value, 0) / channels.length : null;
  };

  const normalizeArcGraphYAxisSignals = (axisSignals: ArcGraphSignal[], visibleSignals: ArcGraphSignal[]) => {
    const families = new Set<string>();
    const normalized: ArcGraphSignal[] = [];
    axisSignals.forEach((signal) => {
      if (!visibleSignals.includes(signal)) return;
      const family = getArcGraphAxisFamily(signal);
      if (families.has(family)) return;
      families.add(family);
      normalized.push(signal);
    });
    return normalized.slice(0, 3);
  };

  const getProbeGraphAxisFamily = (signalKey: ProbeGraphSignal) => {
    if (signalKey === 'sht45Temp' || signalKey === 'soilTemp') return 'celsius';
    if (signalKey === 'soilTop' || signalKey === 'soilMid' || signalKey === 'soilBottom') return 'soil';
    if (signalKey === 'lightRed' || signalKey === 'lightGreen' || signalKey === 'lightBlue' || signalKey === 'lightIntensity') return 'light';
    return signalKey;
  };

  const normalizeProbeGraphYAxisSignals = (
    axisSignals: ProbeGraphSignal[],
    visibleSignals: ProbeGraphSignal[] = axisSignals
  ) => {
    const families = new Set<string>();
    const normalized: ProbeGraphSignal[] = [];
    axisSignals.forEach((axisSignal) => {
      if (!visibleSignals.includes(axisSignal)) return;
      const family = getProbeGraphAxisFamily(axisSignal);
      if (families.has(family)) return;
      families.add(family);
      normalized.push(axisSignal);
    });
    return normalized.slice(0, 3);
  };

  const toggleProbeGraphVisibleSignal = (signalKey: ProbeGraphSignal) => {
    setGraphFocusedPoint(null);
    setProbeGraphVisibleSignals((prev) => {
      const active = prev.includes(signalKey);
      if (active && prev.length === 1) return prev;
      const nextVisibleSignals = active ? prev.filter((item) => item !== signalKey) : [...prev, signalKey];
      const combinedVisibleSignals: ArcGraphSignal[] = [
        ...(graphShowLamp ? lampGraphVisibleSignals : []),
        ...(graphShowProbe ? nextVisibleSignals : []),
      ];
      setProbeGraphYAxisSignals((prevAxes) => {
        const visibleAxes = normalizeArcGraphYAxisSignals(prevAxes, combinedVisibleSignals);
        if (active || !graphShowProbe) return visibleAxes;
        if (visibleAxes.includes(signalKey)) return visibleAxes;
        const signalFamily = getArcGraphAxisFamily(signalKey);
        const sameFamilyIndex = visibleAxes.findIndex((axisSignal) => getArcGraphAxisFamily(axisSignal) === signalFamily);
        if (sameFamilyIndex >= 0) {
          const replacedAxes = [...visibleAxes];
          replacedAxes[sameFamilyIndex] = signalKey;
          return normalizeArcGraphYAxisSignals(replacedAxes, combinedVisibleSignals);
        }
        if (visibleAxes.length < 3) return [...visibleAxes, signalKey];
        return normalizeArcGraphYAxisSignals([visibleAxes[0], visibleAxes[1], signalKey], combinedVisibleSignals);
      });
      return nextVisibleSignals;
    });
  };

  const toggleLampGraphVisibleSignal = (signalKey: LampGraphSignal) => {
    setGraphFocusedPoint(null);
    setLampGraphVisibleSignals((prev) => {
      const active = prev.includes(signalKey);
      if (active && prev.length === 1) return prev;
      const nextVisibleSignals = active ? prev.filter((item) => item !== signalKey) : [...prev, signalKey];
      const combinedVisibleSignals: ArcGraphSignal[] = [
        ...(graphShowLamp ? nextVisibleSignals : []),
        ...(graphShowProbe ? probeGraphVisibleSignals : []),
      ];
      setProbeGraphYAxisSignals((prevAxes) => {
        const visibleAxes = normalizeArcGraphYAxisSignals(prevAxes, combinedVisibleSignals);
        if (active || !graphShowLamp) return visibleAxes;
        if (visibleAxes.includes(signalKey)) return visibleAxes;
        const signalFamily = getArcGraphAxisFamily(signalKey);
        const sameFamilyIndex = visibleAxes.findIndex((axisSignal) => getArcGraphAxisFamily(axisSignal) === signalFamily);
        if (sameFamilyIndex >= 0) {
          const replacedAxes = [...visibleAxes];
          replacedAxes[sameFamilyIndex] = signalKey;
          return normalizeArcGraphYAxisSignals(replacedAxes, combinedVisibleSignals);
        }
        if (visibleAxes.length < 3) return [...visibleAxes, signalKey];
        return normalizeArcGraphYAxisSignals([visibleAxes[0], visibleAxes[1], signalKey], combinedVisibleSignals);
      });
      return nextVisibleSignals;
    });
  };

  const resolveGraphCloseWaiters = () => {
    const resolvers = graphCloseResolversRef.current.splice(0);
    resolvers.forEach((resolve) => resolve());
  };

  // This is the sole JS owner of the Modal's visible prop. History, telemetry,
  // connection and selection updates intentionally cannot call it.
  const setGraphOpen = (value: boolean, source: string) => {
    logGraphLifecycle('SET_OPEN', { value, source });
    setProbeGraphOpen(value);
  };

  const lockGraphOrientationWithTimeout = async (
    transitionToken: number,
    orientationLock: ScreenOrientation.OrientationLock,
    label: 'landscape' | 'portrait'
  ) => {
    logGraphTransition(transitionToken, `${label} orientation lock start`);
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const orientationPromise = ScreenOrientation.lockAsync(orientationLock)
      .then(() => 'locked' as const)
      .catch((error) => {
        console.warn(`[GraphTransition] ${label} orientation lock failed`, error);
        return 'error' as const;
      });
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      timeoutHandle = setTimeout(() => resolve('timeout'), GRAPH_TRANSITION_WATCHDOG_MS);
    });
    const result = await Promise.race([orientationPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    logGraphTransition(transitionToken, `${label} orientation lock ${result}`);
    return result;
  };

  const finishGraphOpen = (transitionToken: number, reason = 'fade callback') => {
    if (transitionToken !== graphTransitionTokenRef.current || !probeGraphOpen) return;
    clearGraphTransitionTimer(graphFadeInWatchdogRef);
    // Make OPEN terminal: no prior UI-thread animation may later write this
    // shared value while history or telemetry causes ordinary React renders.
    cancelAnimation(graphContentOpacity);
    graphContentOpacity.value = 1;
    graphOpeningRef.current = false;
    logGraphTransition(transitionToken, 'OPEN complete', { reason });
  };

  const continueOpenGraphAfterMainFade = (transitionToken: number, reason = 'fade callback') => {
    if (
      transitionToken !== graphTransitionTokenRef.current ||
      graphOpenContinuationTokenRef.current === transitionToken
    ) return;

    graphOpenContinuationTokenRef.current = transitionToken;
    clearGraphTransitionTimer(graphOpenFadeWatchdogRef);
    mainContentOpacity.value = 0;
    graphContentOpacity.value = 0;
    logGraphTransition(transitionToken, 'main hidden; continue OPEN', { reason });

    void (async () => {
      await lockGraphOrientationWithTimeout(
        transitionToken,
        ScreenOrientation.OrientationLock.LANDSCAPE,
        'landscape'
      );
      if (transitionToken !== graphTransitionTokenRef.current) return;

      logGraphTransition(transitionToken, 'mount Graph modal');
      setGraphOpen(true, 'openProbeGraphView:orientation_locked');
    })();
  };

  const handleMainFadeOutFinished = (transitionToken: number, finished: boolean) => {
    logGraphTransition(transitionToken, 'main fade-out callback', { finished });
    if (transitionToken !== graphTransitionTokenRef.current || !graphOpeningRef.current) return;
    // Even a cancelled animation must not strand the app on a blank Main view.
    continueOpenGraphAfterMainFade(transitionToken, finished ? 'fade completed' : 'fade cancelled');
  };

  const refreshGraphHistoryAfterReveal = (transitionToken: number) => {
    setTimeout(() => {
      if (transitionToken !== graphTransitionTokenRef.current || !probeGraphOpen || graphClosingRef.current) return;
      // Keep the first Graph modal render intentionally light. Only enable the
      // stored telemetry pipeline after onShow has already scheduled the fade.
      setGraphDataReady(true);
      logGraphTransition(transitionToken, 'graph history refresh start');
      void (async () => {
        if (selectedLampNode?.id && canReadLampHistory && !remoteLampView) {
          await refreshRecentLampLogs(selectedLampNode.id);
        } else {
          setRecentLampLogs([]);
        }
        if (selectedPortalProbe && !selectedProbeNode?.connected) {
          setRecentProbeLogs([]);
          await refreshSelectedPortalHistory();
        } else {
          const localProbeId = selectedProbeNode?.id ?? null;
          setCloudProbeLogs([]);
          if (localProbeId) await refreshRecentProbeLogs(localProbeId);
          else setRecentProbeLogs([]);
        }
        logGraphTransition(transitionToken, 'graph history refresh queued into state');
      })().catch((error) => console.warn('[App] Could not refresh Graph View history', error));
    }, GRAPH_DATA_REFRESH_DELAY_MS);
  };

  const handleProbeGraphShown = () => {
    const transitionToken = graphTransitionTokenRef.current;
    if (!probeGraphOpen || graphClosingRef.current) return;

    logGraphTransition(transitionToken, 'Graph modal onShow');
    logGraphLifecycle('MODAL_SHOW');

    // Important: start the visual reveal immediately from onShow. Do not put this
    // behind requestAnimationFrame: graph data/layout work can monopolize the JS
    // thread for seconds, while Reanimated can keep this opacity animation on the
    // UI thread once it has been scheduled.
    logGraphTransition(transitionToken, 'graph fade-in start');
    clearGraphTransitionTimer(graphFadeInWatchdogRef);
    graphFadeInWatchdogRef.current = setTimeout(() => {
      if (transitionToken !== graphTransitionTokenRef.current || !probeGraphOpen) return;
      console.warn('[GraphTransition] graph fade-in watchdog fired', { token: transitionToken });
      finishGraphOpen(transitionToken, '1 s watchdog');
    }, GRAPH_TRANSITION_WATCHDOG_MS);

    graphContentOpacity.value = withTiming(
      1,
      {
        duration: GRAPH_VIEW_FADE_IN_MS,
        easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
      },
      (finished) => {
        runOnJS(finishGraphOpen)(transitionToken, finished ? 'fade completed' : 'fade cancelled');
      }
    );

    // The modal is now interactive. Do not keep the opening gate alive while
    // history parsing / graph calculations run on the JS thread.
    graphOpeningRef.current = false;
    refreshGraphHistoryAfterReveal(transitionToken);
  };

  const openProbeGraphView = async () => {
    if (!canReadHistory) return;
    if (probeGraphOpen || graphOpeningRef.current || graphClosingRef.current) {
      console.log('[GraphTransition] OPEN ignored', {
        graphOpen: probeGraphOpen,
        opening: graphOpeningRef.current,
        closing: graphClosingRef.current,
      });
      return;
    }

    const transitionToken = ++graphTransitionTokenRef.current;
    graphTransitionStartedAtRef.current = Date.now();
    graphOpeningRef.current = true;
    graphOpenContinuationTokenRef.current = 0;
    graphCloseContinuationTokenRef.current = 0;
    mainRevealStartedTokenRef.current = 0;
    setGraphFocusedPoint(null);
    setGraphLampPickerOpen(false);
    setGraphProbePickerOpen(false);
    setProbeGraphDrawerOpen(false);
    setGraphDataReady(false);
    cancelAnimation(graphContentOpacity);
    mainContentOpacity.value = 1;
    logGraphTransition(transitionToken, 'OPEN requested / main fade-out start');

    clearGraphTransitionTimer(graphOpenFadeWatchdogRef);
    graphOpenFadeWatchdogRef.current = setTimeout(() => {
      if (
        transitionToken !== graphTransitionTokenRef.current ||
        !graphOpeningRef.current ||
        graphOpenContinuationTokenRef.current === transitionToken
      ) return;
      console.warn('[GraphTransition] main fade-out watchdog fired', { token: transitionToken });
      continueOpenGraphAfterMainFade(transitionToken, '1 s watchdog');
    }, GRAPH_TRANSITION_WATCHDOG_MS);

    mainContentOpacity.value = withTiming(
      0,
      {
        duration: GRAPH_MAIN_FADE_OUT_MS,
        easing: ReanimatedEasing.inOut(ReanimatedEasing.cubic),
      },
      (finished) => {
        runOnJS(handleMainFadeOutFinished)(transitionToken, Boolean(finished));
      }
    );
  };

  const finishGraphClose = (transitionToken: number, reason = 'main reveal fade callback') => {
    if (transitionToken !== graphTransitionTokenRef.current) return;
    clearGraphTransitionTimer(graphCloseFadeWatchdogRef);
    clearGraphTransitionTimer(mainRevealWatchdogRef);
    graphClosingRef.current = false;
    graphOpeningRef.current = false;
    mainRevealPendingTokenRef.current = 0;
    mainRevealMinLayoutVersionRef.current = 0;
    // Keep mainRevealStartedTokenRef on this completed token until the next
    // transition initializes it. Late layout/settle callbacks from this close
    // are then harmless no-ops instead of starting a second reveal.
    mainContentOpacity.value = 1;
    logGraphTransition(transitionToken, 'CLOSE complete', { reason });
    resolveGraphCloseWaiters();
  };

  const startMainReveal = (transitionToken: number, reason: string) => {
    if (
      transitionToken !== graphTransitionTokenRef.current ||
      mainRevealStartedTokenRef.current === transitionToken
    ) return;

    mainRevealStartedTokenRef.current = transitionToken;
    clearGraphTransitionTimer(mainRevealWatchdogRef);
    logGraphTransition(transitionToken, 'main reveal fade start', {
      reason,
      mainVisualLayoutVersion: mainVisualLayoutVersionRef.current,
      minLayoutVersion: mainRevealMinLayoutVersionRef.current,
    });

    mainContentOpacity.value = withTiming(
      1,
      {
        duration: GRAPH_MAIN_REVEAL_MS,
        easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
      },
      (finished) => {
        runOnJS(finishGraphClose)(
          transitionToken,
          finished ? 'main reveal fade completed' : 'main reveal fade cancelled'
        );
      }
    );
  };

  const continueCloseGraphAfterFade = (transitionToken: number, reason = 'fade callback') => {
    if (
      transitionToken !== graphTransitionTokenRef.current ||
      graphCloseContinuationTokenRef.current === transitionToken
    ) return;

    graphCloseContinuationTokenRef.current = transitionToken;
    clearGraphTransitionTimer(graphCloseFadeWatchdogRef);
    graphContentOpacity.value = 0;
    mainContentOpacity.value = 0;
    setGraphDataReady(false);
    mainRevealPendingTokenRef.current = transitionToken;
    mainRevealMinLayoutVersionRef.current = mainVisualLayoutVersionRef.current + 1;
    logGraphTransition(transitionToken, 'Graph hidden; unmount and restore portrait', {
      reason,
      minLayoutVersion: mainRevealMinLayoutVersionRef.current,
    });
    setGraphOpen(false, `closeProbeGraphView:${reason}`);

    clearGraphTransitionTimer(mainRevealWatchdogRef);
    mainRevealWatchdogRef.current = setTimeout(() => {
      if (
        transitionToken !== graphTransitionTokenRef.current ||
        mainRevealStartedTokenRef.current === transitionToken
      ) return;
      console.warn('[GraphTransition] Main portrait-layout watchdog fired', {
        token: transitionToken,
        mainVisualLayoutVersion: mainVisualLayoutVersionRef.current,
        minLayoutVersion: mainRevealMinLayoutVersionRef.current,
      });
      startMainReveal(transitionToken, '1 s portrait-layout watchdog');
    }, GRAPH_TRANSITION_WATCHDOG_MS);

    void lockGraphOrientationWithTimeout(
      transitionToken,
      ScreenOrientation.OrientationLock.PORTRAIT_UP,
      'portrait'
    );
  };

  const handleGraphFadeOutFinished = (transitionToken: number, finished: boolean) => {
    logGraphTransition(transitionToken, 'graph fade-out callback', { finished });
    if (transitionToken !== graphTransitionTokenRef.current || !graphClosingRef.current) return;
    continueCloseGraphAfterFade(transitionToken, finished ? 'fade completed' : 'fade cancelled');
  };

  const closeProbeGraphView = async (source = 'explicit_exit') => {
    if (!probeGraphOpen) return;

    const completion = new Promise<void>((resolve) => {
      graphCloseResolversRef.current.push(resolve);
    });

    if (!graphClosingRef.current) {
      const transitionToken = ++graphTransitionTokenRef.current;
      graphTransitionStartedAtRef.current = Date.now();
      graphClosingRef.current = true;
      graphOpeningRef.current = false;
      graphCloseContinuationTokenRef.current = 0;
      mainRevealStartedTokenRef.current = 0;
      setGraphLampPickerOpen(false);
      setGraphProbePickerOpen(false);
      setProbeGraphDrawerOpen(false);
      setGraphFocusedPoint(null);
      logGraphLifecycle('REQUEST_CLOSE', { source });
      logGraphTransition(transitionToken, 'CLOSE requested / graph fade-out start', { source });

      clearGraphTransitionTimer(graphCloseFadeWatchdogRef);
      graphCloseFadeWatchdogRef.current = setTimeout(() => {
        if (
          transitionToken !== graphTransitionTokenRef.current ||
          !graphClosingRef.current ||
          graphCloseContinuationTokenRef.current === transitionToken
        ) return;
        console.warn('[GraphTransition] graph fade-out watchdog fired', { token: transitionToken });
        continueCloseGraphAfterFade(transitionToken, '1 s watchdog');
      }, GRAPH_TRANSITION_WATCHDOG_MS);

      graphContentOpacity.value = withTiming(
        0,
        {
          duration: GRAPH_VIEW_FADE_OUT_MS,
          easing: ReanimatedEasing.in(ReanimatedEasing.cubic),
        },
        (finished) => {
          runOnJS(handleGraphFadeOutFinished)(transitionToken, Boolean(finished));
        }
      );
    }

    await completion;
  };

  useEffect(() => {
    logGraphLifecycle(probeGraphOpen ? 'VISIBLE_TRUE' : 'VISIBLE_FALSE');
  }, [probeGraphOpen]);

  function queueProbeLogRecord(probeId: string, snapshot: ProbeSensorStatus | null | undefined) {
    if (!snapshot) return;
    const settings = probeLoggingSettingsRef.current;
    if (!settings.loggingEnabled) return;

    const now = snapshot.updatedAt ?? Date.now();
    const lastLoggedAt = probeLastLoggedAtByIdRef.current[probeId] ?? 0;
    if (now - lastLoggedAt < settings.loggingIntervalSec * 1000 && !(snapshot.timestampValid===true&&probeLastLoggedHasDeviceTimeRef.current[probeId]!==true)) {
      return;
    }



    void appendProbeLogRecord({
      probeId,
      receivedAtMs: now,
      source: snapshot.source ?? null,
      syncMode: settings.syncMode,
      snapshot: {
        ...snapshot,
        updatedAt: now,
      },
    }, {
      retentionDays: settings.retentionDays,
      storageBudgetMb: settings.storageBudgetMb,
    })
      .then(() => {
        probeLastLoggedAtByIdRef.current[probeId] = now;
        probeLastLoggedHasDeviceTimeRef.current[probeId] = snapshot.timestampValid===true;
        addMeshLog(`[ProbeLog][LOCAL_OK] probe=${probeId} receivedAtMs=${now}`, probeId);
        if (probeLoggingViewsOpenRef.current) {
          void refreshProbeLoggingStats();
          const selectedProbeId =
            meshNodesRef.current.find((node) => node.id === selectedMeshNodeIdRef.current && node.nodeKind === 'probe')?.id ??
            null;
          if (!selectedProbeId || selectedProbeId === probeId) {
            queueGraphLiveRefresh({ probeId: selectedProbeId ?? probeId });
          }
        }
      })
      .catch((error: any) => {
        addMeshLog(`[ProbeLog][LOCAL_FAIL] probe=${probeId} error=${error?.message ?? String(error)}`, probeId);
      });
  }

  const renderSensors = () => {
    const probeNode = selectedProbeView.provenance === 'cloud' ? null : selectedProbeNode;
    const probeStatus = selectedProbeLiveStatus;
    const hasProbeSource = Boolean(selectedProbeDisplayName);
    const probeEmptyStateLabel = selectableProbeNodes.length || portalLatestProbeDevices.length
      ? t('graph.chooseProbeDetail')
      : t('graph.noProbeSources');
    const updatedAtMs = typeof probeStatus?.updatedAt === 'number' ? probeStatus.updatedAt : null;
    const updatedLabel = updatedAtMs
      ? new Date(updatedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '--';
    // SHT45 is the primary ambient temperature/RH source. BME690 temperature
    // and humidity remain available as fallback/diagnostic values because the
    // BME690 can self-heat during gas operation.
    const ambientTemperatureC = probeStatus?.sht45TemperatureC ?? probeStatus?.bme690TemperatureC ?? probeStatus?.temperatureC;
    const ambientHumidityPct = probeStatus?.sht45HumidityPct ?? probeStatus?.bme690HumidityPct ?? probeStatus?.humidityPct;
    const bme690PressureHpa = probeStatus?.bme690PressureHpa ?? probeStatus?.pressureHpa;
    const bme690GasOhms = probeStatus?.bme690GasOhms ?? probeStatus?.gasOhms;
    const gasLabel = typeof bme690GasOhms === 'number'
      ? bme690GasOhms >= 1000
        ? `${(bme690GasOhms / 1000).toFixed(bme690GasOhms >= 100000 ? 0 : 1)} kΩ`
        : `${Math.round(bme690GasOhms)} Ω`
      : '--';
    const batteryLabel = typeof probeStatus?.batteryPct === 'number' ? `${Math.round(probeStatus.batteryPct)}%` : '--';
    const reportedIntervalSec = typeof probeStatus?.regularSampleIntervalS === 'number'
      ? probeStatus.regularSampleIntervalS
      : selectedProbeSettings?.desiredProbeSettings.regularMeasurementIntervalSec ?? null;
    const sampleAgeMs = updatedAtMs ? Math.max(Date.now() - updatedAtMs, 0) : null;
    const expectedSampleMs = typeof reportedIntervalSec === 'number' && reportedIntervalSec > 0 ? reportedIntervalSec * 1000 : null;
    const freshnessTone: 'healthy' | 'warning' | 'offline' = !probeStatus || sampleAgeMs === null
      ? 'offline'
      : expectedSampleMs && sampleAgeMs > Math.max(expectedSampleMs * 3, 120000)
        ? 'offline'
        : expectedSampleMs && sampleAgeMs > Math.max(expectedSampleMs * 1.6, 60000)
          ? 'warning'
          : 'healthy';
    const powerStateLabel =
      probeStatus?.charging || probeStatus?.chargeState === 'charging'
        ? 'Charging'
        : probeStatus?.chargeState === 'done'
          ? 'Charge Done'
          : probeStatus?.chargeState === 'fault'
            ? 'Charge Fault'
            : 'Battery';
    const earthTemperatureLabel = typeof probeStatus?.earthTemperatureC === 'number'
      ? `${probeStatus.earthTemperatureC.toFixed(1)} °C`
      : typeof probeStatus?.earthTemperatureRaw === 'number'
        ? `${Math.round(probeStatus.earthTemperatureRaw)} raw`
        : '--';

    const probeAlertMessages: string[] = [];
    const probeAlertSettings = selectedProbeSettings?.alerts ?? null;
    if (notificationsEnabled && probeStatus && probeAlertSettings) {
      if (
        typeof probeStatus.batteryPct === 'number' &&
        probeStatus.batteryPct <= probeAlertSettings.lowBatteryPct
      ) {
        probeAlertMessages.push('Low battery');
      }
      if (typeof ambientTemperatureC === 'number') {
        if (ambientTemperatureC < probeAlertSettings.temperatureMinC) probeAlertMessages.push('Temperature low');
        if (ambientTemperatureC > probeAlertSettings.temperatureMaxC) probeAlertMessages.push('Temperature high');
      }
      if (typeof ambientHumidityPct === 'number') {
        if (ambientHumidityPct < probeAlertSettings.humidityMinPct) probeAlertMessages.push('Humidity low');
        if (ambientHumidityPct > probeAlertSettings.humidityMaxPct) probeAlertMessages.push('Humidity high');
      }
    }
    const probeNotificationStatus = !notificationsEnabled
      ? 'Off'
      : !probeStatus
        ? 'Waiting for sample'
        : probeAlertMessages.length
          ? probeAlertMessages.join(' · ')
          : 'Within thresholds';
    const probeNotificationTone: 'healthy' | 'warning' | 'offline' = !notificationsEnabled || !probeStatus
      ? 'offline'
      : probeAlertMessages.length
        ? 'warning'
        : 'healthy';

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, styles.probeLiveContent]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.screenHeaderRow}>
          <TouchableOpacity
            style={styles.probeSelectorHeader}
            onPress={() => setProbePickerOpen(true)}
            accessibilityLabel="Choose Probe"
          >
            <View style={styles.screenHeaderCopy}>
              <View style={styles.probeSelectorTitleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {selectedProbeDisplayName ?? t('probe.choose')}
                </Text>
                <Text style={styles.probeSelectorChevron}>⌄</Text>
              </View>
            </View>
          </TouchableOpacity>
          <View style={styles.headerActionCluster}>
            <TouchableOpacity
              style={[styles.headerActionButton, styles.probeHeaderIconButton, (!probeNode || settingsLocked) && styles.headerActionButtonDisabled]}
              onPress={() => setProbeSettingsOpen(true)}
              disabled={!probeNode || settingsLocked}
              accessibilityLabel="Open Probe settings"
            >
              <Text style={styles.headerActionText}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>

        {selectedProbeView.provenance === 'cloud' ? <Text style={styles.muted}>{t('devices.latestCloudRecord')} · {updatedLabel}</Text> : null}
        {selectedPortalProbe && portalInventoryCached ? (
          <Text style={styles.portalWarningText}>
            {t('connections.cachedInventory', { time: portalDevicesCachedAt ? formatDateTime(portalDevicesCachedAt) : '—' })}
          </Text>
        ) : null}

        <View style={styles.probeLiveCard}>
          {!hasProbeSource ? (
            <Text style={styles.sensorNotice}>{probeEmptyStateLabel}</Text>
          ) : (
            <>
              <View style={styles.probeLiveStatusRow}>
                <View style={styles.probeLiveSampleMeta}>
                  <View
                    style={[
                      styles.dot,
                      freshnessTone === 'healthy'
                        ? styles.dotConnected
                        : freshnessTone === 'warning'
                          ? styles.dotWarning
                          : styles.dotDisconnected,
                    ]}
                  />
                  <View style={styles.probeLiveMetaCopyLeft}>
                    <Text style={styles.probeLiveMetaStrong}>{updatedLabel}</Text>
                    <Text style={styles.probeLiveMeta}>{t('probe.latestSample')}</Text>
                  </View>
                </View>
                <View style={styles.probeLiveMetaCopy}>
                  <Text style={styles.probeLiveMetaStrong}>{batteryLabel}</Text>
                  <Text style={styles.probeLiveMeta}>{powerStateLabel}</Text>
                </View>
              </View>

              <View style={styles.probeLiveMetricGrid}>
                <View style={styles.probeLiveMetricCell}>
                  <Text style={styles.probeLiveMetricValue}>
                    {typeof ambientTemperatureC === 'number' ? `${ambientTemperatureC.toFixed(1)} °C` : '-- °C'}
                  </Text>
                  <Text style={styles.probeLiveMetricLabel}>{t('probe.temperature')}</Text>
                </View>
                <View style={styles.probeLiveMetricCell}>
                  <Text style={styles.probeLiveMetricValue}>
                    {typeof ambientHumidityPct === 'number' ? `${ambientHumidityPct.toFixed(1)} %` : '-- %'}
                  </Text>
                  <Text style={styles.probeLiveMetricLabel}>{t('probe.humidity')}</Text>
                </View>
                <View style={styles.probeLiveMetricCell}>
                  <Text style={styles.probeLiveMetricValue}>
                    {typeof probeStatus?.lightLux === 'number' ? `${Math.round(probeStatus.lightLux)} lx` : '-- lx'}
                  </Text>
                  <Text style={styles.probeLiveMetricLabel}>{t('probe.light')}</Text>
                </View>
                <View style={styles.probeLiveMetricCell}>
                  <Text style={styles.probeLiveMetricValue}>
                    {typeof bme690PressureHpa === 'number' ? `${bme690PressureHpa.toFixed(0)} hPa` : '-- hPa'}
                  </Text>
                  <Text style={styles.probeLiveMetricLabel}>{t('probe.pressure')}</Text>
                </View>
                <View style={styles.probeLiveMetricCell}>
                  <Text style={styles.probeLiveMetricValue}>{gasLabel}</Text>
                  <Text style={styles.probeLiveMetricLabel}>{t('probe.gas')}</Text>
                </View>
                <View style={styles.probeLiveMetricCell}>
                  <Text style={styles.probeLiveMetricValue}>{earthTemperatureLabel}</Text>
                  <Text style={styles.probeLiveMetricLabel}>{t('probe.soilTemperature')}</Text>
                </View>
              </View>

              <View style={styles.probeLiveSoilCard}>
                <Text style={styles.probeLiveSoilTitle}>{t('probe.soilSpear')}</Text>
                <View style={styles.probeLiveSoilGrid}>
                  {[
                    [t('probe.top'), probeStatus?.tscDepth0Delta ?? probeStatus?.tscDepth0Raw],
                    [t('probe.mid'), probeStatus?.tscDepth1Delta ?? probeStatus?.tscDepth1Raw],
                    [t('probe.deep'), probeStatus?.tscDepth2Delta ?? probeStatus?.tscDepth2Raw],
                  ].map(([label, value]) => (
                    <View key={String(label)} style={styles.probeLiveSoilCell}>
                      <Text style={styles.probeLiveSoilValue}>{typeof value === 'number' ? Math.round(value) : '--'}</Text>
                      <Text style={styles.probeLiveMetricLabel}>{t('probe.rawSuffix', { label: String(label) })}</Text>
                    </View>
                  ))}
                </View>
              </View>


            </>
          )}
        </View>

        {probeNode && selectedProbeSettings ? (
          <View style={styles.probeLiveControlCard}>
            <View style={styles.manualControlRow}>
              <View style={styles.manualControlTitleRow}>
                <View>
                  <Text style={styles.manualSliderLabel}>{t('probe.sampleInterval')}</Text>
                  <Text style={styles.manualControlDetail}>{selectedProbeSampleSettingStatus}</Text>
                </View>
                <View style={styles.manualValueStepper}>
                  <ManualStepButton
                    direction="minus"
                    appStyles={styles}
                    disabled={Boolean(probeSampleBusyById[probeNode.id])}
                    label="Sample more often"
                    onPress={() => {
                      const nextIndex = Math.max(selectedProbeSampleIntervalIndex - 1, 0);
                      setSelectedProbeRegularInterval(regularIntervalOptions[nextIndex]);
                    }}
                  />
                  <Text style={[styles.manualLargeValue, styles.probeSampleIntervalValue]}>
                    {formatProbeInterval(selectedProbeSampleIntervalSec)}
                  </Text>
                  <ManualStepButton
                    direction="plus"
                    appStyles={styles}
                    disabled={Boolean(probeSampleBusyById[probeNode.id])}
                    label="Sample less often"
                    onPress={() => {
                      const nextIndex = Math.min(selectedProbeSampleIntervalIndex + 1, regularIntervalOptions.length - 1);
                      setSelectedProbeRegularInterval(regularIntervalOptions[nextIndex]);
                    }}
                  />
                </View>
              </View>
              <ManualSlider
                appStyles={styles}
                value={selectedProbeSampleIntervalIndex}
                minimum={0}
                maximum={regularIntervalOptions.length - 1}
                disabled={Boolean(probeSampleBusyById[probeNode.id])}
                colors={['#9fc9ad', '#3f7f57']}
                onChange={(index) => setSelectedProbeRegularInterval(regularIntervalOptions[index])}
              />
              <View style={styles.probeSamplingScale}>
                <Text style={styles.manualGroupHint}>{t('probe.moreSamples')}</Text>
                <Text style={styles.manualGroupHint}>{t('probe.longerBattery')}</Text>
              </View>
              <Text style={styles.manualGroupHint}>
                {`Device: ${formatProbeInterval(probeSampleConfirmedById[probeNode.id] ?? probeNode.probeStatus?.regularSampleIntervalS)} · prototype change lasts until reboot`}
              </Text>
              {probeSampleErrorById[probeNode.id] ? <Text style={styles.muted}>{probeSampleErrorById[probeNode.id]}</Text> : null}
              <TouchableOpacity
                style={[styles.buttonSecondary, (probeSampleBusyById[probeNode.id] ||
                  !probeNode.connected || Platform.OS !== 'ios' ||
                  !localHardwareGrant(probeNode)?.device?.access.canEditSettings ||
                  lampHardwareIdentity[probeNode.id]?.state !== 'identified' ||
                  probeNode.assignedGatewayId || probeNode.assignedBridgeId ||
                  selectedProbeSampleIntervalSec === (probeSampleConfirmedById[probeNode.id] ?? probeNode.probeStatus?.regularSampleIntervalS)) && styles.headerActionButtonDisabled]}
                disabled={Boolean(probeSampleBusyById[probeNode.id] ||
                  !probeNode.connected || Platform.OS !== 'ios' ||
                  !localHardwareGrant(probeNode)?.device?.access.canEditSettings ||
                  lampHardwareIdentity[probeNode.id]?.state !== 'identified' ||
                  probeNode.assignedGatewayId || probeNode.assignedBridgeId ||
                  selectedProbeSampleIntervalSec === (probeSampleConfirmedById[probeNode.id] ?? probeNode.probeStatus?.regularSampleIntervalS))}
                onPress={() => void applySelectedProbeSampleInterval()}
              >
                <Text style={styles.buttonTextLight}>{probeSampleBusyById[probeNode.id] ? 'Applying…' : 'Apply Sample Time'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {probeNode && selectedProbeSettings ? (
          <View style={styles.probeLiveControlCard}>
            <View style={styles.probeNotificationsHeader}>
              <TouchableOpacity
                style={styles.probeNotificationsDisclosure}
                onPress={() => setProbeAlertsOpen((value) => !value)}
                accessibilityLabel="Open Probe notification thresholds"
              >
                <View
                  style={[
                    styles.dot,
                    probeNotificationTone === 'healthy'
                      ? styles.dotConnected
                      : probeNotificationTone === 'warning'
                        ? styles.dotWarning
                        : styles.dotDisconnected,
                  ]}
                />
                <View style={styles.probeSettingsRowCopy}>
                  <Text style={styles.probeSettingsRowTitle}>{t('probe.notifications')}</Text>
                  <Text style={styles.probeSettingsRowDetail} numberOfLines={1}>
                    {probeNotificationStatus}
                  </Text>
                </View>
                <Text style={styles.probeSettingsChevron}>{probeAlertsOpen ? '⌃' : '›'}</Text>
              </TouchableOpacity>
              <View style={styles.probeNotificationSwitchSlot}>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={(value) => {
                    setNotificationsEnabled(value);
                    if (!value) setProbeAlertsOpen(false);
                  }}
                />
              </View>
            </View>

            {notificationsEnabled && probeAlertsOpen ? (
              <View style={styles.probeSettingsExpandedArea}>
                <View style={styles.probeThresholdRow}>
                  <Text style={styles.label}>{t('probe.lowBatteryBelow')}</Text>
                  <View style={styles.probeThresholdSingleValue}>
                    <TextInput
                      style={[styles.input, styles.probeThresholdInput]}
                      value={String(selectedProbeSettings.alerts.lowBatteryPct)}
                      onChangeText={(value) =>
                        updateSelectedProbeSettings((settings) => ({
                          ...settings,
                          alerts: {
                            ...settings.alerts,
                            lowBatteryPct: Math.max(1, Math.min(100, Number.parseInt(value || '0', 10) || 1)),
                          },
                        }))
                      }
                      keyboardType="number-pad"
                    />
                    <Text style={styles.value}>%</Text>
                  </View>
                </View>

                <View style={styles.probeThresholdRow}>
                  <Text style={styles.label}>{t('probe.temperature')}</Text>
                  <View style={styles.probeThresholdRange}>
                    <TextInput
                      style={[styles.input, styles.probeThresholdInput]}
                      value={String(selectedProbeSettings.alerts.temperatureMinC)}
                      onChangeText={(value) =>
                        updateSelectedProbeSettings((settings) => ({
                          ...settings,
                          alerts: {
                            ...settings.alerts,
                            temperatureMinC: Number.parseFloat(value) || 0,
                          },
                        }))
                      }
                      keyboardType="numbers-and-punctuation"
                    />
                    <Text style={styles.probeThresholdSeparator}>–</Text>
                    <TextInput
                      style={[styles.input, styles.probeThresholdInput]}
                      value={String(selectedProbeSettings.alerts.temperatureMaxC)}
                      onChangeText={(value) =>
                        updateSelectedProbeSettings((settings) => ({
                          ...settings,
                          alerts: {
                            ...settings.alerts,
                            temperatureMaxC: Number.parseFloat(value) || 0,
                          },
                        }))
                      }
                      keyboardType="numbers-and-punctuation"
                    />
                    <Text style={styles.value}>°C</Text>
                  </View>
                </View>

                <View style={styles.probeThresholdRow}>
                  <Text style={styles.label}>{t('probe.humidity')}</Text>
                  <View style={styles.probeThresholdRange}>
                    <TextInput
                      style={[styles.input, styles.probeThresholdInput]}
                      value={String(selectedProbeSettings.alerts.humidityMinPct)}
                      onChangeText={(value) =>
                        updateSelectedProbeSettings((settings) => ({
                          ...settings,
                          alerts: {
                            ...settings.alerts,
                            humidityMinPct: Math.max(0, Math.min(100, Number.parseFloat(value) || 0)),
                          },
                        }))
                      }
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.probeThresholdSeparator}>–</Text>
                    <TextInput
                      style={[styles.input, styles.probeThresholdInput]}
                      value={String(selectedProbeSettings.alerts.humidityMaxPct)}
                      onChangeText={(value) =>
                        updateSelectedProbeSettings((settings) => ({
                          ...settings,
                          alerts: {
                            ...settings.alerts,
                            humidityMaxPct: Math.max(0, Math.min(100, Number.parseFloat(value) || 0)),
                          },
                        }))
                      }
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.value}>%</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    );
  };

  const renderBleComms = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, styles.scrollContent]}>
      <View style={styles.screenHeader}>
        <Text style={styles.title}>{t('comms.title')}</Text>
        <Text style={styles.subtitle}>{t('comms.subtitle')}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('comms.connection')}</Text>
        <Text style={styles.status}>{status}</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.buttonSecondary} onPress={handleScan} disabled={scanning || connected}>
            <Text style={styles.buttonTextLight}>{scanning ? 'Scanning...' : 'Scan'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={handleConnect}
            disabled={connected || (!selectedDeviceId && Platform.OS !== 'web') || (Platform.OS === 'android' && !meshNodes.some(node => node.id === selectedDeviceId && canConnectLocalNode(node)))}
          >
            <Text style={styles.buttonText}>{t('comms.connect')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonSecondary} onPress={handleDisconnect} disabled={!connected}>
            <Text style={styles.buttonTextLight}>{t('comms.disconnect')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.deviceList}>
          {devices.length === 0 ? (
            <Text style={styles.muted}>
              {Platform.OS === 'web'
                ? t('comms.browserPicker')
                : t('comms.noDevices')}
            </Text>
          ) : (
            devices.map((device) => {
              const title = device.name || device.localName || 'Unknown device';
              const selected = device.id === selectedDeviceId;
              return (
                <TouchableOpacity
                  key={device.id}
                  style={[styles.deviceRow, selected && styles.deviceRowSelected]}
                  onPress={() => setSelectedDeviceId(device.id)}
                >
                  <Text style={styles.deviceName}>{title}</Text>
                  <Text style={styles.deviceId}>{device.id}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </View>
    </ScrollView>
  );

  const renderMeshTile = ({ item }: { item: MeshNode }) => {
    const selected = item.id === meshSelectedNodeId;
    const isProbe = item.nodeKind === 'probe';
    const isLamp = item.nodeKind === 'lamp';
    const isGateway = item.nodeKind === 'gateway';
    const assignedGateway = item.assignedGatewayId
      ? meshNodes.find((node) => node.id === item.assignedGatewayId) ?? null
      : null;
    const assignedLamp = item.assignedBridgeId
      ? meshNodes.find((node) => node.id === item.assignedBridgeId) ?? null
      : null;
    const tempLabel = isProbe
      ? typeof item.probeStatus?.temperatureC === 'number'
        ? `${item.probeStatus.temperatureC.toFixed(1)} °C`
        : '-- °C'
      : item.status
        ? `${item.status.tempHeatsink.toFixed(1)} °C`
        : '-- °C';
    const onLabel = item.status ? minutesToTime(item.status.timerOn) : '--:--';
    const offLabel = item.status ? minutesToTime(item.status.timerOff) : '--:--';
    // Card copy stays compact; full routing diagnostics remain in node settings.
    // An assignment describes the relationship, not whether the route is online.
    const tileRouteLabel = item.assignedGatewayId
      ? `Assigned · ${assignedGateway?.name ?? 'Gateway'}`
      : item.assignedBridgeId
        ? `Assigned · ${assignedLamp?.name ?? 'Lamp'}`
        : formatProbeRouteLabel(item, assignedGateway, assignedLamp);
    const routedProbe = isProbe && Boolean(item.assignedGatewayId || item.assignedBridgeId);
    const routedProbeOnline = routedProbe && isRoutedProbeTelemetryRecent(item);
    const routedProbeBridgeReady = routedProbe && Boolean(assignedGateway?.connected || assignedLamp?.connected);
    const effectivelyOnline = item.connected || routedProbeOnline || routedProbeBridgeReady;
    let actionDisabled = meshConnecting || meshScanning;
    let actionLabel = 'Connect';
    let actionStyle = styles.buttonSecondary;
    let actionPrimary = false;
    let actionHandler: () => void = () => { void connectMeshNode(item); };

    if (routedProbe) {
      if (routedProbeOnline || routedProbeBridgeReady) {
        actionLabel = `Via ${item.assignedGatewayId ? 'Gateway' : 'Lamp'}`;
        actionHandler = () => undefined;
        actionDisabled = true;
      } else {
        actionLabel = 'Retry route';
        actionStyle = styles.button;
        actionPrimary = true;
        actionHandler = () => {
          if (item.assignedGatewayId) void assignNodeToGateway(item.id, item.assignedGatewayId);
          else if (item.assignedBridgeId) void assignNodeToLamp(item.id, item.assignedBridgeId);
        };
      }
    } else {
      if (item.connected) {
        actionLabel = 'Disconnect';
        actionHandler = () => disconnectMeshNode(item);
      } else {
        actionLabel = 'Connect';
        actionStyle = styles.button;
        actionPrimary = true;
        actionHandler = () => connectMeshNode(item);
      }
    }


    return (
      <TouchableOpacity
        style={[styles.meshTile, Platform.OS === 'android' && localNodeColumns(Platform.OS, windowWidth) === 2 && styles.meshTileTwoColumn, selected && styles.meshTileSelected]}
        onPress={() => setMeshSelectedNodeId(item.id)}
      >
        <View style={styles.meshTileHeader}>
          <View style={[styles.meshTileBadge, { backgroundColor: item.color }]}>
            <Text style={styles.meshTileBadgeText}>{item.abbreviation}</Text>
          </View>
          <View style={styles.meshTileTitleWrap}>
            <Text style={styles.meshTileTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <Text
              style={[styles.meshTileSubtitle, item.nodeKind === 'probe' && styles.meshTileSubtitleProbe, item.nodeKind === 'gateway' && styles.meshTileSubtitleGateway]}
              numberOfLines={1}
            >
              {getMeshNodeKindLabel(item.nodeKind)}
            </Text>
            {isProbe ? (
              <Text style={styles.meshTileSubtitle} numberOfLines={1} ellipsizeMode="tail">
                {Platform.OS === 'ios' ? formatProbeRouteLabel(item, assignedGateway, assignedLamp) : tileRouteLabel}
              </Text>
            ) : null}
            {!item.provisioned && <Text style={styles.meshTileSubtitle} numberOfLines={1}>{t('comms.new')}</Text>}
            {Platform.OS === 'ios' && !item.provisioned && item.uuid ? <Text style={styles.meshTileSubtitle} numberOfLines={1}>{item.uuid}</Text> : null}
          </View>
          <TouchableOpacity
            style={styles.meshTileGear}
            onPress={() => openMeshEdit(item)}
            accessibilityLabel={`Edit ${item.name}`}
          >
            <Text style={styles.meshTileGearText}>⚙</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.meshTileBody}>
          <Text style={styles.meshTileLiveLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
            {isProbe
              ? `T: ${tempLabel}   H: ${
                  typeof item.probeStatus?.humidityPct === 'number'
                    ? `${item.probeStatus.humidityPct.toFixed(0)}%`
                    : '--%'
                }`
              : isGateway
                ? `Route: ${item.connected ? t('comms.ready') : '--'}   Probes: ${
                    meshNodes.filter((node) => node.assignedGatewayId === item.id).length
                  }`
                : `T: ${tempLabel}   On/Off: ${onLabel}/${offLabel}`}
          </Text>
          <View style={styles.meshTileActionSlot}>
            <TouchableOpacity
              style={[styles.meshTileAction, actionStyle]}
              onPress={actionHandler}
              disabled={actionDisabled}
              accessibilityRole="button"
            >
              <Text
                style={actionPrimary ? styles.buttonText : styles.buttonTextLight}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {actionLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View
          style={[
            styles.meshTileStatusDot,
            effectivelyOnline ? styles.meshTileStatusDotOn : styles.meshTileStatusDotOff,
          ]}
        />
      </TouchableOpacity>
    );
  };

  const renderMeshComms = () => {
    const title = threadEnabled ? 'Thread Connections' : 'ARC Connections';
    // FlatList requires a new key when numColumns changes after a rotation.
    const tileColumns = localNodeColumns(Platform.OS, windowWidth);
    const sortedNodes = meshNodes.filter(node => !isLegacyMeshNode(node)).sort((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      if (a.provisioned !== b.provisioned) return a.provisioned ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const focusedNode =
      selectedMeshNode ??
      sortedNodes.find((node) => node.nodeKind === 'lamp') ??
      sortedNodes[0] ??
      null;

    const routeRootNode = (() => {
      if (!focusedNode) return null;
      if (focusedNode.nodeKind === 'lamp' || focusedNode.nodeKind === 'gateway') return focusedNode;
      if (focusedNode.assignedBridgeId) {
        return meshNodes.find((node) => node.id === focusedNode.assignedBridgeId) ?? focusedNode;
      }
      if (focusedNode.assignedGatewayId) {
        return meshNodes.find((node) => node.id === focusedNode.assignedGatewayId) ?? focusedNode;
      }
      return focusedNode;
    })();

    const routeContextNodes = (() => {
      if (!routeRootNode) return [];
      if (routeRootNode.nodeKind !== 'lamp' && routeRootNode.nodeKind !== 'gateway') {
        return [routeRootNode];
      }

      const children = meshNodes
        .filter((node) => {
          if (node.id === routeRootNode.id) return false;
          return routeRootNode.nodeKind === 'lamp'
            ? node.assignedBridgeId === routeRootNode.id
            : node.assignedGatewayId === routeRootNode.id;
        })
        .sort((a, b) => {
          const aFocused = a.id === focusedNode?.id ? 1 : 0;
          const bFocused = b.id === focusedNode?.id ? 1 : 0;
          if (aFocused !== bFocused) return bFocused - aFocused;
          return a.name.localeCompare(b.name);
        });

      return [routeRootNode, ...children];
    })();

    const routeEntries = routeContextNodes
      .map((node) => {
        const registryEntry = arcRegistry.find((entry) => entry.id === node.id);
        return registryEntry ? { node, entry: registryEntry } : { node, entry: null };
      });

    const routeBadgeLabel = (() => {
      if (!routeRootNode) return 'None';
      const rootEntry = arcRegistry.find((entry) => entry.id === routeRootNode.id);
      if (rootEntry) return arcTransportLabel(rootEntry.preferredTransport);
      if (routeRootNode.nodeKind === 'lamp') return 'Thread via Lamp';
      if (routeRootNode.nodeKind === 'gateway') return 'Gateway';
      return 'Local';
    })();

    const routeDescription = (() => {
      if (!routeRootNode) return t('comms.noAppFacing');
      const rootEntry = arcRegistry.find((entry) => entry.id === routeRootNode.id);
      if (rootEntry) {
        return t('comms.commissionedAs', {
          name: rootEntry.name,
          role: arcRoleLabel(rootEntry.appFacingRole),
        });
      }
      return routeRootNode.name;
    })();

    const fallbackRoleLabel = (node: MeshNode) => {
      if (node.nodeKind === 'lamp') return 'Lamp local bridge';
      if (node.nodeKind === 'gateway') return 'Gateway';
      if (node.assignedBridgeId) return 'Lamp sleepy child';
      if (node.assignedGatewayId) return 'Gateway sleepy child';
      return getMeshNodeKindLabel(node.nodeKind);
    };

    const fallbackTransportLabel = (node: MeshNode) => {
      if (node.assignedBridgeId) return 'Thread via Lamp';
      if (node.assignedGatewayId) return 'Thread via Gateway';
      if (node.nodeKind === 'lamp') return 'Thread via Lamp';
      if (node.nodeKind === 'gateway') return 'Gateway';
      return 'Local';
    };

    return (
      <View style={styles.commsScreen}>
        <View style={styles.screenHeader}>
          <Text style={[styles.title, styles.commsTitle]}>{title}</Text>
        </View>

        <View style={styles.arcRoutePanel}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{t('comms.appFacingRoute')}</Text>
            <Text style={styles.arcRouteBadge}>{routeBadgeLabel}</Text>
          </View>
          <Text style={styles.muted}>{routeDescription}</Text>

          <ScrollView
            style={styles.arcRoleScroll}
            contentContainerStyle={styles.arcRoleList}
            nestedScrollEnabled
            showsVerticalScrollIndicator={routeEntries.length > 3}
          >
            {routeEntries.length ? routeEntries.map(({ node, entry }) => {
              const connected = entry?.connected ?? node.connected;
              const appFacingRole = entry?.appFacingRole;
              const isSleepyChild =
                appFacingRole === 'lamp_sleepy_child' ||
                appFacingRole === 'gateway_sleepy_child' ||
                Boolean(node.assignedBridgeId || node.assignedGatewayId);

              const lastSeen =
                entry?.lastSeen ??
                node.lastSeenViaLampAt ??
                node.lastSeenViaGatewayAt ??
                node.lastDirectBleSeenAt ??
                null;

              const stateLabel = connected
                ? isSleepyChild
                  ? node.assignedGatewayId
                    ? t('comms.onlineViaGateway')
                    : t('comms.onlineViaLamp')
                  : t('comms.online')
                : isSleepyChild
                  ? lastSeen
                    ? t('comms.lastSample', { time: formatTime(lastSeen) })
                    : t('comms.awaitingFirstTelemetry')
                  : node.provisioned
                    ? t('comms.offlineKnown')
                    : t('comms.new');

              return (
                <View
                  key={node.id}
                  style={[
                    styles.arcRoleRow,
                    node.id === focusedNode?.id && styles.arcRoleRowFocused,
                  ]}
                >
                  <View style={styles.arcRoleTextWrap}>
                    <Text style={styles.arcRoleName} numberOfLines={1}>{entry?.name ?? node.name}</Text>
                    <Text style={styles.arcRoleMeta} numberOfLines={1}>
                      {entry
                        ? `${arcRoleLabel(entry.appFacingRole)} • ${arcTransportLabel(entry.preferredTransport)}`
                        : `${fallbackRoleLabel(node)} • ${fallbackTransportLabel(node)}`}
                    </Text>
                  </View>
                  <Text style={[styles.arcRoleState, connected && styles.arcRoleStateConnected]} numberOfLines={1}>
                    {stateLabel}
                  </Text>
                </View>
              );
            }) : (
              <Text style={styles.muted}>{t('comms.noAppFacing')}</Text>
            )}
          </ScrollView>
        </View>

        <View style={styles.meshStatusRow}>
          <Text style={styles.status}>{meshStatus}</Text>
        </View>
        <FlatList
          key={`arc-nodes-${tileColumns}`}
          data={sortedNodes}
          keyExtractor={(item) => item.id}
          numColumns={tileColumns}
          renderItem={renderMeshTile}
          style={styles.meshList}
          contentContainerStyle={styles.meshTileList}
          columnWrapperStyle={tileColumns === 2 ? styles.meshTileRowWrap : undefined}
          ListEmptyComponent={<Text style={styles.muted}>{t('comms.noArcDevices')}</Text>}
        />

        {meshLogExpanded ? (
          <View style={[styles.meshLogPanel, styles.meshLogPanelExpanded]}>
            <TouchableOpacity
              style={styles.meshLogToggle}
              onPress={() => setMeshLogExpanded(false)}
              accessibilityLabel={t('comms.collapseLog')}
            >
              <Text style={styles.meshLogLine} numberOfLines={1}>
                {meshLogs[meshLogs.length - 1] ?? t('comms.noActivity')}
              </Text>
              <Text style={styles.meshLogChevron}>⌃</Text>
            </TouchableOpacity>
            <ScrollView
              ref={meshLogScrollRef}
              style={styles.meshLogScroll}
              contentContainerStyle={styles.meshLogContent}
              onContentSizeChange={() => meshLogScrollRef.current?.scrollToEnd({ animated: true })}
            >
              {meshLogs.map((line, index) => (
                <Text key={`${index}-${line}`} style={styles.meshLogLine} selectable>
                  {line}
                </Text>
              ))}
            </ScrollView>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.meshLogPanel, styles.meshLogPanelCompact]}
            onPress={() => setMeshLogExpanded(true)}
            accessibilityLabel={t('comms.expandLog')}
          >
            <Text style={styles.meshLogLine} numberOfLines={1}>
              {meshLogs[meshLogs.length - 1] ?? t('comms.noActivity')}
            </Text>
            <Text style={styles.meshLogChevron}>⌄</Text>
          </TouchableOpacity>
        )}

      </View>
    );
  };

  const portalDeviceTypeLabel = (device: PortalDeviceSummary) => {
    if (device.type === 'lamp') return t('node.lamp');
    if (device.type === 'probe') return t('node.probe');
    if (device.type === 'gateway') return t('node.gateway');
    return t('node.remote');
  };

  const portalFreshnessLabel = (device: PortalDeviceSummary) => {
    if (device.latestTelemetry) return t('devices.latestCloudRecord');
    if (device.freshness === 'recent') return t('devices.recent');
    if (device.freshness === 'stale') return t('devices.stale');
    return t('devices.unknown');
  };

  const portalLastSampleLabel = (device: PortalDeviceSummary) => {
    if (!device.latestSampleAt) return t('probe.noTelemetryYet');
    const timestampMs = new Date(device.latestSampleAt).getTime();
    return Number.isFinite(timestampMs) ? formatDateTime(timestampMs) : t('probe.noTelemetryYet');
  };

  const portalPermissionLabels = (device: PortalDeviceSummary) => [
    device.access.canViewTelemetry ? t('permissions.telemetry') : null,
    device.access.canViewHistory ? t('permissions.history') : null,
    device.access.canTrack ? t('permissions.track') : null,
    device.access.canControl ? t('permissions.control') : null,
    device.access.canEditSettings ? t('permissions.settings') : null,
    device.access.canShare ? t('permissions.share') : null,
  ].filter((label): label is string => Boolean(label));

  const resetPortalGrantDraft = (granteeUid = '') => {
    setPortalGrantEditingId(null);
    setPortalGrantPerson(null);
    setPortalGrantDraft({ granteeUid, ...studentFriendGrantPermissions() });
  };

  const loadPortalDeviceGrants = async (device: PortalDeviceSummary) => {
    if (!device.access.canShare) {
      setPortalDeviceGrants([]);
      setPortalGrantDeviceId(null);
      return;
    }
    try {
      const grants = await portalClient.deviceGrants(device.id);
      setPortalDeviceGrants(grants);
      setPortalGrantDeviceId(device.id);
      setPortalError(null);
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    }
  };

  const openPortalDevice = (device: PortalDeviceSummary) => {
    setSelectedPortalDeviceId(device.id);
    setPortalActionMessage(null);
    resetPortalGrantDraft();
    if (!portalInventoryCached) void loadPortalDeviceGrants(device);
  };

  const handlePortalConnectionRequest = async () => {
    const targetUid = portalConnectionPerson?.uid;
    if (!targetUid) return;
    try {
      setPortalLoading(true);
      setPortalError(null);
      await portalClient.requestConnection(targetUid);
      setPortalConnectionPerson(null);
      await refreshPortalWorkspace();
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePortalConnectionStatus = async (connectionId: string, status: 'accepted' | 'declined' | 'blocked') => {
    try {
      setPortalLoading(true);
      setPortalError(null);
      await portalClient.updateConnection(connectionId, status);
      await refreshPortalWorkspace();
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePortalConnectionRemove = async (connectionId: string) => {
    try {
      setPortalLoading(true);
      setPortalError(null);
      await portalClient.deleteConnection(connectionId);
      await refreshPortalWorkspace();
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePortalTransferCreate = async (device: PortalDeviceSummary, recipientUid: string) => {
    if (portalInventoryCached || !device.access.isOwner || !recipientUid) return;
    try {
      setPortalLoading(true);
      setPortalError(null);
      await portalClient.createDeviceTransfer(device.id, recipientUid);
      await refreshPortalWorkspace();
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePortalTransferAction = async (transferId: string, action: 'accept' | 'reject' | 'cancel') => {
    try {
      setPortalLoading(true);
      setPortalError(null);
      await portalClient.resolveDeviceTransfer(transferId, action);
      await refreshPortalWorkspace();
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePortalGrantEdit = (grant: DeviceGrant) => {
    setPortalGrantEditingId(grant.id);
    setPortalGrantPerson(grant.grantee ?? portalConnections.map(connectedPersonFor).find(person => person.uid === grant.granteeUid) ?? null);
    setPortalGrantDraft({
      granteeUid: grant.granteeUid,
      roomId: grant.roomId,
      canViewTelemetry: grant.canViewTelemetry,
      canViewHistory: grant.canViewHistory,
      canTrack: grant.canTrack,
      canControl: grant.canControl,
      canEditSettings: grant.canEditSettings,
      canShare: grant.canShare,
    });
  };

  const handlePortalGrantSave = async (device: PortalDeviceSummary) => {
    const granteeUid = portalGrantDraft.granteeUid?.trim();
    if (portalInventoryCached || !device.access.canShare || (!portalGrantEditingId && !granteeUid)) return;
    try {
      setPortalLoading(true);
      setPortalError(null);
      const permissions = {
        canViewTelemetry: portalGrantDraft.canViewTelemetry,
        canViewHistory: portalGrantDraft.canViewHistory,
        canTrack: portalGrantDraft.canTrack,
        canControl: portalGrantDraft.canControl,
        canEditSettings: portalGrantDraft.canEditSettings,
        canShare: portalGrantDraft.canShare,
      };
      if (portalGrantEditingId) {
        await portalClient.updateDeviceGrant(device.id, portalGrantEditingId, permissions);
      } else {
        await portalClient.createDeviceGrant(device.id, { granteeUid, ...permissions });
      }
      resetPortalGrantDraft();
      await loadPortalDeviceGrants(device);
      await refreshPortalWorkspace();
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePortalGrantDelete = async (device: PortalDeviceSummary, grantId: string) => {
    try {
      setPortalLoading(true);
      setPortalError(null);
      await portalClient.deleteDeviceGrant(device.id, grantId);
      await loadPortalDeviceGrants(device);
      await refreshPortalWorkspace();
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalLoading(false);
    }
  };

  const resetPortalProjectGrantDraft = () => {
    setPortalProjectGrantDeviceId(null);
    setPortalProjectGrantEditingId(null);
    setPortalProjectGrantDraft({
      canViewTelemetry: true,
      canViewHistory: true,
      canTrack: false,
      canControl: false,
      canEditSettings: false,
    });
  };

  const closePortalProject = () => {
    setSelectedPortalProjectId(null);
    setPortalProjectDetail(null);
    setPortalProjectDeviceGrants([]);
    setPortalProjectPosts([]);
    setPortalProjectTasks([]);
    setPortalProjectFiles([]);
    setPortalProjectKnowledge([]);
    setPortalProjectComposerText('');
    setPortalProjectMenuOpen(false);
    setPortalProjectCalendarOpen(false);
    setPortalProjectTaskCreateOpen(false);
    setPortalProjectTaskDetailId(null);
    setPortalProjectTaskTitle('');
    setPortalProjectTaskDescription('');
    setPortalProjectTaskDueAt(null);
    setPortalProjectTaskRangeMode('date');
    setPortalProjectTaskStartsAt(null);
    setPortalProjectTaskEndsAt(null);
    setPortalProjectTaskWeekAnchor(new Date());
    setPortalProjectTaskPickerTarget(null);
    setPortalProjectMemberPerson(null);
    setPortalProjectMemberRole('member');
    resetPortalProjectGrantDraft();
  };

  const loadPortalProject = async (projectId: string) => {
    try {
      setPortalLoading(true);
      setPortalError(null);
      const [project, deviceGrants, posts, tasks, files, knowledge] = await Promise.all([
        portalClient.project(projectId),
        portalClient.projectDeviceGrants(projectId),
        portalClient.projectPosts(projectId),
        portalClient.projectTasks(projectId),
        portalClient.projectFiles(projectId),
        portalClient.projectKnowledge(projectId),
      ]);
      setSelectedPortalProjectId(projectId);
      setPortalProjectDetail(project);
      setPortalProjectDeviceGrants(deviceGrants);
      setPortalProjectPosts(posts);
      setPortalProjectTasks(tasks);
      setPortalProjectFiles(files);
      setPortalProjectKnowledge(knowledge);
      setPortalProjectComposerText('');
      setPortalProjectMenuOpen(false);
      setPortalProjectCalendarOpen(false);
      setPortalProjectTaskCreateOpen(false);
      setPortalProjectTaskDetailId(null);
      setPortalProjectTaskTitle('');
      setPortalProjectTaskDescription('');
      setPortalProjectTaskDueAt(null);
      setPortalProjectTaskPickerTarget(null);
      setPortalProjectMemberPerson(null);
      setPortalProjectMemberRole('member');
      resetPortalProjectGrantDraft();
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalLoading(false);
    }
  };

  const refreshPortalProject = async () => {
    if (!selectedPortalProjectId) return;
    const [project, deviceGrants, posts, tasks, files, knowledge] = await Promise.all([
      portalClient.project(selectedPortalProjectId),
      portalClient.projectDeviceGrants(selectedPortalProjectId),
      portalClient.projectPosts(selectedPortalProjectId),
      portalClient.projectTasks(selectedPortalProjectId),
      portalClient.projectFiles(selectedPortalProjectId),
      portalClient.projectKnowledge(selectedPortalProjectId),
    ]);
    setPortalProjectDetail(project);
    setPortalProjectDeviceGrants(deviceGrants);
    setPortalProjectPosts(posts);
    setPortalProjectTasks(tasks);
    setPortalProjectFiles(files);
    setPortalProjectKnowledge(knowledge);
  };

  const isoWeekParts = (value: Date) => {
    const local = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    const day = local.getDay() || 7;
    local.setDate(local.getDate() + 4 - day);
    const yearStart = new Date(local.getFullYear(), 0, 1);
    const week = Math.ceil((((local.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { year: local.getFullYear(), week };
  };

  const weekRangeFor = (value: Date) => {
    const monday = new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
    const day = monday.getDay() || 7;
    monday.setDate(monday.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  };

  const shiftProjectWeek = (delta: number) => {
    setPortalProjectTaskWeekAnchor((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + delta * 7);
      return next;
    });
  };

  const portalMemberRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      owner: t('projects.roleOwner'), admin: t('projects.roleAdmin'), member: t('projects.roleMember'),
    };
    return labels[role] ?? role;
  };

  const portalTaskStatusLabel = (status: PortalTask['status']) => {
    const labels = { todo: t('projects.statusOpen'), in_progress: t('projects.statusInProgress'), done: t('projects.statusDone') };
    return labels[status];
  };

  const portalPostTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      post: t('projects.postTypePost'), project_update: t('projects.postTypeUpdate'),
      observation: t('projects.postTypeObservation'), question: t('projects.postTypeQuestion'),
      protocol: t('projects.postTypeProtocol'), result: t('projects.postTypeResult'),
      teaching_note: t('projects.postTypeTeachingNote'), task_update: t('projects.postTypeTaskUpdate'),
    };
    return labels[type] ?? type.replaceAll('_', ' ');
  };

  const projectTaskRangeLabel = (task: PortalTask) => {
    if (task.startsAt && task.endsAt) {
      const start = new Date(task.startsAt);
      const end = new Date(task.endsAt);
      const sameDay = start.toDateString() === end.toDateString();
      return sameDay
        ? `${formatDate(start)} · ${formatTime(start)}–${formatTime(end)}`
        : `${formatDate(start)} – ${formatDate(end)}`;
    }
    return task.dueAt ? formatDateTime(new Date(task.dueAt)) : '';
  };

  const resetPortalProjectTaskDraft = () => {
    setPortalProjectTaskTitle('');
    setPortalProjectTaskDescription('');
    setPortalProjectTaskDueAt(null);
    setPortalProjectTaskRangeMode('date');
    setPortalProjectTaskStartsAt(null);
    setPortalProjectTaskEndsAt(null);
    setPortalProjectTaskWeekAnchor(new Date());
    setPortalProjectTaskPickerTarget(null);
  };

  const handlePortalProjectTaskCreate = async () => {
    const projectId = selectedPortalProjectId;
    const title = portalProjectTaskTitle.trim();
    if (!projectId || !title || portalProjectTaskBusy) return;
    try {
      setPortalProjectTaskBusy(true);
      setPortalError(null);
      const weekRange = weekRangeFor(portalProjectTaskWeekAnchor);
      const startsAt = portalProjectTaskRangeMode === 'interval'
        ? portalProjectTaskStartsAt?.toISOString()
        : portalProjectTaskRangeMode === 'week'
          ? weekRange.start.toISOString()
          : undefined;
      const endsAt = portalProjectTaskRangeMode === 'interval'
        ? portalProjectTaskEndsAt?.toISOString()
        : portalProjectTaskRangeMode === 'week'
          ? weekRange.end.toISOString()
          : undefined;
      const task = await portalClient.createProjectTask(projectId, {
        title,
        description: portalProjectTaskDescription.trim() || undefined,
        dueAt: portalProjectTaskRangeMode === 'date' ? portalProjectTaskDueAt?.toISOString() : endsAt,
        startsAt,
        endsAt,
      });
      setPortalProjectTasks((current) => [...current, task]);
      resetPortalProjectTaskDraft();
      setPortalProjectTaskCreateOpen(false);
      setPortalProjectCalendarOpen(true);
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalProjectTaskBusy(false);
    }
  };

  const handlePortalProjectTaskAction = async (taskId: string, action: 'claim' | 'done' | 'reopen') => {
    const projectId = selectedPortalProjectId;
    if (!projectId || portalProjectTaskBusy) return;
    try {
      setPortalProjectTaskBusy(true);
      setPortalError(null);
      const task = await portalClient.updateProjectTask(projectId, taskId, action);
      setPortalProjectTasks((current) => current.map((entry) => entry.id === task.id ? task : entry));
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalProjectTaskBusy(false);
    }
  };

  const handlePortalProjectMemberAdd = async () => {
    const projectId = selectedPortalProjectId;
    const person = portalProjectMemberPerson;
    if (!projectId || !person || portalProjectMemberBusy) return;
    try {
      setPortalProjectMemberBusy(true);
      setPortalError(null);
      const project = await portalClient.addProjectMember(projectId, person.uid, portalProjectMemberRole);
      setPortalProjectDetail(project);
      setPortalProjectMemberPerson(null);
      setPortalProjectMemberRole('member');
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalProjectMemberBusy(false);
    }
  };

  const handlePortalProjectPost = async () => {
    const projectId = selectedPortalProjectId;
    const body = portalProjectComposerText.trim();
    if (!projectId || !body || portalProjectPosting) return;
    try {
      setPortalProjectPosting(true);
      setPortalError(null);
      const post = await portalClient.createProjectPost(projectId, { type: 'project_update', body });
      setPortalProjectPosts((current) => [...current, post]);
      setPortalProjectComposerText('');
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalProjectPosting(false);
    }
  };

  const handlePortalProjectGrantCreate = async () => {
    const projectId = selectedPortalProjectId;
    const deviceId = portalProjectGrantDeviceId;
    const device = portalDevices.find((item) => item.id === deviceId);
    if (!projectId || !deviceId || !device?.access.canShare || portalInventoryCached) return;
    try {
      setPortalLoading(true);
      setPortalError(null);
      await portalClient.createProjectDeviceGrant(deviceId, projectId, portalProjectGrantDraft);
      await refreshPortalProject();
      resetPortalProjectGrantDraft();
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePortalProjectGrantEdit = (entry: ProjectDeviceGrantView) => {
    const device = portalDevices.find((item) => item.id === entry.device.id);
    if (!device?.access.canShare) return;
    setPortalProjectGrantDeviceId(entry.device.id);
    setPortalProjectGrantEditingId(entry.grant.id);
    setPortalProjectGrantDraft({
      canViewTelemetry: entry.grant.canViewTelemetry,
      canViewHistory: entry.grant.canViewHistory,
      canTrack: entry.grant.canTrack,
      canControl: entry.grant.canControl,
      canEditSettings: entry.grant.canEditSettings,
    });
  };

  const handlePortalProjectGrantUpdate = async () => {
    const deviceId = portalProjectGrantDeviceId;
    const grantId = portalProjectGrantEditingId;
    const device = portalDevices.find((item) => item.id === deviceId);
    if (!deviceId || !grantId || !device?.access.canShare || portalInventoryCached) return;
    try {
      setPortalLoading(true);
      setPortalError(null);
      await portalClient.updateDeviceGrant(deviceId, grantId, { ...portalProjectGrantDraft, canShare: false });
      await refreshPortalProject();
      resetPortalProjectGrantDraft();
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePortalProjectGrantDelete = async (entry: ProjectDeviceGrantView) => {
    const device = portalDevices.find((item) => item.id === entry.device.id);
    if (!device?.access.canShare || portalInventoryCached) return;
    try {
      setPortalLoading(true);
      setPortalError(null);
      await portalClient.deleteDeviceGrant(entry.device.id, entry.grant.id);
      await refreshPortalProject();
      resetPortalProjectGrantDraft();
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalLoading(false);
    }
  };

  const openPortalChat = (roomId: string) => {
    setActivePortalRoomId(roomId);
    setPortalMessages([]);
    setPortalMessageDraft('');
    void refreshPortalRoom(roomId);
  };

  const handlePortalMessageSend = async () => {
    const roomId = activePortalRoomId;
    const room = portalRooms.find((candidate) => candidate.id === roomId);
    const body = portalMessageDraft.trim();
    if (!roomId || !room?.canSend || !body || portalChatBusy) return;
    try {
      setPortalChatBusy(true);
      setPortalError(null);
      await portalClient.sendMessage(roomId, body);
      setPortalMessageDraft('');
      await refreshPortalRoom(roomId);
    } catch (error) {
      setPortalError(portalErrorMessage(error));
    } finally {
      setPortalChatBusy(false);
    }
  };

  const renderConnectionsHeader = () => (
    <View style={styles.connectionsHeader}>
      <View style={styles.screenHeader}>
        <Text style={styles.title}>{t('connections.title')}</Text>
      </View>
      <View style={styles.connectionsTabs}>
        {(['local', 'devices', 'people', 'projects'] as ConnectionsSection[]).map((section) => {
          const active = connectionsSection === section;
          const label = section === 'devices'
            ? t('connections.devices')
            : section === 'people'
              ? t('connections.people')
              : section === 'projects'
                ? t('connections.projects')
                : t('connections.local');
          return (
            <TouchableOpacity
              key={section}
              style={[styles.connectionsTab, active && styles.connectionsTabActive]}
              onPress={() => {
                setConnectionsSection(section);
                setSelectedPortalDeviceId(null);
                setActivePortalRoomId(null);
                if (section !== 'projects') closePortalProject();
                if (section !== 'local' && arcCloudSession.userId && arcCloudSession.emailVerified) void refreshPortalWorkspace();
              }}
            >
              <Text style={[styles.connectionsTabText, active && styles.connectionsTabTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderPermissionBadges = (device: PortalDeviceSummary) => (
    <View style={styles.portalPermissionWrap}>
      {portalPermissionLabels(device).map((label) => (
        <Text key={`${device.id}-${label}`} style={styles.portalPermissionBadge}>{label}</Text>
      ))}
    </View>
  );

  const renderPortalDeviceRow = (device: PortalDeviceSummary) => (
    <TouchableOpacity key={device.id} style={styles.portalListRow} onPress={() => openPortalDevice(device)}>
      <View style={styles.portalListRowMain}>
        <View style={styles.portalListTitleRow}>
          <Text style={styles.portalListTitle} numberOfLines={1}>{device.displayName}</Text>
          <Text style={styles.portalDeviceType}>{portalDeviceTypeLabel(device)}</Text>
        </View>
        <Text style={styles.portalMeta}>
          {isOwnedDevice(device) ? t('devices.ownedByYou') : t('devices.sharedBy', { name: device.owner.displayName })}
        </Text>
        <Text style={styles.portalMeta}>{portalFreshnessLabel(device)} · {t('devices.lastSample', { time: portalLastSampleLabel(device) })}</Text>
        {renderPermissionBadges(device)}
      </View>
      <Text style={styles.portalChevron}>›</Text>
    </TouchableOpacity>
  );

  const renderPortalDeviceDetail = (device: PortalDeviceSummary) => {
    const acceptedConnections = portalConnections.filter((connection) => connection.status === 'accepted');
    const relevantTransfers = portalTransfers.filter((transfer) => transfer.deviceId === device.id && transfer.status === 'pending');
    const grantFlags: Array<{ key: keyof Pick<DeviceGrantInput, 'canViewTelemetry' | 'canViewHistory' | 'canTrack' | 'canControl' | 'canEditSettings' | 'canShare'>; label: string }> = [
      { key: 'canViewTelemetry', label: t('permissions.telemetry') },
      { key: 'canViewHistory', label: t('permissions.history') },
      { key: 'canTrack', label: t('permissions.track') },
      { key: 'canControl', label: t('permissions.control') },
      { key: 'canEditSettings', label: t('permissions.settings') },
      { key: 'canShare', label: t('permissions.share') },
    ];

    return (
      <ScrollView style={styles.connectionsBody} contentContainerStyle={styles.connectionsScrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.portalDetailHeader}>
          <TouchableOpacity style={styles.portalBackButton} onPress={() => setSelectedPortalDeviceId(null)} accessibilityLabel={t('common.close')}>
            <Text style={styles.portalBackButtonText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.portalDetailHeaderCopy}>
            <Text style={styles.portalDetailTitle}>{device.displayName}</Text>
            <Text style={styles.portalMeta}>{portalDeviceTypeLabel(device)} · {isOwnedDevice(device) ? t('devices.ownedByYou') : t('devices.sharedBy', { name: device.owner.displayName })}</Text>
          </View>
        </View>

        <View style={styles.portalPanel}>
          <Text style={styles.portalPanelTitle}>{t('devices.access')}</Text>
          {renderPermissionBadges(device)}
          <View style={styles.portalStatusGrid}>
            <View style={styles.portalStatusCell}>
              <Text style={styles.portalStatusLabel}>{t('devices.cloudAuthorized')}</Text>
              <Text style={styles.portalStatusValue}>{portalInventoryCached ? t('connections.cloudUnavailable') : '✓'}</Text>
            </View>
            <View style={styles.portalStatusCell}>
              <Text style={styles.portalStatusLabel}>{t('devices.localReachable')}</Text>
              <Text style={styles.portalStatusValue}>{t('devices.localUnavailable')}</Text>
            </View>
            <View style={styles.portalStatusCell}>
              <Text style={styles.portalStatusLabel}>{t('devices.trust')}</Text>
              <Text style={styles.portalStatusValue}>{t('security.notConfigured')}</Text>
            </View>
          </View>
        </View>

        {device.type === 'lamp' && (canOpenLatest(device) || canOpenHistory(device)) ? (
          <TouchableOpacity style={styles.buttonSecondary} onPress={() => {
            setSelectedLampId(lampNodes.find(node => node.canonicalDeviceId === device.id || node.id === device.id)?.id ?? device.id); setActiveTabSafe('home');
          }}><Text style={styles.buttonTextLight}>{t('devices.openData')}</Text></TouchableOpacity>
        ) : null}

        {device.type === 'probe' && (canOpenLatest(device) || canOpenHistory(device)) ? (
          <View style={styles.portalPanel}>
            <Text style={styles.portalPanelTitle}>{t('node.probe')}</Text>
            <Text style={styles.portalMeta}>{portalFreshnessLabel(device)} · {t('devices.lastSample', { time: portalLastSampleLabel(device) })}</Text>
            <View style={styles.portalActionRow}>
              {canOpenLatest(device) ? (
                <TouchableOpacity
                  style={styles.buttonSecondary}
                  onPress={() => {
                    setSelectedPortalProbeId(device.id);
                    setSelectedProbeSourceId(null);
                    setProbeSettingsOpen(false);
                    setActiveTabSafe('sensors');
                  }}
                >
                  <Text style={styles.buttonTextLight}>{t('devices.openData')}</Text>
                </TouchableOpacity>
              ) : null}
              {canOpenHistory(device) ? (
                <TouchableOpacity
                  style={styles.buttonSecondary}
                  onPress={() => {
                    setSelectedPortalProbeId(device.id);
                    setSelectedProbeSourceId(null);
                    void openProbeGraphView();
                  }}
                >
                  <Text style={styles.buttonTextLight}>{t('devices.history')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        {device.access.canShare && !portalInventoryCached ? (
          <View style={styles.portalPanel}>
            <Text style={styles.portalPanelTitle}>{t('devices.share')}</Text>
            <View style={styles.portalConnectionChips}>
              {acceptedConnections.map((connection) => {
                const person = connectedPersonFor(connection);
                const active = portalGrantDraft.granteeUid === person.uid;
                return (
                  <TouchableOpacity
                    key={connection.id}
                    style={[styles.portalPersonChip, active && styles.portalPersonChipActive]}
                    onPress={() => { setPortalGrantPerson(person); setPortalGrantDraft((current) => ({ ...current, granteeUid: person.uid, roomId: undefined })); }}
                  >
                    <Text style={[styles.portalPersonChipText, active && styles.portalPersonChipTextActive]}>{person.displayName}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <PortalPeoplePicker removeLabel={(name) => t('people.removePerson', { name })}
              selected={portalGrantPerson}
              onSelect={(person) => { setPortalGrantPerson(person); setPortalGrantDraft((current) => ({ ...current, granteeUid: person?.uid ?? '', roomId: undefined })); }}
              placeholder={t('people.targetUid')}
              noResults={t('people.noResults')}
              errorLabel={t('people.searchError')}
            />
            <TouchableOpacity
              style={styles.portalPresetButton}
              onPress={() => setPortalGrantDraft((current) => ({ ...current, ...studentFriendGrantPermissions() }))}
            >
              <Text style={styles.portalPresetText}>{t('devices.studentPreset')}</Text>
            </TouchableOpacity>
            {grantFlags.map(({ key, label }) => (
              <View key={key} style={styles.portalSwitchRow}>
                <Text style={styles.portalSwitchLabel}>{label}</Text>
                <Switch
                  value={Boolean(portalGrantDraft[key])}
                  onValueChange={(value) => setPortalGrantDraft((current) => ({ ...current, [key]: value }))}
                />
              </View>
            ))}
            <View style={styles.portalActionRow}>
              <TouchableOpacity style={styles.buttonSecondary} onPress={() => resetPortalGrantDraft()}>
                <Text style={styles.buttonTextLight}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.button} onPress={() => void handlePortalGrantSave(device)} disabled={portalLoading}>
                <Text style={styles.buttonText}>{t('devices.saveGrant')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.portalGrantList}>
              {portalGrantDeviceId === device.id && portalDeviceGrants.some((grant) => !grant.roomId && !grant.projectId) ? portalDeviceGrants.filter((grant) => !grant.roomId && !grant.projectId).map((grant) => {
                const person = portalConnections
                  .map(connectedPersonFor)
                  .find((candidate) => candidate.uid === grant.granteeUid);
                return (
                  <View key={grant.id} style={styles.portalGrantRow}>
                    <View style={styles.portalGrantCopy}>
                      <Text style={styles.portalGrantTitle}>{grant.grantee?.displayName ?? person?.displayName ?? t('people.arcMember')}</Text>
                      <Text style={styles.portalMeta} numberOfLines={2}>
                        {[
                          grant.canViewTelemetry ? t('permissions.telemetry') : null,
                          grant.canViewHistory ? t('permissions.history') : null,
                          grant.canTrack ? t('permissions.track') : null,
                          grant.canControl ? t('permissions.control') : null,
                          grant.canEditSettings ? t('permissions.settings') : null,
                          grant.canShare ? t('permissions.share') : null,
                        ].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={styles.portalCompactActions}>
                      <TouchableOpacity onPress={() => handlePortalGrantEdit(grant)}><Text style={styles.portalTextAction}>{t('devices.editGrant')}</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => void handlePortalGrantDelete(device, grant.id)}><Text style={styles.portalDangerAction}>{t('devices.revokeGrant')}</Text></TouchableOpacity>
                    </View>
                  </View>
                );
              }) : <Text style={styles.portalMeta}>{t('devices.noGrants')}</Text>}
            </View>
          </View>
        ) : null}

        {device.access.isOwner && !portalInventoryCached ? (
          <View style={styles.portalPanel}>
            <Text style={styles.portalPanelTitle}>{t('devices.transfer')}</Text>
            <PortalPeoplePicker removeLabel={(name) => t('people.removePerson', { name })} selected={portalTransferPerson} onSelect={setPortalTransferPerson} placeholder={t('people.targetUid')} noResults={t('people.noResults')} errorLabel={t('people.searchError')} />
            {portalTransferPerson ? <TouchableOpacity style={styles.buttonSecondary} onPress={() => Alert.alert(t('devices.transfer'), `${device.displayName}\n${device.owner.displayName} → ${portalTransferPerson.displayName}`, [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('devices.transfer'), style: 'destructive', onPress: () => { void handlePortalTransferCreate(device, portalTransferPerson.uid); setPortalTransferPerson(null); } },
            ])}><Text style={styles.buttonTextLight}>{t('devices.transferTo', { name: portalTransferPerson.displayName })}</Text></TouchableOpacity> : null}
          </View>
        ) : null}

        {relevantTransfers.length ? (
          <View style={styles.portalPanel}>
            <Text style={styles.portalPanelTitle}>{t('devices.pendingTransfers')}</Text>
            {relevantTransfers.map((transfer) => {
              const incoming = transfer.toUid === arcCloudSession.userId;
              const outgoing = transfer.fromUid === arcCloudSession.userId;
              return (
                <View key={transfer.id} style={styles.portalGrantRow}>
                  <Text style={styles.portalMeta}>{transfer.id}</Text>
                  <View style={styles.portalCompactActions}>
                    {incoming ? <TouchableOpacity onPress={() => void handlePortalTransferAction(transfer.id, 'accept')}><Text style={styles.portalTextAction}>{t('devices.acceptTransfer')}</Text></TouchableOpacity> : null}
                    {incoming ? <TouchableOpacity onPress={() => void handlePortalTransferAction(transfer.id, 'reject')}><Text style={styles.portalDangerAction}>{t('devices.rejectTransfer')}</Text></TouchableOpacity> : null}
                    {outgoing ? <TouchableOpacity onPress={() => void handlePortalTransferAction(transfer.id, 'cancel')}><Text style={styles.portalDangerAction}>{t('devices.cancelTransfer')}</Text></TouchableOpacity> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    );
  };

  const renderPortalDevices = () => {
    if (!arcCloudSession.userId || !arcCloudSession.emailVerified) {
      return (
        <View style={styles.connectionsStateCard}>
          <Text style={styles.muted}>{t('connections.signInRequired')}</Text>
          <TouchableOpacity style={styles.buttonSecondary} onPress={() => setAccountOpen(true)}>
            <Text style={styles.buttonTextLight}>{t('auth.signIn')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (selectedPortalDevice) return renderPortalDeviceDetail(selectedPortalDevice);

    return (
      <ScrollView style={styles.connectionsBody} contentContainerStyle={styles.connectionsScrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.portalToolbar}>
          <View style={styles.portalToolbarCopy}>
            {portalInventoryCached ? (
              <Text style={styles.portalWarningText}>
                {t('connections.cachedInventory', { time: portalDevicesCachedAt ? formatDateTime(portalDevicesCachedAt) : '—' })}
              </Text>
            ) : null}
            {portalError ? <Text style={styles.portalWarningText}>{portalError}</Text> : null}
            {portalActionMessage ? <Text style={styles.portalSuccessText}>{portalActionMessage}</Text> : null}
          </View>
          {Platform.OS === 'ios' ? (
            <TouchableOpacity
              style={styles.portalRefreshButton}
              onPress={() => { iosDeviceQrStagedScanRef.current = null; setIosDeviceQrReview(null); setIosDeviceQrScannerOpen(true); }}
              accessibilityRole="button"
              accessibilityLabel="Add device by scanning ARC QR code"
            >
              <Text style={styles.portalTextAction}>+ Scan QR</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.portalRefreshButton} onPress={() => void refreshPortalWorkspace()} disabled={portalLoading}>
            <Text style={styles.portalTextAction}>{portalLoading ? t('connections.refreshing') : t('connections.refresh')}</Text>
          </TouchableOpacity>
        </View>

        {ownedPortalDevices.length ? (
          <View style={styles.portalSection}>
            {ownedPortalDevices.map(renderPortalDeviceRow)}
          </View>
        ) : null}
        {sharedPortalDevices.length ? (
          <View style={styles.portalSection}>
            <View style={styles.portalSharedIndicator}>
              <Text style={styles.portalSharedIndicatorText}>{t('devices.sharedWithMe')}</Text>
            </View>
            {sharedPortalDevices.map(renderPortalDeviceRow)}
          </View>
        ) : null}
        {!portalDevices.length && !portalLoading ? <Text style={styles.muted}>{t('devices.noDevices')}</Text> : null}


        {portalTransfers.filter((transfer) => transfer.status === 'pending').length ? (
          <View style={styles.portalPanel}>
            <Text style={styles.portalPanelTitle}>{t('devices.pendingTransfers')}</Text>
            {portalTransfers.filter((transfer) => transfer.status === 'pending').map((transfer) => {
              const device = portalDevices.find((candidate) => candidate.id === transfer.deviceId);
              const incoming = transfer.toUid === arcCloudSession.userId;
              const outgoing = transfer.fromUid === arcCloudSession.userId;
              return (
                <View key={transfer.id} style={styles.portalGrantRow}>
                  <Text style={styles.portalGrantTitle}>{device?.displayName ?? transfer.deviceId}</Text>
                  <View style={styles.portalCompactActions}>
                    {incoming ? <TouchableOpacity onPress={() => void handlePortalTransferAction(transfer.id, 'accept')}><Text style={styles.portalTextAction}>{t('devices.acceptTransfer')}</Text></TouchableOpacity> : null}
                    {incoming ? <TouchableOpacity onPress={() => void handlePortalTransferAction(transfer.id, 'reject')}><Text style={styles.portalDangerAction}>{t('devices.rejectTransfer')}</Text></TouchableOpacity> : null}
                    {outgoing ? <TouchableOpacity onPress={() => void handlePortalTransferAction(transfer.id, 'cancel')}><Text style={styles.portalDangerAction}>{t('devices.cancelTransfer')}</Text></TouchableOpacity> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    );
  };

  const renderPortalPeople = () => {
    if (!arcCloudSession.userId || !arcCloudSession.emailVerified) {
      return <View style={styles.connectionsStateCard}><Text style={styles.muted}>{t('connections.signInRequired')}</Text><TouchableOpacity style={styles.buttonSecondary} onPress={() => setAccountOpen(true)}><Text style={styles.buttonTextLight}>{t('auth.signIn')}</Text></TouchableOpacity></View>;
    }
    const accepted = portalConnections.filter((connection) => connection.status === 'accepted');
    return (
      <ScrollView style={styles.connectionsBody} contentContainerStyle={styles.connectionsScrollContent} keyboardShouldPersistTaps="handled">
        {portalError ? <Text style={styles.portalWarningText}>{portalError}</Text> : null}
        <View style={styles.portalPanel}>
          <View style={styles.portalInlineForm}>
            <View style={styles.portalPeoplePickerSlot}>
              <PortalPeoplePicker removeLabel={(name) => t('people.removePerson', { name })} selected={portalConnectionPerson} onSelect={setPortalConnectionPerson} placeholder={t('people.targetUid')} noResults={t('people.noResults')} errorLabel={t('people.searchError')} />
            </View>
            <TouchableOpacity style={[styles.button, styles.portalConnectButton]} onPress={() => void handlePortalConnectionRequest()} disabled={!portalConnectionPerson || portalLoading}>
              <Text style={styles.buttonText}>{t('people.request')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.portalFriendList}>
          {accepted.length ? accepted.map((connection) => {
            const person = connectedPersonFor(connection);
            const directRoom = portalRooms.find((room) => room.type === 'direct' && room.members.some((member) => member.user.uid === person.uid));
            const sharedDeviceCount = portalFriendSharedDeviceCounts[person.uid] ?? 0;
            const initials = person.displayName
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part.slice(0, 1).toUpperCase())
              .join('') || 'ARC';
            const meta = [
              person.secondaryLabel,
              sharedDeviceCount > 0 ? `${t('projects.sharedDevices')}: ${sharedDeviceCount}` : null,
            ].filter((value): value is string => Boolean(value)).join(' · ');
            const cardContent = (
              <>
                <View style={styles.portalFriendAvatar}>
                  <Text style={styles.portalFriendAvatarText}>{initials}</Text>
                  {person.avatarUrl ? (
                    <Image
                      source={{ uri: person.avatarUrl }}
                      style={styles.portalFriendAvatarImage}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>
                <View style={styles.portalFriendCopy}>
                  <Text style={styles.portalFriendName}>{person.displayName}</Text>
                  {meta ? <Text style={styles.portalFriendMeta} numberOfLines={2}>{meta}</Text> : null}
                </View>
                {directRoom ? <Text style={styles.portalFriendChevron}>›</Text> : null}
              </>
            );
            return directRoom ? (
              <TouchableOpacity
                key={connection.id}
                style={styles.portalFriendCard}
                onPress={() => openPortalChat(directRoom.id)}
                accessibilityRole="button"
                accessibilityLabel={person.displayName}
              >
                {cardContent}
              </TouchableOpacity>
            ) : (
              <View key={connection.id} style={styles.portalFriendCard}>
                {cardContent}
              </View>
            );
          }) : <Text style={styles.muted}>{t('people.noConnections')}</Text>}
        </View>

        {portalIncomingRequests.length ? (
          <View style={styles.portalSection}>
            <Text style={styles.portalSectionTitle}>{t('people.incoming')}</Text>
            {portalIncomingRequests.map((connection) => {
              const person = connectedPersonFor(connection);
              return (
                <View key={connection.id} style={styles.portalListRow}>
                  <View style={styles.portalListRowMain}><Text style={styles.portalListTitle}>{person.displayName}</Text><Text style={styles.portalMeta}>{person.uid}</Text></View>
                  <View style={styles.portalCompactActions}>
                    <TouchableOpacity onPress={() => void handlePortalConnectionStatus(connection.id, 'accepted')}><Text style={styles.portalTextAction}>{t('people.accept')}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => void handlePortalConnectionStatus(connection.id, 'declined')}><Text style={styles.portalDangerAction}>{t('people.decline')}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => void handlePortalConnectionStatus(connection.id, 'blocked')}><Text style={styles.portalDangerAction}>{t('people.block')}</Text></TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {portalOutgoingRequests.length ? (
          <View style={styles.portalSection}>
            <Text style={styles.portalSectionTitle}>{t('people.outgoing')}</Text>
            {portalOutgoingRequests.map((connection) => {
              const person = connectedPersonFor(connection);
              return (
                <View key={connection.id} style={styles.portalListRow}>
                  <View style={styles.portalListRowMain}><Text style={styles.portalListTitle}>{person.displayName}</Text><Text style={styles.portalMeta}>{person.uid}</Text></View>
                  <TouchableOpacity onPress={() => void handlePortalConnectionRemove(connection.id)}><Text style={styles.portalDangerAction}>{t('people.remove')}</Text></TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    );
  };

  const renderPortalChat = (room: PortalRoom) => {
    const peerUid = room.type === 'direct'
      ? room.members.find((member) => member.user.uid !== arcCloudSession.userId)?.user.uid
      : undefined;
    const connection = peerUid
      ? portalConnections.find((candidate) => {
          const person = connectedPersonFor(candidate);
          return candidate.status === 'accepted' && person.uid === peerUid;
        })
      : undefined;
    const roomTitle = room.title || room.members.map((member) => member.user.displayName).join(' · ');

    const openChatActions = () => {
      if (!connection) return;
      Alert.alert(
        roomTitle,
        undefined,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('people.block'),
            style: 'destructive',
            onPress: () => {
              setActivePortalRoomId(null);
              void handlePortalConnectionStatus(connection.id, 'blocked');
            },
          },
          {
            text: t('people.remove'),
            style: 'destructive',
            onPress: () => {
              setActivePortalRoomId(null);
              void handlePortalConnectionRemove(connection.id);
            },
          },
        ],
      );
    };

    return (
      <View style={styles.portalChatShell}>
        <View style={styles.portalChatHeader}>
          <TouchableOpacity style={styles.portalBackButton} onPress={() => setActivePortalRoomId(null)} accessibilityLabel={t('chat.back')}>
            <Text style={styles.portalBackButtonText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.portalDetailHeaderCopy}>
            <Text style={styles.portalDetailTitle}>{roomTitle}</Text>
            <Text style={styles.portalMeta}>{room.members.map((member) => t('spaces.memberRole', { name: member.user.displayName, role: portalMemberRoleLabel(member.role) })).join(' / ')}</Text>
          </View>
          {connection ? (
            <TouchableOpacity style={styles.portalChatMenuButton} onPress={openChatActions} accessibilityLabel={t('common.more')}>
              <Text style={styles.portalChatMenuButtonText}>⋯</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <ScrollView style={styles.portalMessageList} contentContainerStyle={styles.portalMessageListContent}>
          {portalMessages.length ? portalMessages.map((message) => (
            <View key={message.id} style={[styles.portalMessageRow, message.sender.uid === arcCloudSession.userId && styles.portalMessageRowOwn]}>
              <View style={styles.portalMessageHeader}>
                <Text style={styles.portalMessageSender}>{message.sender.displayName}</Text>
                <Text style={styles.portalMessageTime}>{formatDateTime(new Date(message.createdAt).getTime())}</Text>
              </View>
              <Text style={styles.portalMessageBody}>{message.body}</Text>
            </View>
          )) : <Text style={styles.muted}>{t('chat.noMessages')}</Text>}
        </ScrollView>
        {room.waitingForReply && !room.canSend ? <Text style={styles.portalWaitingText}>{t('chat.waitingForReply')}</Text> : null}
        <View style={styles.portalComposer}>
          <TextInput
            style={styles.portalComposerInput}
            value={portalMessageDraft}
            onChangeText={setPortalMessageDraft}
            placeholder={t('chat.messagePlaceholder')}
            placeholderTextColor={appTheme.colors.textSecondary}
            maxLength={500}
            editable={room.canSend && !portalChatBusy}
            multiline
          />
          <TouchableOpacity style={styles.portalSendButton} onPress={() => void handlePortalMessageSend()} disabled={!room.canSend || portalChatBusy || !portalMessageDraft.trim()}>
            <Text style={styles.portalSendButtonText}>{t('chat.send')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderPortalProjects = () => {
    if (!arcCloudSession.userId || !arcCloudSession.emailVerified) {
      return <View style={styles.connectionsStateCard}><Text style={styles.muted}>{t('connections.signInRequired')}</Text><TouchableOpacity style={styles.buttonSecondary} onPress={() => setAccountOpen(true)}><Text style={styles.buttonTextLight}>{t('auth.signIn')}</Text></TouchableOpacity></View>;
    }

    if (selectedPortalProjectId && portalProjectDetail) {
      const existingDeviceIds = new Set(portalProjectDeviceGrants.map((entry) => entry.device.id));
      const shareableDevices = portalDevices.filter((device) => device.access.canShare && !existingDeviceIds.has(device.id));
      const projectGrantFlags: Array<{ key: keyof typeof portalProjectGrantDraft; label: string }> = [
        { key: 'canViewTelemetry', label: t('permissions.telemetry') },
        { key: 'canViewHistory', label: t('permissions.history') },
        { key: 'canTrack', label: t('permissions.track') },
        { key: 'canControl', label: t('permissions.control') },
        { key: 'canEditSettings', label: t('permissions.settings') },
      ];
      const taskSortAt = (task: PortalTask) => task.startsAt ?? task.dueAt ?? task.endsAt ?? '';
      const datedTasks = portalProjectTasks
        .filter((task) => Boolean(task.dueAt || task.startsAt || task.endsAt))
        .slice()
        .sort((a, b) => Date.parse(taskSortAt(a)) - Date.parse(taskSortAt(b)));
      const toggleProjectMenuSection = (section: 'team' | 'devices' | 'plan' | 'files' | 'knowledge') => {
        setPortalProjectMenuSection((current) => current === section ? current : section);
      };

      const renderProjectDevices = () => (
        <View style={styles.portalProjectToolContent}>
          {portalProjectDeviceGrants.length ? portalProjectDeviceGrants.map((entry) => {
            const canManage = portalDevices.some((device) => device.id === entry.device.id && device.access.canShare);
            const editing = portalProjectGrantEditingId === entry.grant.id;
            const labels = [
              entry.grant.canViewTelemetry ? t('permissions.telemetry') : null,
              entry.grant.canViewHistory ? t('permissions.history') : null,
              entry.grant.canTrack ? t('permissions.track') : null,
              entry.grant.canControl ? t('permissions.control') : null,
              entry.grant.canEditSettings ? t('permissions.settings') : null,
            ].filter((label): label is string => Boolean(label));
            return (
              <View key={entry.grant.id} style={styles.portalProjectToolCard}>
                <Text style={styles.portalListTitle}>{entry.device.displayName}</Text>
                <Text style={styles.portalMeta}>{portalDeviceTypeLabel(entry.device)} · {t('projects.owner', { name: entry.device.owner.displayName })}</Text>
                <Text style={styles.portalMeta}>{labels.join(' · ') || t('projects.noCapabilities')}</Text>
                {canManage ? (
                  <View style={styles.portalCompactActions}>
                    <TouchableOpacity onPress={() => handlePortalProjectGrantEdit(entry)}><Text style={styles.portalTextAction}>{t('devices.editGrant')}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => void handlePortalProjectGrantDelete(entry)}><Text style={styles.portalDangerAction}>{t('devices.revokeGrant')}</Text></TouchableOpacity>
                  </View>
                ) : null}
                {editing ? (
                  <View>
                    {projectGrantFlags.map(({ key, label }) => (
                      <View key={key} style={styles.portalSwitchRow}>
                        <Text style={styles.portalSwitchLabel}>{label}</Text>
                        <Switch value={portalProjectGrantDraft[key]} onValueChange={(value) => setPortalProjectGrantDraft((current) => ({ ...current, [key]: value }))} />
                      </View>
                    ))}
                    <View style={styles.portalActionRow}>
                      <TouchableOpacity style={styles.buttonSecondary} onPress={resetPortalProjectGrantDraft}><Text style={styles.buttonTextLight}>{t('common.cancel')}</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.button} onPress={() => void handlePortalProjectGrantUpdate()} disabled={portalLoading}><Text style={styles.buttonText}>{t('common.save')}</Text></TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          }) : <Text style={styles.muted}>{t('projects.noSharedDevices')}</Text>}
          {!portalInventoryCached && shareableDevices.length ? (
            <View style={styles.portalProjectShareBlock}>
              <Text style={styles.portalProjectToolLabel}>{t('projects.shareDevice')}</Text>
              {shareableDevices.map((device) => (
                <TouchableOpacity key={device.id} style={styles.portalProjectCompactRow} onPress={() => { setPortalProjectGrantEditingId(null); setPortalProjectGrantDeviceId(device.id); }}>
                  <View style={styles.portalListRowMain}>
                    <Text style={styles.portalListTitle}>{device.displayName}</Text>
                    <Text style={styles.portalMeta}>{portalDeviceTypeLabel(device)} · {device.owner.displayName}</Text>
                  </View>
                  <Text style={styles.portalChevron}>{portalProjectGrantDeviceId === device.id ? '✓' : '›'}</Text>
                </TouchableOpacity>
              ))}
              {portalProjectGrantDeviceId && !portalProjectGrantEditingId ? (
                <View style={styles.portalProjectToolCard}>
                  {projectGrantFlags.map(({ key, label }) => (
                    <View key={key} style={styles.portalSwitchRow}>
                      <Text style={styles.portalSwitchLabel}>{label}</Text>
                      <Switch value={portalProjectGrantDraft[key]} onValueChange={(value) => setPortalProjectGrantDraft((current) => ({ ...current, [key]: value }))} />
                    </View>
                  ))}
                  <Text style={styles.portalMeta}>{t('projects.shareNotDelegated')}</Text>
                  <View style={styles.portalActionRow}>
                    <TouchableOpacity style={styles.buttonSecondary} onPress={resetPortalProjectGrantDraft}><Text style={styles.buttonTextLight}>{t('common.cancel')}</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.button} onPress={() => void handlePortalProjectGrantCreate()} disabled={portalLoading}><Text style={styles.buttonText}>{t('projects.shareDeviceAction')}</Text></TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      );

      const renderProjectToolSection = (section: 'team' | 'devices' | 'plan' | 'files' | 'knowledge', title: string, meta: string, content: React.ReactNode) => {
        const open = portalProjectMenuSection === section;
        return (
          <View style={styles.portalProjectToolSection}>
            <TouchableOpacity style={styles.portalProjectToolHeader} onPress={() => toggleProjectMenuSection(section)}>
              <View>
                <Text style={styles.portalProjectToolTitle}>{title}</Text>
                <Text style={styles.portalMeta}>{meta}</Text>
              </View>
              <Text style={styles.portalProjectToolChevron}>{open ? '⌄' : '›'}</Text>
            </TouchableOpacity>
            {open ? content : null}
          </View>
        );
      };

      const projectCalendarIcon = (
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <SvgPath
            d="M6 3.5v3M18 3.5v3M4.5 8.5h15M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5ZM7.5 12h2m2.5 0h2m2.5 0h1M7.5 15.5h2m2.5 0h2m2.5 0h1"
            fill="none"
            stroke={appTheme.colors.textPrimary}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );

      const projectSubviewHeader = (title: string, rightAction?: React.ReactNode) => (
        <View style={styles.portalProjectSubviewHeader}>
          <View style={styles.portalProjectSubviewSideSlot} />
          <Text style={styles.portalProjectSubviewTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.portalProjectSubviewSideSlot}>{rightAction}</View>
        </View>
      );

      if (portalProjectMenuOpen) {
        return (
          <View style={styles.portalProjectScreen}>
            {projectSubviewHeader(t('projects.settings'))}
            {portalError ? <Text style={styles.portalProjectInlineError}>{portalError}</Text> : null}
            <ScrollView
              style={styles.portalProjectFeed}
              contentContainerStyle={styles.portalProjectSettingsContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.portalProjectSettingsIntro}>
                <Text style={styles.portalProjectSettingsProject} numberOfLines={1}>{portalProjectDetail.title}</Text>
                <Text style={styles.portalMeta}>{portalProjectDetail.summary}</Text>
              </View>
              {renderProjectToolSection('team', t('projects.team'), `${portalProjectDetail.members.length}`, (
                <View style={styles.portalProjectToolContent}>
                  {portalProjectDetail.members.map((member) => (
                    <View key={member.user.uid} style={styles.portalProjectCompactRow}>
                      <View style={styles.portalListRowMain}>
                        <Text style={styles.portalListTitle}>{member.user.displayName}</Text>
                        <Text style={styles.portalMeta}>{t('projects.memberRole', { role: portalMemberRoleLabel(member.role) })}</Text>
                      </View>
                    </View>
                  ))}
                  <View style={styles.portalProjectMemberAdd}>
                    <Text style={styles.portalProjectToolLabel}>{t('projects.addTeamMember')}</Text>
                    <PortalPeoplePicker removeLabel={(name) => t('people.removePerson', { name })}
                      selected={portalProjectMemberPerson}
                      onSelect={setPortalProjectMemberPerson}
                      placeholder={t('projects.searchPerson')}
                      noResults={t('people.noResults')}
                      errorLabel={t('people.searchError')}
                    />
                    <View style={styles.portalProjectRoleRow}>
                      {(['member', 'admin'] as const).map((role) => (
                        <TouchableOpacity
                          key={role}
                          style={[styles.portalProjectRoleChip, portalProjectMemberRole === role && styles.portalProjectRoleChipActive]}
                          onPress={() => setPortalProjectMemberRole(role)}
                        >
                          <Text style={[styles.portalProjectRoleChipText, portalProjectMemberRole === role && styles.portalProjectRoleChipTextActive]}>
                            {role === 'member' ? t('projects.roleMember') : t('projects.roleAdmin')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={[styles.button, (!portalProjectMemberPerson || portalProjectMemberBusy) && styles.portalProjectMemberButtonDisabled]}
                      disabled={!portalProjectMemberPerson || portalProjectMemberBusy}
                      onPress={() => void handlePortalProjectMemberAdd()}
                    >
                      <Text style={styles.buttonText}>{portalProjectMemberBusy ? t('projects.addingMember') : t('projects.addToProject')}</Text>
                    </TouchableOpacity>
                    <Text style={styles.portalMeta}>{t('projects.membershipHelp')}</Text>
                  </View>
                </View>
              ))}
              {renderProjectToolSection('devices', t('projects.sharedDevices'), `${portalProjectDeviceGrants.length}`, renderProjectDevices())}
              {renderProjectToolSection('files', t('projects.files'), `${portalProjectFiles.length}`, (
                <View style={styles.portalProjectToolContent}>
                  {portalProjectFiles.length ? portalProjectFiles.map((file) => (
                    <View key={file.id} style={styles.portalProjectCompactRow}>
                      <View style={styles.portalListRowMain}>
                        <Text style={styles.portalListTitle}>{file.name}</Text>
                        <Text style={styles.portalMeta}>{file.contentType}</Text>
                      </View>
                    </View>
                  )) : <Text style={styles.muted}>{t('projects.noFiles')}</Text>}
                </View>
              ))}
              {renderProjectToolSection('knowledge', t('projects.knowledge'), `${portalProjectKnowledge.length}`, (
                <View style={styles.portalProjectToolContent}>
                  {portalProjectKnowledge.length ? portalProjectKnowledge.map((item) => (
                    <View key={item.id} style={styles.portalProjectCompactRow}>
                      <View style={styles.portalListRowMain}>
                        <Text style={styles.portalListTitle}>{item.title}</Text>
                        <Text style={styles.portalMeta}>{item.summary}</Text>
                      </View>
                    </View>
                  )) : <Text style={styles.muted}>{t('projects.noKnowledge')}</Text>}
                </View>
              ))}
            </ScrollView>
          </View>
        );
      }

      if (portalProjectTaskCreateOpen) {
        const dueAt = portalProjectTaskDueAt;
        const weekRange = weekRangeFor(portalProjectTaskWeekAnchor);
        const weekInfo = isoWeekParts(portalProjectTaskWeekAnchor);
        const pickerValue = (() => {
          switch (portalProjectTaskPickerTarget) {
            case 'dueDate':
            case 'dueTime':
              return portalProjectTaskDueAt ?? new Date();
            case 'startDate':
            case 'startTime':
              return portalProjectTaskStartsAt ?? new Date();
            case 'endDate':
            case 'endTime':
              return portalProjectTaskEndsAt ?? portalProjectTaskStartsAt ?? new Date();
            default:
              return new Date();
          }
        })();
        const pickerMode: 'date' | 'time' = portalProjectTaskPickerTarget?.toLowerCase().includes('time') ? 'time' : 'date';
        const applyPickerValue = (value: Date) => {
          const merge = (current: Date | null, mode: 'date' | 'time') => {
            const next = new Date(current ?? new Date());
            if (mode === 'date') next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
            else next.setHours(value.getHours(), value.getMinutes(), 0, 0);
            return next;
          };
          switch (portalProjectTaskPickerTarget) {
            case 'dueDate': setPortalProjectTaskDueAt(merge(portalProjectTaskDueAt, 'date')); break;
            case 'dueTime': setPortalProjectTaskDueAt(merge(portalProjectTaskDueAt, 'time')); break;
            case 'startDate': setPortalProjectTaskStartsAt(merge(portalProjectTaskStartsAt, 'date')); break;
            case 'startTime': setPortalProjectTaskStartsAt(merge(portalProjectTaskStartsAt, 'time')); break;
            case 'endDate': setPortalProjectTaskEndsAt(merge(portalProjectTaskEndsAt, 'date')); break;
            case 'endTime': setPortalProjectTaskEndsAt(merge(portalProjectTaskEndsAt, 'time')); break;
          }
        };
        const intervalValid = portalProjectTaskRangeMode !== 'interval'
          || (portalProjectTaskStartsAt && portalProjectTaskEndsAt && portalProjectTaskEndsAt.getTime() > portalProjectTaskStartsAt.getTime());
        const canCreate = Boolean(portalProjectTaskTitle.trim()) && Boolean(intervalValid);

        const dateTimeButtons = (
          value: Date | null,
          dateTarget: 'dueDate' | 'startDate' | 'endDate',
          timeTarget: 'dueTime' | 'startTime' | 'endTime'
        ) => (
          <View style={styles.portalProjectTaskDateRow}>
            <TouchableOpacity style={styles.portalProjectTaskDateButton} onPress={() => setPortalProjectTaskPickerTarget(dateTarget)}>
              <Text style={styles.portalProjectTaskDateValue}>{value ? formatDate(value) : t('projects.chooseDate')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.portalProjectTaskDateButton} onPress={() => setPortalProjectTaskPickerTarget(timeTarget)}>
              <Text style={styles.portalProjectTaskDateValue}>{value ? formatTime(value) : t('projects.chooseTime')}</Text>
            </TouchableOpacity>
          </View>
        );

        return (
          <View style={styles.portalProjectScreen}>
            {projectSubviewHeader(t('projects.newTask'))}
            {portalError ? <Text style={styles.portalProjectInlineError}>{portalError}</Text> : null}
            <ScrollView style={styles.portalProjectFeed} contentContainerStyle={styles.portalProjectTaskFormContent} keyboardShouldPersistTaps="handled">
              <View style={styles.portalProjectTaskModeRow}>
                {([
                  ['date', t('projects.rangeDate')],
                  ['interval', t('projects.rangeInterval')],
                  ['week', t('projects.rangeWeek')],
                ] as const).map(([mode, label]) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.portalProjectTaskModeButton, portalProjectTaskRangeMode === mode && styles.portalProjectTaskModeButtonActive]}
                    onPress={() => {
                      setPortalProjectTaskRangeMode(mode);
                      setPortalProjectTaskPickerTarget(null);
                    }}
                  >
                    <Text style={[styles.portalProjectTaskModeText, portalProjectTaskRangeMode === mode && styles.portalProjectTaskModeTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.portalProjectTaskField}>
                <Text style={styles.portalProjectTaskLabel}>{t('projects.task')}</Text>
                <TextInput
                  style={styles.portalProjectTaskInput}
                  value={portalProjectTaskTitle}
                  onChangeText={setPortalProjectTaskTitle}
                  placeholder={t('projects.taskPlaceholder')}
                  placeholderTextColor={appTheme.colors.textSecondary}
                  maxLength={240}
                />
              </View>

              <View style={styles.portalProjectTaskField}>
                <Text style={styles.portalProjectTaskLabel}>{t('projects.note')}</Text>
                <TextInput
                  style={[styles.portalProjectTaskInput, styles.portalProjectTaskTextArea]}
                  value={portalProjectTaskDescription}
                  onChangeText={setPortalProjectTaskDescription}
                  placeholder={t('projects.notePlaceholder')}
                  placeholderTextColor={appTheme.colors.textSecondary}
                  multiline
                  maxLength={1000}
                />
              </View>

              {portalProjectTaskRangeMode === 'date' ? (
                <View style={styles.portalProjectTaskField}>
                  <Text style={styles.portalProjectTaskLabel}>{t('projects.due')}</Text>
                  {dateTimeButtons(dueAt, 'dueDate', 'dueTime')}
                  {dueAt ? <TouchableOpacity onPress={() => setPortalProjectTaskDueAt(null)}><Text style={styles.portalTextAction}>{t('projects.clearDueDate')}</Text></TouchableOpacity> : null}
                </View>
              ) : null}

              {portalProjectTaskRangeMode === 'interval' ? (
                <>
                  <View style={styles.portalProjectTaskField}>
                    <Text style={styles.portalProjectTaskLabel}>{t('projects.starts')}</Text>
                    {dateTimeButtons(portalProjectTaskStartsAt, 'startDate', 'startTime')}
                  </View>
                  <View style={styles.portalProjectTaskField}>
                    <Text style={styles.portalProjectTaskLabel}>{t('projects.ends')}</Text>
                    {dateTimeButtons(portalProjectTaskEndsAt, 'endDate', 'endTime')}
                    {!intervalValid ? <Text style={styles.portalWarningText}>{t('projects.invalidInterval')}</Text> : null}
                  </View>
                </>
              ) : null}

              {portalProjectTaskRangeMode === 'week' ? (
                <View style={styles.portalProjectTaskField}>
                  <Text style={styles.portalProjectTaskLabel}>{t('projects.rangeWeek')}</Text>
                  <View style={styles.portalProjectWeekPicker}>
                    <TouchableOpacity style={styles.portalProjectWeekStep} onPress={() => shiftProjectWeek(-1)}>
                      <Text style={styles.portalProjectWeekStepText}>‹</Text>
                    </TouchableOpacity>
                    <View style={styles.portalProjectWeekValue}>
                      <Text style={styles.portalProjectWeekTitle}>{t('projects.rangeWeek')}{weekInfo.week}</Text>
                      <Text style={styles.portalMeta}>{formatDate(weekRange.start)} – {formatDate(weekRange.end)}</Text>
                    </View>
                    <TouchableOpacity style={styles.portalProjectWeekStep} onPress={() => shiftProjectWeek(1)}>
                      <Text style={styles.portalProjectWeekStepText}>›</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <View style={styles.portalProjectTaskOpenCard}>
                <Text style={styles.portalProjectTaskOpenTitle}>{t('projects.openForClaim')}</Text>
                <Text style={styles.portalMeta}>{t('projects.claimHelp')}</Text>
              </View>

              <TouchableOpacity
                style={[styles.button, (!canCreate || portalProjectTaskBusy) && styles.portalProjectMemberButtonDisabled]}
                disabled={!canCreate || portalProjectTaskBusy}
                onPress={() => void handlePortalProjectTaskCreate()}
              >
                <Text style={styles.buttonText}>{portalProjectTaskBusy ? t('projects.creatingTask') : t('projects.createTask')}</Text>
              </TouchableOpacity>
            </ScrollView>

            <Modal
              visible={Boolean(portalProjectTaskPickerTarget)}
              transparent
              animationType="slide"
              onRequestClose={() => setPortalProjectTaskPickerTarget(null)}
            >
              <View style={styles.portalProjectPickerOverlay}>
                <TouchableOpacity style={styles.portalProjectPickerDismiss} activeOpacity={1} onPress={() => setPortalProjectTaskPickerTarget(null)} />
                <View style={styles.portalProjectPickerCard}>
                  <DateTimePicker
                    locale={Platform.OS === 'ios' ? activeLocale : undefined}
                    value={pickerValue}
                    mode={pickerMode}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, value) => {
                      if (value) applyPickerValue(value);
                      if (Platform.OS === 'android') setPortalProjectTaskPickerTarget(null);
                    }}
                  />
                  {Platform.OS === 'ios' ? (
                    <TouchableOpacity style={styles.portalProjectPickerDone} onPress={() => setPortalProjectTaskPickerTarget(null)}>
                      <Text style={styles.buttonTextLight}>{t('projects.pickerDone')}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </Modal>
          </View>
        );
      }

      if (portalProjectTaskDetailId) {
        const task = portalProjectTasks.find((entry) => entry.id === portalProjectTaskDetailId);
        if (task) {
          const statusLabel = task.status === 'todo' ? t('projects.statusOpen') : task.status === 'in_progress' ? t('projects.claimedBy', { name: task.assignee?.displayName ?? t('people.arcMember') }) : t('projects.statusDone');
          return (
            <View style={styles.portalProjectScreen}>
              {projectSubviewHeader(t('projects.task'))}
              {portalError ? <Text style={styles.portalProjectInlineError}>{portalError}</Text> : null}
              <ScrollView style={styles.portalProjectFeed} contentContainerStyle={styles.portalProjectTaskDetailContent}>
                <Text style={styles.portalProjectTaskDetailTitle}>{task.title}</Text>
                <Text style={styles.portalProjectTaskStatus}>{statusLabel}</Text>
                {task.description ? <Text style={styles.portalProjectTaskDetailBody}>{task.description}</Text> : null}
                {task.startsAt && task.endsAt ? (
                  <View style={styles.portalProjectTaskMetaCard}>
                    <Text style={styles.portalProjectTaskLabel}>{t('projects.period')}</Text>
                    <Text style={styles.portalProjectTaskDateValue}>{projectTaskRangeLabel(task)}</Text>
                  </View>
                ) : task.dueAt ? (
                  <View style={styles.portalProjectTaskMetaCard}>
                    <Text style={styles.portalProjectTaskLabel}>{t('projects.due')}</Text>
                    <Text style={styles.portalProjectTaskDateValue}>{formatDateTime(new Date(task.dueAt))}</Text>
                  </View>
                ) : null}
                <View style={styles.portalProjectTaskActionStack}>
                  {task.status === 'todo' ? <TouchableOpacity style={styles.button} disabled={portalProjectTaskBusy} onPress={() => void handlePortalProjectTaskAction(task.id, 'claim')}><Text style={styles.buttonText}>{t('projects.claimTask')}</Text></TouchableOpacity> : null}
                  {task.status === 'in_progress' ? <TouchableOpacity style={styles.button} disabled={portalProjectTaskBusy} onPress={() => void handlePortalProjectTaskAction(task.id, 'done')}><Text style={styles.buttonText}>{t('projects.markDone')}</Text></TouchableOpacity> : null}
                  {task.status === 'done' ? <TouchableOpacity style={styles.buttonSecondary} disabled={portalProjectTaskBusy} onPress={() => void handlePortalProjectTaskAction(task.id, 'reopen')}><Text style={styles.buttonTextLight}>{t('projects.reopenTask')}</Text></TouchableOpacity> : null}
                </View>
              </ScrollView>
            </View>
          );
        }
      }

      if (portalProjectCalendarOpen) {
        return (
          <View style={styles.portalProjectScreen}>
            {projectSubviewHeader(
              t('projects.calendar'),
              <TouchableOpacity
                style={styles.portalProjectAddTaskButton}
                onPress={() => {
                  resetPortalProjectTaskDraft();
                  setPortalProjectTaskDetailId(null);
                  setPortalProjectTaskCreateOpen(true);
                  setPortalProjectCalendarOpen(false);
                }}
                accessibilityLabel={t('projects.createTaskAccessibility')}
              >
                <Text style={styles.portalProjectAddTaskText}>+</Text>
              </TouchableOpacity>
            )}
            {portalError ? <Text style={styles.portalProjectInlineError}>{portalError}</Text> : null}
            <View style={styles.portalProjectCalendarContext}>
              <Text style={styles.portalProjectCalendarContextText}>
                {t('projects.calendarToday', { date: formatDate(new Date(), { day: 'numeric', month: 'long', year: 'numeric' }), week: formatNumber(isoWeekParts(new Date()).week) })}
              </Text>
            </View>
            <ScrollView style={styles.portalProjectFeed} contentContainerStyle={styles.portalProjectCalendarContent}>
              {datedTasks.length ? datedTasks.map((task) => {
                const due = task.startsAt ? new Date(task.startsAt) : task.dueAt ? new Date(task.dueAt) : task.endsAt ? new Date(task.endsAt) : null;
                return (
                  <TouchableOpacity key={task.id} style={styles.portalProjectAgendaRow} onPress={() => { setPortalProjectTaskDetailId(task.id); setPortalProjectCalendarOpen(false); }}>
                    <View style={styles.portalProjectAgendaDate}>
                      <Text style={styles.portalProjectAgendaDay}>{due ? formatDate(due, { day: '2-digit' }) : ''}</Text>
                      <Text style={styles.portalProjectAgendaMonth}>{due ? formatDate(due, { month: 'short' }) : ''}</Text>
                    </View>
                    <View style={styles.portalListRowMain}>
                      <Text style={styles.portalListTitle}>{task.title}</Text>
                      <Text style={styles.portalMeta}>{task.startsAt && task.endsAt ? projectTaskRangeLabel(task) : due ? formatTime(due) : ''} · {portalTaskStatusLabel(task.status)}</Text>
                      {task.description ? <Text style={styles.portalMeta}>{task.description}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              }) : <Text style={styles.muted}>{t('projects.noDatedTasks')}</Text>}
            </ScrollView>
          </View>
        );
      }

      return (
        <KeyboardAvoidingView
          style={styles.portalProjectScreen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? -64 : 0}
        >
          <View style={styles.portalProjectTopBar}>
            <TouchableOpacity
              style={styles.portalProjectTopButton}
              onPress={() => { setPortalProjectMenuOpen(false); setPortalProjectCalendarOpen(true); }}
              accessibilityLabel={t('projects.openCalendar')}
            >
              {projectCalendarIcon}
            </TouchableOpacity>
            <Text style={styles.portalProjectTopTitle} numberOfLines={1}>{portalProjectDetail.title}</Text>
            <TouchableOpacity
              style={styles.portalProjectTopButton}
              onPress={() => { setPortalProjectCalendarOpen(false); setPortalProjectMenuOpen(true); }}
              accessibilityLabel={t('projects.openSettings')}
            >
              <Text style={styles.portalProjectTopIcon}>☰</Text>
            </TouchableOpacity>
          </View>

          {portalError ? <Text style={styles.portalProjectInlineError}>{portalError}</Text> : null}

          <ScrollView
            style={styles.portalProjectFeed}
            contentContainerStyle={styles.portalProjectFeedContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            {portalProjectPosts.length ? portalProjectPosts.map((post) => (
              <View key={post.id} style={styles.portalProjectPost}>
                <View style={styles.portalProjectPostHeader}>
                  <View style={styles.portalProjectAvatar}><Text style={styles.portalProjectAvatarText}>{(post.author.displayName ?? post.author.email ?? 'A')[0]?.toUpperCase()}</Text></View>
                  <View style={styles.portalListRowMain}>
                    <Text style={styles.portalProjectPostAuthor}>{post.author.displayName ?? post.author.email ?? t('people.arcMember')}</Text>
                    <Text style={styles.portalMeta}>{portalPostTypeLabel(post.type)} · {formatDateTime(new Date(post.createdAt))}</Text>
                  </View>
                </View>
                {post.body ? (
                  <TouchableOpacity
                    style={styles.portalProjectPostBodyWrap}
                    activeOpacity={0.72}
                    onPress={() => setPortalExpandedPostIds((current) =>
                      current.includes(post.id) ? current.filter((id) => id !== post.id) : [...current, post.id]
                    )}
                  >
                    <Text
                      style={styles.portalProjectPostBody}
                      numberOfLines={portalExpandedPostIds.includes(post.id) ? undefined : 5}
                    >
                      {post.body}
                    </Text>
                    {!portalExpandedPostIds.includes(post.id) ? <Text style={styles.portalProjectPostMore}>{t('projects.tapToExpand')}</Text> : null}
                  </TouchableOpacity>
                ) : null}
                <View style={styles.portalProjectPostFooter}><Text style={styles.portalMeta}>{t('projects.comments', { count: post.commentCount })}</Text></View>
              </View>
            )) : (
              <View style={styles.portalProjectEmptyFeed}>
                <Text style={styles.portalMeta}>{t('projects.noUpdates')}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.portalProjectComposer}>
            <TextInput
              style={styles.portalProjectComposerInput}
              value={portalProjectComposerText}
              onChangeText={setPortalProjectComposerText}
              placeholder={t('projects.updatePlaceholder')}
              placeholderTextColor={appTheme.colors.textSecondary}
              multiline
              maxLength={10000}
            />
            <TouchableOpacity
              style={[styles.portalProjectSendButton, (!portalProjectComposerText.trim() || portalProjectPosting) && styles.portalProjectSendButtonDisabled]}
              onPress={() => void handlePortalProjectPost()}
              disabled={!portalProjectComposerText.trim() || portalProjectPosting}
              accessibilityLabel={t('projects.postUpdate')}
            >
              <Text style={styles.portalProjectSendText}>↑</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      );
    }

    return (
      <ScrollView style={styles.connectionsBody} contentContainerStyle={styles.connectionsScrollContent}>
        {portalError ? <Text style={styles.portalWarningText}>{portalError}</Text> : null}
        <View style={styles.portalSection}>
          {portalProjects.length ? portalProjects.map((project) => (
            <TouchableOpacity key={project.id} style={styles.portalListRow} onPress={() => void loadPortalProject(project.id)}>
              <View style={styles.portalListRowMain}>
                <Text style={styles.portalListTitle}>{project.title}</Text>
                <Text style={styles.portalMeta}>{project.summary}</Text>
                <Text style={styles.portalMeta}>{t('projects.membersAndDevices', { members: project.memberCount, devices: project.deviceCount })}</Text>
              </View>
              <Text style={styles.portalChevron}>›</Text>
            </TouchableOpacity>
          )) : <Text style={styles.muted}>{t('projects.noProjects')}</Text>}
        </View>
      </ScrollView>
    );
  };

  const renderComms = () => {
    const activeRoom = activePortalRoomId ? portalRooms.find((room) => room.id === activePortalRoomId) ?? null : null;
    if (connectionsSection === 'projects' && selectedPortalProjectId && portalProjectDetail) {
      return <View style={styles.connectionsScreen}>{renderPortalProjects()}</View>;
    }
    if (activeRoom && connectionsSection !== 'local') {
      return (
        <View style={styles.connectionsScreen}>
          {renderConnectionsHeader()}
          {renderPortalChat(activeRoom)}
        </View>
      );
    }

    return (
      <View style={styles.connectionsScreen}>
        {renderConnectionsHeader()}
        <View style={styles.connectionsContent}>
          {connectionsSection === 'devices' ? renderPortalDevices() : null}
          {connectionsSection === 'people' ? renderPortalPeople() : null}
          {connectionsSection === 'projects' ? renderPortalProjects() : null}
          {connectionsSection === 'local' ? (meshEnabled || threadEnabled ? renderMeshComms() : renderBleComms()) : null}
        </View>
      </View>
    );
  };

  const editingMeshNode = meshEditNodeId
    ? meshNodes.find((node) => node.id === meshEditNodeId) ?? null
    : null;
  const editingBridgeAssignableNodes = editingMeshNode?.nodeKind === 'gateway' || editingMeshNode?.nodeKind === 'lamp'
    ? meshNodes.filter(
        (node) =>
          node.provisioned &&
          node.id !== editingMeshNode.id &&
          node.nodeKind === 'probe'
      )
    : [];
  const selectedProbeGateway = selectedProbeNode?.assignedGatewayId
    ? meshNodes.find((node) => node.id === selectedProbeNode.assignedGatewayId) ?? null
    : null;
  const selectedProbeLamp = selectedProbeNode?.assignedBridgeId
    ? meshNodes.find((node) => node.id === selectedProbeNode.assignedBridgeId) ?? null
    : null;
  const selectedProbeRouteDetail = selectedProbeNode?.probeGatewayRoute?.detail ?? null;
  const selectedProbeStatus = selectedProbeNode?.probeStatus ?? null;
  const selectedProbeLastSeenLabel = selectedProbeStatus?.updatedAt
    ? formatDateTime(selectedProbeStatus.updatedAt)
    : selectedProbeNode?.lastSeen
      ? formatDateTime(selectedProbeNode.lastSeen)
      : t('probe.noTelemetryYet');
  const selectedProbeOwnerLabel = selectedProbeLamp?.name ?? selectedProbeGateway?.name ?? t('probe.standalone');
  const selectedProbeOwnershipDetail = selectedProbeLamp || selectedProbeGateway ? t('probe.sleepyChild') : t('probe.standaloneSetup');
  const selectedProbeSampleIntervalSec = selectedProbeSettings?.desiredProbeSettings.regularMeasurementIntervalSec ?? regularIntervalOptions[0];
  const exactProbeSampleIntervalIndex = regularIntervalOptions.findIndex(
    (seconds) => seconds === selectedProbeSampleIntervalSec
  );
  const selectedProbeSampleIntervalIndex = Math.max(
    0,
    exactProbeSampleIntervalIndex >= 0
      ? exactProbeSampleIntervalIndex
      : regularIntervalOptions.reduce((bestIndex, seconds, index) =>
          Math.abs(seconds - selectedProbeSampleIntervalSec) < Math.abs(regularIntervalOptions[bestIndex] - selectedProbeSampleIntervalSec) ? index : bestIndex, 0)
  );
  const selectedProbeSampleSettingStatus = probeSampleConfirmedById[selectedProbeNode?.id ?? ''] === selectedProbeSampleIntervalSec
    ? t('probe.confirmed')
    : selectedProbeSettings?.desiredProbeSettings.commandState === 'unsupported'
      ? t('probe.pendingSupport')
      : t('probe.waitingConfirmation');
  const renderProbeSettings = () => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, styles.probeSettingsContent]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.title}>{t('probe.settingsTitle')}</Text>
        <Text style={styles.subtitle}>
          {selectedProbeNode
            ? `${selectedProbeNode.name} · ${selectedProbeOwnerLabel}`
            : t('probe.select')}
        </Text>
      </View>

      {!selectedProbeNode || !selectedProbeSettings ? (
        <View style={styles.probeSettingsEmpty}>
          <Text style={styles.muted}>{t('probe.selectToEdit')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.manualLampSummary}>
            <View style={[styles.dot, selectedProbeStatus ? styles.dotConnected : styles.dotDisconnected]} />
            <View style={styles.manualLampSummaryCopy}>
              <Text style={styles.manualLampSummaryName}>
                {selectedProbeNode.name}
              </Text>
              <Text style={styles.muted}>{selectedProbeOwnerLabel} · {selectedProbeOwnershipDetail}</Text>
            </View>
            <View style={[styles.nodeKindPill, styles.nodeKindPillProbe]}>
              <Text style={styles.nodeKindPillText}>{t('node.probe')}</Text>
            </View>
          </View>

          <View style={styles.manualControlGroup}>
            <View style={styles.manualGroupHeader}>
              <Text style={styles.manualGroupTitle}>{t('probe.sensors')}</Text>
              <Text style={styles.manualGroupHint}>{t('probe.sensorsHint')}</Text>
            </View>
            <View style={styles.probeSettingsSwitchRow}>
              <View style={styles.probeSettingsRowCopy}>
                <Text style={styles.probeSettingsRowTitle}>{t('probe.environment')}</Text>
                <Text style={styles.probeSettingsRowDetail}>{t('probe.environmentDetail')}</Text>
              </View>
              <Switch
                value={selectedProbeSettings.desiredProbeSettings.environmentSamplingEnabled}
                onValueChange={(value) => updateSelectedProbeDesiredSettings({ environmentSamplingEnabled: value })}
              />
            </View>
            <View style={styles.manualGroupDivider} />
            <View style={styles.probeSettingsSwitchRow}>
              <View style={styles.probeSettingsRowCopy}>
                <Text style={styles.probeSettingsRowTitle}>{t('probe.light')}</Text>
                <Text style={styles.probeSettingsRowDetail}>{t('probe.lightDetail')}</Text>
              </View>
              <Switch
                value={selectedProbeSettings.desiredProbeSettings.lightSamplingEnabled}
                onValueChange={(value) => updateSelectedProbeDesiredSettings({ lightSamplingEnabled: value })}
              />
            </View>
            <View style={styles.manualGroupDivider} />
            <View style={styles.probeSettingsSwitchRow}>
              <View style={styles.probeSettingsRowCopy}>
                <Text style={styles.probeSettingsRowTitle}>{t('probe.soilSpear')}</Text>
                <Text style={styles.probeSettingsRowDetail}>{t('probe.soilDetail')}</Text>
              </View>
              <Switch
                value={selectedProbeSettings.desiredProbeSettings.soilSpearSamplingEnabled}
                onValueChange={(value) => updateSelectedProbeDesiredSettings({ soilSpearSamplingEnabled: value })}
              />
            </View>
            <View style={styles.manualGroupDivider} />
            <TouchableOpacity style={styles.probeSettingsNavRow} onPress={() => setProbeAdvancedSamplingOpen((value) => !value)}>
              <View style={styles.probeSettingsRowCopy}>
                <Text style={styles.probeSettingsRowTitle}>{t('probe.advancedSampling')}</Text>
                <Text style={styles.probeSettingsRowDetail}>{t('probe.gasCadence')}</Text>
              </View>
              <Text style={styles.probeSettingsChevron}>{probeAdvancedSamplingOpen ? '⌃' : '›'}</Text>
            </TouchableOpacity>
            {probeAdvancedSamplingOpen ? (
              <View style={styles.probeSettingsExpandedArea}>
                <Text style={styles.label}>{t('probe.gasMeasurement')}</Text>
                <View style={styles.graphChipWrap}>
                  {gasIntervalOptions.map((option) => {
                    const active = selectedProbeSettings.desiredProbeSettings.gasMeasurementIntervalSec === option.value;
                    return (
                      <TouchableOpacity
                        key={`gas-${option.label}`}
                        style={[styles.nodeKindButton, active && styles.nodeKindButtonActive]}
                        onPress={() => setSelectedProbeGasInterval(option.value)}
                      >
                        <Text style={[styles.nodeKindButtonText, active && styles.nodeKindButtonTextActive]}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.muted}>{t('probe.gasHint')}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.manualControlGroup}>
            <TouchableOpacity style={styles.probeSettingsNavRow} onPress={() => setProbeCalibrationOpen((value) => !value)}>
              <View style={styles.probeSettingsRowCopy}>
                <Text style={styles.probeSettingsRowTitle}>{t('probe.calibration')}</Text>
                <Text style={styles.probeSettingsRowDetail}>{t('probe.calibration')} · {selectedProbeSettings.calibration.status.replace('_', ' ')}</Text>
              </View>
              <Text style={styles.probeSettingsChevron}>{probeCalibrationOpen ? '⌃' : '›'}</Text>
            </TouchableOpacity>
            {probeCalibrationOpen ? (
              <View style={styles.probeSettingsExpandedArea}>
                <Text style={styles.muted}>{t('probe.calibrationHint')}</Text>
                <TouchableOpacity
                  style={styles.buttonSecondary}
                  onPress={() =>
                    updateSelectedProbeSettings((settings) => ({
                      ...settings,
                      calibration: { ...settings.calibration, status: 'experimental' },
                    }))
                  }
                >
                  <Text style={styles.buttonTextLight}>{t('probe.openCalibration')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={styles.manualControlGroup}>
            <View style={styles.manualGroupHeader}>
              <Text style={styles.manualGroupTitle}>{t('probe.device')}</Text>
            </View>
            <View style={styles.probeSettingsStaticRow}>
              <Text style={styles.probeSettingsRowDetail}>{t('probe.ownedBy')}</Text>
              <Text style={styles.probeSettingsRowValue}>{selectedProbeOwnerLabel}</Text>
            </View>
            <View style={styles.manualGroupDivider} />
            <View style={styles.probeSettingsStaticRow}>
              <Text style={styles.probeSettingsRowDetail}>{t('probe.connection')}</Text>
              <Text style={styles.probeSettingsRowValue}>{selectedProbeOwnershipDetail}</Text>
            </View>
            <View style={styles.manualGroupDivider} />
            <TouchableOpacity style={styles.probeSettingsNavRow} onPress={() => setProbeDeviceInfoOpen((value) => !value)}>
              <View style={styles.probeSettingsRowCopy}>
                <Text style={styles.probeSettingsRowTitle}>{t('probe.deviceInfo')}</Text>
                <Text style={styles.probeSettingsRowDetail}>{t('probe.deviceInfoHint')}</Text>
              </View>
              <Text style={styles.probeSettingsChevron}>{probeDeviceInfoOpen ? '⌃' : '›'}</Text>
            </TouchableOpacity>
            {probeDeviceInfoOpen ? (
              <View style={styles.probeSettingsExpandedArea}>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>{t('probe.battery')}</Text>
                  <Text style={styles.value}>{typeof selectedProbeStatus?.batteryPct === 'number' ? `${Math.round(selectedProbeStatus.batteryPct)} %` : '-- %'}</Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>{t('probe.charge')}</Text>
                  <Text style={styles.value}>{selectedProbeStatus?.chargeState ?? '--'}</Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>{t('probe.lastSample')}</Text>
                  <Text style={styles.value}>{selectedProbeLastSeenLabel}</Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>{t('probe.reportedSample')}</Text>
                  <Text style={styles.value}>{formatProbeInterval(selectedProbeStatus?.regularSampleIntervalS)}</Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>{t('probe.reportedGas')}</Text>
                  <Text style={styles.value}>{formatProbeInterval(selectedProbeStatus?.gasSampleIntervalS)}</Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>{t('probe.storedSamples')}</Text>
                  <Text style={styles.value}>{probeLoggingStats.sampleCount}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.manualGroupDivider} />
            <TouchableOpacity style={styles.probeSettingsNavRow} onPress={() => setProbeAdvancedOpen((value) => !value)}>
              <View style={styles.probeSettingsRowCopy}>
                <Text style={styles.probeSettingsRowTitle}>{t('probe.advanced')}</Text>
                <Text style={styles.probeSettingsRowDetail}>{t('probe.diagnostics')}</Text>
              </View>
              <Text style={styles.probeSettingsChevron}>{probeAdvancedOpen ? '⌃' : '›'}</Text>
            </TouchableOpacity>
            {probeAdvancedOpen ? (
              <View style={styles.probeSettingsExpandedArea}>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>{t('probe.rssi')}</Text>
                  <Text style={styles.value}>{typeof selectedProbeStatus?.linkRssiDbm === 'number' ? `${Math.round(selectedProbeStatus.linkRssiDbm)} dBm` : '-- dBm'}</Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>{t('probe.pmic')}</Text>
                  <Text style={styles.value}>{formatHexByte(selectedProbeStatus?.pmicStatusRaw)} / {formatHexByte(selectedProbeStatus?.pmicFaultRaw)}</Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>{t('probe.rgbRaw')}</Text>
                  <Text style={styles.value}>{formatProbeRgb(selectedProbeStatus)}</Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>{t('probe.route')}</Text>
                  <Text style={styles.value}>{formatProbeRouteLabel(selectedProbeNode, selectedProbeGateway, selectedProbeLamp)}</Text>
                </View>
                {selectedProbeRouteDetail ? <Text style={styles.muted}>{selectedProbeRouteDetail}</Text> : null}
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>{t('probe.developerDiagnostics')}</Text>
                  <Switch
                    value={selectedProbeSettings.advanced.developerDiagnostics}
                    onValueChange={(value) =>
                      updateSelectedProbeSettings((settings) => ({
                        ...settings,
                        advanced: { ...settings.advanced, developerDiagnostics: value },
                      }))
                    }
                  />
                </View>
                <TouchableOpacity
                  style={styles.buttonSecondary}
                  onPress={() => {
                    const defaults = buildDefaultProbeSettings(selectedProbeNode.id, selectedProbeNode.name);
                    setProbeSettingsById((prev) => ({ ...prev, [selectedProbeNode.id]: defaults }));
                  }}
                >
                  <Text style={styles.buttonTextLight}>{t('probe.resetLocal')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={styles.manualControlGroup}>
            <TouchableOpacity style={styles.probeSettingsNavRow} onPress={() => setProbeNotesOpen((value) => !value)}>
              <View style={styles.probeSettingsRowCopy}>
                <Text style={styles.probeSettingsRowTitle}>{t('probe.notes')}</Text>
                <Text style={styles.probeSettingsRowDetail}>{t('probe.notesHint')}</Text>
              </View>
              <Text style={styles.probeSettingsChevron}>{probeNotesOpen ? '⌃' : '›'}</Text>
            </TouchableOpacity>
            {probeNotesOpen ? (
              <View style={styles.probeSettingsExpandedArea}>
                <View style={styles.field}>
                  <Text style={styles.label}>{t('probe.plantLocation')}</Text>
                  <TextInput
                    style={styles.input}
                    value={selectedProbeSettings.localAppSettings.plantLabel}
                    onChangeText={(value) => updateSelectedProbeLocalSettings({ plantLabel: value })}
                    placeholder="Kitchen basil"
                    placeholderTextColor={appTheme.colors.placeholder}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>{t('probe.note')}</Text>
                  <TextInput
                    style={[styles.input, styles.probeSettingsNoteInput]}
                    value={selectedProbeSettings.localAppSettings.note}
                    onChangeText={(value) => updateSelectedProbeLocalSettings({ note: value })}
                    placeholder="Placement, soil type, or care notes"
                    placeholderTextColor={appTheme.colors.placeholder}
                    multiline
                  />
                </View>
              </View>
            ) : null}
          </View>
        </>
      )}
    </ScrollView>
  );

  const graphNeedsRotation = Platform.OS !== 'android' && windowHeight > windowWidth;
  const graphStageWidth = Platform.OS === 'android' ? graphViewport.width || windowWidth : Math.max(windowWidth, windowHeight);
  const graphStageHeight = Platform.OS === 'android' ? graphViewport.height || windowHeight : Math.min(windowWidth, windowHeight);
  const graphNotchInset = Platform.OS === 'android' ? 12 : 48;
  const graphAxisLeftGutter = 58;
  const graphAxisRightGutter = 118;
  const graphDrawerWidth = Math.min(Math.max(graphStageWidth * 0.32, 300), 390);
  const [graphMeasuredPlotWidth, setGraphMeasuredPlotWidth] = useState(0);
  const graphPlotWidthFallback = Math.max(
    graphStageWidth - graphNotchInset - graphAxisLeftGutter - graphAxisRightGutter - 32,
    460
  );
  const graphPlotWidth =
    graphMeasuredPlotWidth > 0 ? graphMeasuredPlotWidth : graphPlotWidthFallback;
  // The X-axis labels are siblings of the plot. Measure the plot's actual flex
  // allocation instead of subtracting a guessed 14 px from the whole canvas;
  // that estimate put the bottom labels outside the Android modal viewport.
  const graphPlotHeight = Platform.OS === 'android'
    ? Math.max(1, graphMeasuredPlotHeight || graphStageHeight - 150)
    : Math.max(graphStageHeight - 104, 250);
  const graphEdgeInsetPx = 4;
  // Move the graph's sliding 'now' only when graph data/window state changes,
  // not on every unrelated App render caused by BLE/mesh telemetry.
  const graphWindowEndMs = useMemo(
    () => Date.now(),
    [probeGraphOpen, probeGraphWindow, graphDataReady, recentProbeLogs, recentLampLogs, cloudProbeLogs]
  );
  const graphWindowStartMs = graphWindowEndMs - getProbeGraphWindowMs(probeGraphWindow);
  const graphWindowSpanMs = Math.max(graphWindowEndMs - graphWindowStartMs, 1);
  useEffect(() => {
    const device = selectedLampView.device;
    if (!cloudSyncEnabled || !probeGraphOpen || !graphDataReady || !device || !canReadLampHistory) {
      setCloudLampLogs([]); return;
    }
    let cancelled = false;
    void portalClient.deviceHistory(device.id).then(history => {
      if (!cancelled) setCloudLampLogs(portalHistoryToLampLogs(device, history));
    }).catch(error => { if (!cancelled) setArcCloudError(portalErrorMessage(error)); });
    return () => { cancelled = true; };
  }, [probeGraphOpen, graphDataReady, selectedLampNode?.id, selectedLampNode?.connected, canReadLampHistory, cloudSyncEnabled]);

  const selectedPortalHistoryProbe = selectedPortalProbe && canOpenHistory(selectedPortalProbe) ? selectedPortalProbe : null;
  const selectedProbeGraphId = canReadProbeHistory ? selectedPortalHistoryProbe?.id ?? selectedProbeNode?.id ?? null : null;
  const selectedProbeGraphDisplayName = canReadProbeHistory ? selectedPortalHistoryProbe?.displayName ?? selectedProbeNode?.name ?? null : null;
  const graphSourceLogs = useMemo(() => {
    if (!graphDataReady || !selectedProbeGraphId) return [];
    return mergeHistoryRecords(
      cloudSyncEnabled ? cloudProbeLogs.filter(record => record.probeId === selectedPortalHistoryProbe?.id) : [],
      recentProbeLogs.filter(record => record.probeId === selectedProbeNode?.id || record.probeId === selectedPortalHistoryProbe?.id),
      portalDevices
    );
  }, [
    graphDataReady,
    selectedProbeGraphId,
    selectedPortalHistoryProbe?.id,
    selectedProbeNode?.id,
    cloudProbeLogs,
    recentProbeLogs,
    portalDevices,
    cloudSyncEnabled,
  ]);
  const selectedLampGraphSourceLogs = useMemo(
    () => graphDataReady && selectedLampNode && canReadLampHistory
      ? mergeHistoryRecords(
          cloudSyncEnabled ? cloudLampLogs.filter(record => record.lampId === selectedLampView.device?.id) : [],
          recentLampLogs.filter(record => record.lampId === selectedLampNode.id || record.lampId === selectedLampView.device?.id), portalDevices)
      : [],
    [graphDataReady, selectedLampNode?.id, selectedLampNode?.connected, selectedLampView.device, canReadLampHistory, recentLampLogs, cloudLampLogs, cloudSyncEnabled, portalDevices]
  );
  const probeGraphRecordsWithoutEdgeTime = graphSourceLogs.filter(record=>probeRecordedTimestamp(record)===null).length;
  const lampGraphRecordsWithoutEdgeTime = selectedLampGraphSourceLogs.filter((record) =>
    typeof record.timeline.lampSampledAtMs !== 'number' ||
    !Number.isFinite(record.timeline.lampSampledAtMs)
  ).length;

  // Graphs are deliberately a view over durable telemetry records, not the
  // live phone stream. Live telemetry belongs on the main view. A record only
  // enters the graph when it carries an authoritative sample/edge timestamp.
  const visibleProbeLogs = useMemo(
    () => selectRecordedProbePoints(graphSourceLogs,graphWindowStartMs,graphWindowEndMs),
    [graphSourceLogs, graphWindowStartMs, graphWindowEndMs]
  );
  const visibleLampLogs = useMemo(
    () => selectedLampNode
      ? selectedLampGraphSourceLogs
          .filter((record) =>
            typeof record.timeline.lampSampledAtMs === 'number' &&
            Number.isFinite(record.timeline.lampSampledAtMs)
          )
          .map((record) => ({ record, timestampMs: record.timeline.lampSampledAtMs as number }))
          .filter((entry) => entry.timestampMs >= graphWindowStartMs && entry.timestampMs <= graphWindowEndMs)
          .sort((a, b) => a.timestampMs - b.timestampMs || a.record.recordId.localeCompare(b.record.recordId))
      : [],
    [selectedLampNode?.id, selectedLampGraphSourceLogs, graphWindowStartMs, graphWindowEndMs]
  );
  useEffect(() => {
    if (!probeGraphOpen) {
      graphTimestampDebugSignatureRef.current = '';
      return;
    }

    const formatTimestamp = (value: number | null | undefined) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'null';
      return `${value} (${new Date(value).toISOString()})`;
    };

    const sampleEntries = <T,>(entries: T[]) => {
      if (!entries.length) return [] as T[];
      const indexes = Array.from(new Set([
        0,
        Math.floor((entries.length - 1) / 2),
        entries.length - 1,
      ]));
      return indexes.map((index) => entries[index]);
    };

    const probeSamples = sampleEntries(visibleProbeLogs);
    const lampSamples = sampleEntries(visibleLampLogs);
    const signature = [
      selectedLampNode?.id ?? 'no-lamp',
      selectedProbeGraphId ?? 'no-probe',
      probeGraphWindow,
      `rejected:p${probeGraphRecordsWithoutEdgeTime}:l${lampGraphRecordsWithoutEdgeTime}`,
      `p:${visibleProbeLogs.length}:${probeSamples.map((entry) => `${entry.record.recordId}@${entry.timestampMs}`).join(',')}`,
      `l:${visibleLampLogs.length}:${lampSamples.map((entry) => `${entry.record.recordId}@${entry.timestampMs}`).join(',')}`,
    ].join('|');

    if (graphTimestampDebugSignatureRef.current === signature) return;
    graphTimestampDebugSignatureRef.current = signature;

    console.log(
      `[GraphTime][SUMMARY] lamp=${selectedLampNode?.id ?? 'none'} probe=${selectedProbeGraphId ?? 'none'} ` +
      `window=${probeGraphWindow} recordedOnly=1 probeStored=${graphSourceLogs.length} lampStored=${selectedLampGraphSourceLogs.length} ` +
      `probeVisible=${visibleProbeLogs.length} lampVisible=${visibleLampLogs.length} ` +
      `probeRejectedNoEdgeTime=${probeGraphRecordsWithoutEdgeTime} lampRejectedNoEdgeTime=${lampGraphRecordsWithoutEdgeTime} ` +
      `windowStart=${formatTimestamp(graphWindowStartMs)} windowEnd=${formatTimestamp(graphWindowEndMs)}`
    );

    probeSamples.forEach((entry, index) => {
      const { record, timestampMs } = entry;
      console.log(
        `[GraphTime][PROBE][${index}] id=${record.recordId} ` +
        `device=${formatTimestamp(record.timeline.deviceTimestampMs)} ` +
        `received=${formatTimestamp(record.timeline.receivedAtMs)} ` +
        `plot=${formatTimestamp(timestampMs)} ` +
        `origin=${record.timeline.timestampOrigin ?? 'unknown'}`
      );
    });

    lampSamples.forEach((entry, index) => {
      const { record, timestampMs } = entry;
      console.log(
        `[GraphTime][LAMP][${index}] id=${record.recordId} ` +
        `sampled=${formatTimestamp(record.timeline.lampSampledAtMs)} ` +
        `received=${formatTimestamp(record.timeline.receivedAtMs)} ` +
        `plot=${formatTimestamp(timestampMs)} ` +
        `origin=${record.timeline.timestampOrigin ?? 'unknown'}`
      );
    });
  }, [
    probeGraphOpen,
    probeGraphWindow,
    selectedLampNode?.id,
    selectedProbeNode?.id,
    selectedPortalProbe?.id,
    graphWindowStartMs,
    graphWindowEndMs,
    visibleProbeLogs,
    visibleLampLogs,
  ]);

  const activeGraphSignals = useMemo<ArcGraphSignal[]>(
    () => [
      ...(graphShowLamp && selectedLampNode ? lampGraphVisibleSignals : []),
      ...(graphShowProbe && selectedProbeGraphId ? probeGraphVisibleSignals : []),
    ],
    [
      graphShowLamp,
      graphShowProbe,
      selectedLampNode?.id,
      selectedProbeGraphId,
      lampGraphVisibleSignals,
      probeGraphVisibleSignals,
    ]
  );

  // The selected graph window decides which records are eligible. Once those
  // records are selected, the horizontal plot itself spans the actual data
  // extent: earliest visible sample -> latest visible sample. This avoids a
  // trailing empty region simply because "now" is later than the newest sample.
  const graphTimeDomainTimestamps = useMemo(
    () => activeGraphSignals.flatMap((signalKey) => {
      if (isLampGraphSignal(signalKey)) {
        return visibleLampLogs
          .filter(({ record, timestampMs }) => {
            const value = formatLampGraphValue(record, signalKey);
            return Number.isFinite(timestampMs) && typeof value === 'number' && Number.isFinite(value);
          })
          .map((entry) => entry.timestampMs);
      }

      return visibleProbeLogs
        .filter(({ record, timestampMs }) => {
          const value = formatProbeGraphValue(record, signalKey);
          return Number.isFinite(timestampMs) && typeof value === 'number' && Number.isFinite(value);
        })
        .map((entry) => entry.timestampMs);
    }),
    [activeGraphSignals, visibleLampLogs, visibleProbeLogs]
  );

  const graphTimeDomainMinMs = graphTimeDomainTimestamps.length
    ? Math.min(...graphTimeDomainTimestamps)
    : graphWindowStartMs;
  const graphTimeDomainMaxMs = graphTimeDomainTimestamps.length
    ? Math.max(...graphTimeDomainTimestamps)
    : graphWindowEndMs;
  const graphTimeDomainHasSpan = graphTimeDomainMaxMs > graphTimeDomainMinMs;
  const graphTimeDomainStartMs = graphTimeDomainHasSpan ? graphTimeDomainMinMs : graphWindowStartMs;
  const graphTimeDomainEndMs = graphTimeDomainHasSpan ? graphTimeDomainMaxMs : graphWindowEndMs;
  const graphTimeDomainSpanMs = Math.max(graphTimeDomainEndMs - graphTimeDomainStartMs, 1);

  const graphSeries = useMemo(() => {
    const signalEntries = activeGraphSignals.map((signalKey) => {
      const meta = getArcGraphSignalMeta(signalKey);
      const family = getArcGraphAxisFamily(signalKey);
      const entries = isLampGraphSignal(signalKey)
        ? visibleLampLogs
            .map(({ record, timestampMs }) => ({
              timestampMs,
              value: formatLampGraphValue(record, signalKey),
            }))
            .filter((entry): entry is { timestampMs: number; value: number } =>
              Number.isFinite(entry.timestampMs) && typeof entry.value === 'number' && Number.isFinite(entry.value)
            )
        : visibleProbeLogs
            .map(({ record, timestampMs }) => ({
              timestampMs,
              value: formatProbeGraphValue(record, signalKey),
            }))
            .filter((entry): entry is { timestampMs: number; value: number } =>
              Number.isFinite(entry.timestampMs) && typeof entry.value === 'number' && Number.isFinite(entry.value)
            );
      return { signalKey, meta, family, entries };
    });

    const familyBounds = new Map<string, { minValue: number; maxValue: number }>();
    signalEntries.forEach(({ family, entries }) => {
      if (!entries.length) return;
      const values = entries.map((entry) => entry.value);
      const localMin = Math.min(...values);
      const localMax = Math.max(...values);
      const previous = familyBounds.get(family);
      familyBounds.set(family, {
        minValue: previous ? Math.min(previous.minValue, localMin) : localMin,
        maxValue: previous ? Math.max(previous.maxValue, localMax) : localMax,
      });
    });

    return signalEntries
      .map(({ signalKey, meta, family, entries }) => {
        if (!entries.length) return null;
        const familyRange = familyBounds.get(family);
        if (!familyRange) return null;
        const minValue = familyRange.minValue;
        const maxValue = familyRange.maxValue;
        const range = Math.max(maxValue - minValue, 1);
        const maxPoints = 38;
        const bucketSize = Math.max(1, Math.ceil(entries.length / maxPoints));
        const points: Array<{
          id: string;
          signalKey: ArcGraphSignal;
          xPx: number;
          yPx: number;
          label: string;
          timeLabel: string;
          value: number;
        }> = [];

        for (let index = 0; index < entries.length; index += bucketSize) {
          const bucket = entries.slice(index, index + bucketSize);
          if (!bucket.length) continue;
          const bucketValue = bucket.reduce((sum, entry) => sum + entry.value, 0) / bucket.length;
          const bucketTime = bucket[bucket.length - 1]?.timestampMs ?? graphTimeDomainEndMs;
          const normalizedY = (bucketValue - minValue) / range;
          const xPct = Math.max(
            0,
            Math.min(1, (bucketTime - graphTimeDomainStartMs) / graphTimeDomainSpanMs)
          );
          const yPct = 1 - Math.max(
            0,
            Math.min(1, Number.isFinite(normalizedY) ? normalizedY : 0.5)
          );
          const drawableWidth = Math.max(graphPlotWidth - graphEdgeInsetPx * 2, 1);
          const drawableHeight = Math.max(graphPlotHeight - graphEdgeInsetPx * 2, 1);
          const timeLabel = formatTime(bucketTime);

          points.push({
            id: `${signalKey}-${bucketTime}-${index}`,
            signalKey,
            xPx: graphEdgeInsetPx + xPct * drawableWidth,
            yPx: graphEdgeInsetPx + yPct * drawableHeight,
            label: `${bucketValue.toFixed(meta.decimals)} ${meta.unit}`,
            timeLabel,
            value: bucketValue,
          });
        }

        const path = buildMonotoneSvgPath(points);

        return {
          signalKey,
          meta,
          points,
          path,
          latest: entries[entries.length - 1]?.value ?? null,
          minValue,
          maxValue,
        };
      })
      .filter((series): series is NonNullable<typeof series> => Boolean(series));
  }, [
    activeGraphSignals,
    graphEdgeInsetPx,
    graphPlotHeight,
    graphPlotWidth,
    graphTimeDomainEndMs,
    graphTimeDomainSpanMs,
    graphTimeDomainStartMs,
    visibleLampLogs,
    visibleProbeLogs,
  ]);
  const graphHasPoints = graphSeries.some((series) => series.points.length > 0);
  if (probeGraphOpen) graphVisualRenderGenerationRef.current += 1;
  const graphVisualState = () => ({
    graphOpen: probeGraphOpen ? 1 : 0,
    modalMounted: probeGraphOpen ? 1 : 0,
    graphOpacity: graphContentOpacity.value,
    mainOpacity: mainContentOpacity.value,
    graphContainerMounted: probeGraphOpen ? 1 : 0,
    graphContentMounted: probeGraphOpen ? 1 : 0,
    graphDataReady: graphDataReady ? 1 : 0,
    historyLoading: graphDataReady ? 0 : 1,
    probePoints: graphSeries
      .filter((series) => !isLampGraphSignal(series.signalKey))
      .reduce((count, series) => count + series.points.length, 0),
    lampPoints: graphSeries
      .filter((series) => isLampGraphSignal(series.signalKey))
      .reduce((count, series) => count + series.points.length, 0),
    renderGeneration: graphVisualRenderGenerationRef.current,
    rootLayout: graphVisualRootLayoutRef.current,
    contentLayout: graphVisualContentLayoutRef.current,
    window: `${Math.round(windowWidth)}x${Math.round(windowHeight)}`,
    orientation: windowWidth > windowHeight ? 'landscape' : 'portrait',
  });
  graphVisualStateRef.current = graphVisualState();
  useEffect(() => {
    if (!probeGraphOpen) return;
    console.log('[GraphVisual][STATE]', graphVisualStateRef.current);
    const heartbeat = setInterval(() => {
      console.log('[GraphVisual][HEARTBEAT]', graphVisualStateRef.current);
    }, 2_000);
    return () => clearInterval(heartbeat);
  }, [probeGraphOpen]);
  const graphRejectedNoEdgeTimeCount =
    (graphShowProbe ? probeGraphRecordsWithoutEdgeTime : 0) +
    (graphShowLamp ? lampGraphRecordsWithoutEdgeTime : 0);
  const graphYAxisSignalSlots = normalizeArcGraphYAxisSignals(
    [...probeGraphYAxisSignals, ...activeGraphSignals],
    activeGraphSignals
  );
  const graphYAxisSeries = graphYAxisSignalSlots
    .map((signalKey) => graphSeries.find((series) => series.signalKey === signalKey))
    .filter((series): series is (typeof graphSeries)[number] => Boolean(series));
  const graphLeftYAxisSeries = graphYAxisSeries[0] ?? null;
  const graphRightYAxisSeries = graphYAxisSeries.slice(1, 3);
  const graphXAxisTicks = [
    graphTimeDomainStartMs,
    graphTimeDomainStartMs + graphTimeDomainSpanMs / 2,
    graphTimeDomainEndMs,
  ].map((timestampMs) =>
    new Date(timestampMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
  // Canonical device authority still comes from each Portal DeviceAccess object.
  const settingsLocked = false; // Settings can be viewed; write capabilities are device/local-path specific.

  // Keep this after all hooks: neither app content nor its modals may mount until
  // Firebase has restored the session. A pending logout also hides protected UI.
  if (!authResolved || authSigningOut) {
    return (
      <AppThemeProvider theme={appTheme}>
        <SafeAreaView style={styles.authScreen}>
          <StatusBar
            barStyle={resolvedAppTheme === 'light' ? 'dark-content' : 'light-content'}
            backgroundColor={appTheme.colors.backgroundDeep}
          />
          <View style={styles.startupLoader}>
            <Text style={styles.startupLoaderTitle}>ARC Motion &amp; Light</Text>

            <View style={styles.startupLoaderSpinner}>
              <ActivityIndicator size="large" color={appTheme.colors.textPrimary} />
            </View>

            <View style={styles.startupLoaderLogo} accessibilityElementsHidden>
              <Svg width={72} height={65} viewBox="0 0 64 58">
                <SvgPath
                  d="M12 53V30.8C12 18.9 20.7 9.2 32 9.2s20 9.7 20 21.6V53l-7.4-2.2v-20c0-7.9-5.4-14-12.6-14s-12.6 6.1-12.6 14v20L12 53Z"
                  fill="#31584a"
                  fillRule="evenodd"
                />
                <SvgPath
                  d="M19.4 50.8v-20c0-7.9 5.4-14 12.6-14s12.6 6.1 12.6 14v20l-7.4-2.2V30.8c0-3.7-2.2-6.6-5.2-6.6s-5.2 2.9-5.2 6.6v17.8l-8 2.2Z"
                  fill="#4f378b"
                  fillRule="evenodd"
                />
              </Svg>
            </View>
          </View>
        </SafeAreaView>
      </AppThemeProvider>
    );
  }
  if (!arcCloudSession.userId) {
    return <AppThemeProvider theme={appTheme}>{renderLoginLanding()}</AppThemeProvider>;
  }

  return (
    <AppThemeProvider theme={appTheme}>
    <SafeAreaView style={[styles.safeArea, Platform.OS === 'android' && { paddingTop: systemInsets.top, paddingBottom: systemInsets.bottom, paddingLeft: systemInsets.left, paddingRight: systemInsets.right }] }>
      <StatusBar
        barStyle={resolvedAppTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={appTheme.colors.background}
      />
      <Reanimated.View style={[styles.mainContentShell, mainContentFadeStyle]}>
      <View style={styles.container}>
        {localStorageOpen ? renderLocalStorageView() : (
          <>
            {activeTab === 'home' && renderHome()}
            {activeTab === 'clock' && renderClock()}
            {activeTab === 'manual' && renderManual()}
            {activeTab === 'sensors' && (probeSettingsOpen ? renderProbeSettings() : renderSensors())}
            {activeTab === 'comms' && renderComms()}
          </>
        )}
      </View>

      {!localStorageOpen && !scheduleOutputGraphOpen && activeTab === 'home' ? (
        <View style={[styles.cornerNav, Platform.OS === 'android' && { left: 22, right: 22, bottom: 12 }] }>
          <TouchableOpacity
            style={[styles.cornerButton, settingsLocked && styles.headerActionButtonDisabled]}
            onPress={() => !settingsLocked && setActiveTabSafe((prev) => (prev === 'clock' ? 'home' : 'clock'))}
            disabled={settingsLocked}
            accessibilityLabel="Open clock settings"
          >
            <Text style={styles.cornerIcon}>🕒</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cornerButton}
            onPress={() => setActiveTabSafe((prev) => (prev === 'comms' ? 'home' : 'comms'))}
            accessibilityLabel="Open connection settings"
          >
            <ConnectionsIcon
              size={cornerIconSize}
              color={CONNECTIONS_ICON_BLUE}
            />
          </TouchableOpacity>
        </View>
      ) : !localStorageOpen && !scheduleOutputGraphOpen ? (
        <View
          style={[
            styles.persistentFooter,
            activeTab === 'comms' && connectionsSection === 'local' && styles.persistentFooterComms,
          ]}
        >
          <TouchableOpacity
            style={styles.footerBackButton}
            onPress={() => {
              if (activeTab === 'comms' && connectionsSection === 'projects' && selectedPortalProjectId) {
                if (portalProjectTaskCreateOpen) {
                  setPortalProjectTaskCreateOpen(false);
                  resetPortalProjectTaskDraft();
                  setPortalProjectCalendarOpen(true);
                } else if (portalProjectTaskDetailId) {
                  setPortalProjectTaskDetailId(null);
                  setPortalProjectCalendarOpen(true);
                } else if (portalProjectMenuOpen) {
                  setPortalProjectMenuOpen(false);
                } else if (portalProjectCalendarOpen) {
                  setPortalProjectCalendarOpen(false);
                } else {
                  closePortalProject();
                }
              } else if (activeTab === 'sensors' && probeSettingsOpen) {
                setProbeSettingsOpen(false);
              } else {
                setActiveTabSafe('home');
              }
            }}
            accessibilityLabel={
              activeTab === 'comms' && connectionsSection === 'projects' && selectedPortalProjectId
                ? portalProjectTaskCreateOpen || portalProjectTaskDetailId
                  ? 'Back to Project calendar'
                  : portalProjectMenuOpen || portalProjectCalendarOpen
                    ? 'Back to Project'
                    : t('projects.back')
                : activeTab === 'sensors' && probeSettingsOpen
                  ? 'Back to Probe'
                  : 'Back to home'
            }
          >
            <Text style={styles.homeIcon}>←</Text>
          </TouchableOpacity>
          {activeTab === 'comms' && connectionsSection === 'local' ? (
            <View style={styles.footerCommsActions}>
              {meshLogExpanded ? (
                <TouchableOpacity
                  style={[styles.buttonSecondary, styles.footerCommsButton, styles.footerCommsAuxButton]}
                  onPress={() => { setDebugMailboxOpen(true); addMeshLog('[DebugHistory][OPEN]', selectedLampIdRef.current); }}
                  accessibilityLabel="Open Debug History Mailbox"
                ><Text style={styles.footerScanButtonText}>Debug</Text></TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.buttonSecondary, styles.footerCommsButton]}
                onPress={handleMeshScan}
                disabled={meshScanning}
                accessibilityLabel={meshScanning ? t('comms.scanning') : t('comms.scan')}
              >
                <Text style={styles.footerScanButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {meshScanning ? t('comms.scanning') : t('comms.scan')}
                </Text>
              </TouchableOpacity>
              {meshLogExpanded ? (
                <TouchableOpacity
                  style={[styles.buttonSecondary, styles.footerCommsButton, styles.footerCommsAuxButton]}
                  onPress={() => void handleCopyMeshLog()}
                  accessibilityLabel="Copy connection log"
                >
                  <Text style={styles.footerScanButtonText}>Copy</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      </Reanimated.View>

      <DebugHistoryMailboxView
        visible={debugMailboxOpen}
        mailbox={debugMailbox}
        lamps={localLampNodes}
        preferredLampId={selectedLampNode?.id ?? null}
        sessionState={mesh.getHistorySessionState}
        theme={appTheme}
        onClose={() => { debugMailbox.cancel(); setDebugMailboxOpen(false); }}
      />

      <Modal
        visible={lampSelectorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLampSelectorOpen(false)}
        supportedOrientations={["portrait", "portrait-upside-down", "landscape", "landscape-left", "landscape-right"]}
      >
        <View style={styles.meshModalBackdrop}>
          <View style={styles.lampSelectorCard}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.modalTitle}>{t('lamp.select')}</Text>
                <Text style={styles.muted}>{t('lamp.selectHint')}</Text>
                {Platform.OS === 'android' ? <Text style={styles.muted}>Hold a BLE device to link/unlink its owner cloud record.</Text> : null}
              </View>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setLampSelectorOpen(false)}
                accessibilityLabel={t('access.closeLampSelector')}
              >
                <Text style={styles.iconButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.lampSelectorList} contentContainerStyle={styles.lampSelectorListContent}>
              {lampNodes.length ? (
                lampNodes.map((lamp) => {
                  const selected = lamp.id === selectedLampId;
                  const lastSeen = lamp.lastSeen ?? null;
                  const ageMs = lastSeen ? Math.max(0, Date.now() - lastSeen) : null;
                  const freshness = deviceView(lamp, portalDevices, !portalInventoryCached).provenance === 'cloud'
                    ? t('devices.latestCloudRecord')
                    : lamp.connected
                    ? t('lamp.live')
                    : ageMs === null
                      ? t('lamp.noTelemetry')
                      : ageMs < 60_000
                        ? t('lamp.seenNow')
                        : t('lamp.seenMinutes', { count: Math.max(1, Math.round(ageMs / 60_000)) });
                  const limited = Boolean(lamp.status?.openMeshFlags?.thermalLimitReached || lamp.status?.openMeshFlags?.thermalShutdown);
                  const route = !lamp.provisioned ? t('connections.devices') : lamp.assignedGatewayId ? t('lamp.gatewayThread') : t('lamp.directBle');

                  return (
                    <TouchableOpacity
                      key={lamp.id}
                      style={[styles.lampSelectorRow, selected && styles.lampSelectorRowSelected]}
                      onPress={() => {
                        setSelectedLampId(lamp.id);
                        setLampSelectorOpen(false);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Select ${lamp.name}`}

                    >
                      <View style={[styles.lampSelectorBulb, { backgroundColor: lamp.color || '#29a760' }]}>
                        <Text style={styles.lampSelectorBulbText}>💡</Text>
                      </View>
                      <View style={styles.lampSelectorCopy}>
                        <View style={styles.lampSelectorNameRow}>
                          <Text style={styles.lampSelectorName} numberOfLines={1}>{lamp.name}</Text>
                          {limited ? <Text style={styles.lampSelectorWarning}>{t('lamp.limit')}</Text> : null}
                        </View>
                        <Text style={styles.lampSelectorMeta} numberOfLines={1}>{route} • {freshness}</Text>
                      </View>
                      <Text style={[styles.lampSelectorCheck, selected && styles.lampSelectorCheckSelected]}>
                        {selected ? '✓' : '○'}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.lampSelectorEmpty}>
                  <Text style={styles.cardTitle}>{t('lamp.noLamps')}</Text>
                  <Text style={styles.muted}>{t('lamp.noLampsHint')}</Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                setLampSelectorOpen(false);
                setActiveTabSafe('comms');
              }}
              accessibilityLabel={t('access.manageLamps')}
            >
              <Text style={styles.buttonText}>{lampNodes.length ? t('lamp.manage') : t('lamp.add')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={lampHealthLogOpen} transparent animationType="fade" onRequestClose={() => setLampHealthLogOpen(false)}>
        <View style={styles.meshModalBackdrop}>
          <View style={styles.lampSelectorCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>{t('lamp.events')}</Text>
              <View style={styles.lampHealthLogActions}>
                <TouchableOpacity style={styles.buttonSecondary} onPress={clearDisplayedLampHealthEvents} accessibilityLabel={t('access.clearLampEvents')}>
                  <Text style={styles.buttonTextLight}>{t('lamp.clearDisplayed')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => setLampHealthLogOpen(false)} accessibilityLabel={t('access.closeLampEvents')}>
                  <Text style={styles.iconButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.muted}>{t('lamp.eventClearHint')}</Text>
            <ScrollView style={styles.lampSelectorList} contentContainerStyle={styles.lampSelectorListContent}>
              {lampHealthEvents.filter((event) => event.nodeId === selectedLampNode?.id).length ? (
                lampHealthEvents.filter((event) => event.nodeId === selectedLampNode?.id).map((event) => (
                  <View key={event.id} style={[styles.lampHealthLogRow, event.severity === 'warning' ? styles.lampHealthBannerWarning : styles.lampHealthBannerError]}>
                    <Text style={styles.lampHealthBannerText}>{`${event.severity === 'warning' ? 'Warning' : 'Error'} · ${event.message}`}</Text>
                    <Text style={styles.lampHealthBannerTime}>{formatDateTime(event.atMs)}</Text>
                  </View>
                ))
              ) : <Text style={styles.muted}>{t('lamp.noEvents')}</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={settingsOpen}
        animationType="slide"
        transparent
        supportedOrientations={["portrait", "portrait-upside-down"]}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {languagePickerOpen ? renderSettingsLanguagePicker() : (
              <>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>{t('common.settings')}</Text>
              <TouchableOpacity style={styles.iconButton} onPress={() => { setLanguagePickerOpen(false); setSettingsOpen(false); }}>
                <Text style={styles.iconButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.settingsHomeButton}
              onPress={() => {
                setLanguagePickerOpen(false);
                setSettingsOpen(false);
                setActiveTabSafe('home');
              }}
              accessibilityLabel={t('access.backHome')}
            >
              <Text style={styles.homeIcon}>←</Text>
            </TouchableOpacity>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('appearance.title')}</Text>
                <View style={styles.appearanceSelector} accessibilityRole="radiogroup">
                  {(['system', 'light', 'dark'] as const).map((preference) => {
                    const selected = themePreference === preference;
                    const label =
                      preference === 'system'
                        ? t('appearance.system')
                        : preference === 'light'
                          ? t('appearance.light')
                          : t('appearance.dark');
                    return (
                      <TouchableOpacity
                        key={preference}
                        style={[styles.appearanceOption, selected && styles.appearanceOptionSelected]}
                        onPress={() => setThemePreference(preference)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.appearanceOptionText, selected && styles.appearanceOptionTextSelected]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.settingsListGroup}>
                  <TouchableOpacity
                    style={styles.probeSettingsNavRow}
                    onPress={() => void openAccountView()}
                  >
                    <View style={styles.probeSettingsRowCopy}>
                      <Text style={styles.probeSettingsRowTitle}>{t('account.userAccount')}</Text>
                      <Text style={styles.probeSettingsRowDetail} numberOfLines={1}>
                        {arcCloudSession.email ?? arcCloudSession.authProvider}
                      </Text>
                    </View>
                    <Text style={styles.probeSettingsChevron}>›</Text>
                  </TouchableOpacity>

                  <View style={styles.settingsListDivider} />

                  <TouchableOpacity
                    style={styles.probeSettingsNavRow}
                    onPress={() => setLanguagePickerOpen(true)}
                    accessibilityLabel={t('language.title')}
                  >
                    <View style={styles.probeSettingsRowCopy}>
                      <Text style={styles.probeSettingsRowTitle}>{t('language.title')}</Text>
                      <Text style={styles.probeSettingsRowDetail}>{selectedLanguageLabel}</Text>
                    </View>
                    <Text style={styles.probeSettingsChevron}>›</Text>
                  </TouchableOpacity>

                  <View style={styles.settingsListDivider} />

                  <TouchableOpacity
                    style={styles.probeSettingsNavRow}
                    onPress={() => void handleArcSignOut()}
                    disabled={authSigningOut}
                    accessibilityRole="button"
                    accessibilityLabel={t('account.signOut')}
                    accessibilityState={{ disabled: authSigningOut }}
                  >
                    <Text style={styles.probeSettingsRowTitle}>{t('account.signOut')}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.dataStorage')}</Text>
                <View style={styles.settingsListGroup}>
                  <View style={styles.probeSettingsStaticRow}>
                    <View style={styles.probeSettingsRowCopy}>
                      <Text style={styles.probeSettingsRowTitle}>{t('settings.cloudSync')}</Text>
                      <Text style={styles.probeSettingsRowDetail}>{cloudSyncStatusLabel}</Text>
                    </View>
                    <Switch value={cloudSyncEnabled} onValueChange={setCloudSyncEnabled} disabled={ARC_CLOUD_SYNC_VALIDATION_HOLD} />
                  </View>

                  <View style={styles.settingsListDivider} />

                  <TouchableOpacity
                    style={styles.probeSettingsNavRow}
                    onPress={() => {
                      setLanguagePickerOpen(false);
                      setSettingsOpen(false);
                      openLocalStorage(true);
                    }}
                    accessibilityLabel={t('storage.title')}
                  >
                    <Text style={styles.settingsRowIcon}>💾</Text>
                    <View style={styles.probeSettingsRowCopy}>
                      <Text style={styles.probeSettingsRowTitle}>{t('settings.localStorage')}</Text>
                      <Text style={styles.probeSettingsRowDetail}>{t('storage.subtitle')}</Text>
                    </View>
                    <Text style={styles.probeSettingsChevron}>›</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.devicesSetup')}</Text>
                <View style={styles.settingsListGroup}>
                  <View style={styles.probeSettingsStaticRow}>
                    <View style={styles.probeSettingsRowCopy}>
                      <Text style={styles.probeSettingsRowTitle}>{t('settings.multiLamp')}</Text>
                    </View>
                    <Switch value={multiLampEnabled} onValueChange={setMultiLampEnabled} />
                  </View>

                  <View style={styles.settingsListDivider} />

                  <TouchableOpacity
                    style={styles.probeSettingsNavRow}
                    onPress={() => {
                      setSettingsOpen(false);
                      setActiveTabSafe('comms');
                    }}
                  >
                    <View style={styles.probeSettingsRowCopy}>
                      <Text style={styles.probeSettingsRowTitle}>{t('settings.connections')}</Text>
                      <Text style={styles.probeSettingsRowDetail}>Thread · Bluetooth · ARC</Text>
                    </View>
                    <Text style={styles.probeSettingsChevron}>›</Text>
                  </TouchableOpacity>

                  <View style={styles.settingsListDivider} />

                  <TouchableOpacity
                    style={styles.probeSettingsNavRow}
                    onPress={() => setSettingsLampConfigOpen((value) => !value)}
                  >
                    <View style={styles.probeSettingsRowCopy}>
                      <Text style={styles.probeSettingsRowTitle}>{t('settings.lampConfiguration')}</Text>
                      <Text style={styles.probeSettingsRowDetail}>{t('settings.lampConfigurationDetail')}</Text>
                    </View>
                    <Text style={styles.probeSettingsChevron}>{settingsLampConfigOpen ? '⌃' : '⌄'}</Text>
                  </TouchableOpacity>

                  {settingsLampConfigOpen ? (
                    <View style={styles.settingsExpandedArea}>
                      <Text style={styles.settingsExpandedTitle}>{t('settings.thermalLimits')}</Text>
                      <View style={styles.field}>
                        <Text style={styles.label}>{t('settings.maxCoreTemp')}</Text>
                        <TextInput style={styles.input} value={maxCoreTemp} onChangeText={setMaxCoreTemp} keyboardType="numeric" />
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.label}>{t('settings.maxCpuTemp')}</Text>
                        <TextInput style={styles.input} value={maxCpuTemp} onChangeText={setMaxCpuTemp} keyboardType="numeric" />
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.label}>{t('settings.minCoreTemp')}</Text>
                        <TextInput style={styles.input} value={minCoreTemp} onChangeText={setMinCoreTemp} keyboardType="numeric" />
                      </View>

                      <View style={styles.settingsExpandedDivider} />

                      <Text style={styles.settingsExpandedTitle}>{t('settings.power')}</Text>
                      <View style={styles.field}>
                        <Text style={styles.label}>{t('settings.maxPower')}</Text>
                        <TextInput style={styles.input} value={maxPower} onChangeText={setMaxPower} keyboardType="numeric" />
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.label}>{t('settings.pwmFrequency')}</Text>
                        <TextInput style={styles.input} value={pwmFreq} onChangeText={setPwmFreq} keyboardType="numeric" />
                      </View>

                      <View style={styles.settingsExpandedDivider} />

                      <View style={styles.rowBetween}>
                        <Text style={styles.settingsExpandedTitle}>{t('settings.fans')}</Text>
                        <Switch value={hasFans} onValueChange={setHasFans} />
                      </View>
                      {hasFans ? (
                        <>
                          <View style={styles.field}>
                            <Text style={styles.label}>{t('settings.fanRpmTarget')}</Text>
                            <TextInput style={styles.input} value={fanRpm} onChangeText={setFanRpm} keyboardType="numeric" />
                          </View>
                          <View style={styles.field}>
                            <Text style={styles.label}>{t('settings.fanStartTemp')}</Text>
                            <TextInput style={styles.input} value={fanStartTemp} onChangeText={setFanStartTemp} keyboardType="numeric" />
                          </View>
                        </>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.settingsListGroup}>
                  <TouchableOpacity
                    style={styles.probeSettingsNavRow}
                    onPress={() => setSettingsAdvancedOpen((value) => !value)}
                  >
                    <View style={styles.probeSettingsRowCopy}>
                      <Text style={styles.probeSettingsRowTitle}>{t('settings.advanced')}</Text>
                      <Text style={styles.probeSettingsRowDetail}>{t('settings.advancedDetail')}</Text>
                    </View>
                    <Text style={styles.probeSettingsChevron}>{settingsAdvancedOpen ? '⌃' : '⌄'}</Text>
                  </TouchableOpacity>

                  {settingsAdvancedOpen ? (
                    <View style={styles.settingsExpandedArea}>
                      <Text style={styles.settingsExpandedTitle}>{t('settings.networkProtocol')}</Text>
                      <View style={styles.radioRow}>
                        <TouchableOpacity style={styles.radioItem} onPress={() => handleToggleMesh(true)}>
                          <View style={[styles.radioOuter, meshEnabled && styles.radioOuterActive]}>
                            {meshEnabled ? <View style={styles.radioInner} /> : null}
                          </View>
                          <Text style={styles.label}>{t('settings.arcLocal')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.radioItem} onPress={() => handleToggleThread(true)}>
                          <View style={[styles.radioOuter, threadEnabled && styles.radioOuterActive]}>
                            {threadEnabled ? <View style={styles.radioInner} /> : null}
                          </View>
                          <Text style={styles.label}>Thread</Text>
                        </TouchableOpacity>
                      </View>



                      <View style={styles.settingsExpandedDivider} />

                      <Text style={styles.settingsExpandedTitle}>{t('settings.timeFormat')}</Text>
                      <View style={styles.radioRow}>
                        <TouchableOpacity style={styles.radioItem} onPress={() => setTimeFormat('24')}>
                          <View style={[styles.radioOuter, timeFormat === '24' && styles.radioOuterActive]}>
                            {timeFormat === '24' ? <View style={styles.radioInner} /> : null}
                          </View>
                          <Text style={styles.label}>24T</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.radioItem} onPress={() => setTimeFormat('ampm')}>
                          <View style={[styles.radioOuter, timeFormat === 'ampm' && styles.radioOuterActive]}>
                            {timeFormat === 'ampm' ? <View style={styles.radioInner} /> : null}
                          </View>
                          <Text style={styles.label}>AM/PM</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.settingsExpandedDivider} />

                      <View style={styles.rowBetween}>
                        <Text style={styles.settingsExpandedTitle}>{t('settings.firmware')}</Text>
                        <Text style={styles.value}>{firmwareRevision}</Text>
                      </View>
                      <TouchableOpacity style={styles.buttonSecondary}>
                        <Text style={styles.buttonTextLight}>{t('settings.checkUpdate')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </View>
            </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {renderAccountModal()}
      {renderChildAccountModal()}

      <Modal
        visible={scheduleOutputGraphOpen}
        animationType="slide"
        transparent={false}
        presentationStyle="fullScreen"
        supportedOrientations={["portrait", "portrait-upside-down"]}
        onRequestClose={() => setScheduleOutputGraphOpen(false)}
      >
        {renderScheduleOutputGraph()}
      </Modal>

      <Modal
        visible={probeGraphOpen}
        animationType="none"
        transparent={false}
        presentationStyle="fullScreen"
        supportedOrientations={["landscape", "landscape-left", "landscape-right"]}
        onShow={handleProbeGraphShown}
        onOrientationChange={(event) => {
          logGraphLifecycle('ORIENTATION_CHANGE', { nativeOrientation: event.nativeEvent.orientation });
        }}
        onDismiss={() => {
          // A dismissal while the JS visible prop is still true is a UIKit
          // lifecycle violation, not an intentional Graph close.
          if (probeGraphOpen && !graphClosingRef.current) {
            console.warn('[GraphLifecycle][UNEXPECTED_UNMOUNT]', graphLifecycleSnapshot());
          }
          logGraphLifecycle('MODAL_DISMISS');
        }}
        onRequestClose={() => {
          logGraphLifecycle('REQUEST_CLOSE', { source: 'Modal.onRequestClose' });
          void closeProbeGraphView('Modal.onRequestClose');
        }}
      >
        {probeGraphOpen ? <GraphLifecycleBoundary snapshotRef={graphLifecycleSnapshotRef} /> : null}
        <StatusBar hidden={probeGraphOpen} animated />
        <SafeAreaProvider>
        <AndroidModalInsets>
        <View
          style={[styles.graphTransitionHost, { backgroundColor: appTheme.colors.background }]}
          onLayout={({ nativeEvent }) => {
            const { width, height } = nativeEvent.layout;
            graphVisualRootLayoutRef.current = `${Math.round(width)}x${Math.round(height)}`;
            if (probeGraphOpen) console.log('[GraphVisual][ROOT_LAYOUT]', graphVisualRootLayoutRef.current);
          }}
        >
        <Reanimated.View style={[styles.graphWorkspaceScreen, graphContentFadeStyle]}>
          {probeGraphOpen ? <GraphVisualBoundary name="ROOT" /> : null}
          <View style={styles.graphRotateViewport} onLayout={({ nativeEvent }) => {
            if (Platform.OS === 'android') {
              const { width, height } = nativeEvent.layout;
              setGraphViewport(previous => previous.width === width && previous.height === height ? previous : { width, height });
            }
          }}>
            <View
              style={[
                styles.graphRotateStage,
                {
                  width: graphStageWidth,
                  height: graphStageHeight,
                  transform: graphNeedsRotation ? [{ rotate: '90deg' }] : [],
                },
              ]}
              onLayout={({ nativeEvent }) => {
                const { width, height } = nativeEvent.layout;
                graphVisualContentLayoutRef.current = `${Math.round(width)}x${Math.round(height)}`;
                if (probeGraphOpen) console.log('[GraphVisual][CONTENT_LAYOUT]', graphVisualContentLayoutRef.current);
              }}
            >
          {probeGraphOpen ? <GraphVisualBoundary name="CONTENT" /> : null}
          <View style={[styles.graphWorkspaceHeader, { paddingLeft: graphNotchInset }] }>
            <TouchableOpacity
              style={styles.graphHamburgerButton}
              onPress={() => setProbeGraphDrawerOpen((prev) => !prev)}
              accessibilityLabel={t('access.openGraphMenu')}
            >
              <Text style={styles.graphHamburgerText}>☰</Text>
            </TouchableOpacity>

            <View style={styles.graphWorkspaceHeaderCopy}>
              <View style={[styles.graphSourceControlWrap, graphLampPickerOpen && styles.graphSourceControlWrapOpen]}>
                <View
                  style={[
                    styles.graphSourceToggle,
                    graphShowLamp && selectedLampNode && styles.graphSourceToggleActive,
                    !lampNodes.length && styles.graphSourceToggleDisabled,
                  ]}
                >
                  <TouchableOpacity
                    style={styles.graphSourceToggleCheck}
                    onPress={() => {
                      if (!canReadLampHistory) return;
                      setGraphFocusedPoint(null);
                      setGraphShowLamp((value) => !value);
                    }}
                    disabled={!canReadLampHistory}
                    accessibilityLabel={selectedLampNode ? t('access.toggleGraphData', { name: selectedLampName }) : t('access.noSelectedLamp')}
                  >
                    <View style={[styles.graphSourceToggleMark, graphShowLamp && selectedLampNode && styles.graphSourceToggleMarkActive]}>
                      {graphShowLamp && selectedLampNode ? <GraphCheckboxTick color={appTheme.colors.textStrong} size={12} /> : null}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.graphSourceSelect}
                    onPress={() => {
                      setGraphProbePickerOpen(false);
                      setGraphLampPickerOpen((open) => !open);
                    }}
                    disabled={!lampNodes.length}
                    accessibilityLabel={t('lamp.select')}
                  >
                    <View style={styles.graphSourceSelectCopy}>
                      <Text style={styles.graphSourceTypeText} numberOfLines={1}>{t('node.lamp')}</Text>
                      <Text style={styles.graphSourceToggleText} numberOfLines={1} ellipsizeMode="tail">
                        {selectedLampNode && lampNodes.some(node => node.id !== selectedLampNode.id && node.name === selectedLampNode.name)
                          ? graphDeviceLabel(selectedLampNode) : selectedLampNode?.name ?? t('lamp.noSelected')}
                      </Text>
                    </View>
                    <Text style={styles.graphSourceChevron}>{graphLampPickerOpen ? '⌃' : '⌄'}</Text>
                  </TouchableOpacity>
                </View>

                {graphLampPickerOpen ? (
                  <View style={styles.graphSourceDropdown}>
                    <ScrollView
                      style={styles.graphSourceDropdownScroll}
                      contentContainerStyle={styles.graphLampPickerList}
                      showsVerticalScrollIndicator={false}
                    >
                      {lampNodes.map((lamp) => {
                        const selected = lamp.id === selectedLampId;
                        return (
                          <TouchableOpacity
                            key={lamp.id}
                            style={[styles.graphLampPickerRow, selected && styles.graphLampPickerRowSelected]}
                            onPress={() => {
                              setSelectedLampId(lamp.id);
                              setGraphFocusedPoint(null);
                              setGraphLampPickerOpen(false);
                            }}

                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                          >
                            <View style={[styles.lampSelectorBulb, { backgroundColor: lamp.color || '#29a760' }]}>
                              <Text style={styles.lampSelectorBulbText}>💡</Text>
                            </View>
                            <Text style={styles.graphLampPickerName} numberOfLines={1} ellipsizeMode="tail">{lampNodes.some(node => node.id !== lamp.id && node.name === lamp.name) ? graphDeviceLabel(lamp) : lamp.name}</Text>
                            <Text style={[styles.lampSelectorCheck, selected && styles.lampSelectorCheckSelected]}>
                              {selected ? '✓' : '○'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
              </View>

              <View style={[styles.graphSourceControlWrap, graphProbePickerOpen && styles.graphSourceControlWrapOpen]}>
                <View
                  style={[
                    styles.graphSourceToggle,
                    graphShowProbe && selectedProbeGraphId && styles.graphSourceToggleActive,
                    !(selectableProbeNodes.length || portalHistoryProbeDevices.length) && styles.graphSourceToggleDisabled,
                  ]}
                >
                  <TouchableOpacity
                    style={styles.graphSourceToggleCheck}
                    onPress={() => {
                      if (!selectedProbeGraphId) return;
                      setGraphFocusedPoint(null);
                      setGraphShowProbe((value) => !value);
                    }}
                    disabled={!selectedProbeGraphId}
                    accessibilityLabel={selectedProbeGraphDisplayName ? t('access.toggleGraphData', { name: selectedProbeGraphDisplayName }) : t('access.noSelectedProbe')}
                  >
                    <View style={[styles.graphSourceToggleMark, graphShowProbe && selectedProbeGraphId && styles.graphSourceToggleMarkActive]}>
                      {graphShowProbe && selectedProbeGraphId ? <GraphCheckboxTick color={appTheme.colors.textStrong} size={12} /> : null}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.graphSourceSelect}
                    onPress={() => {
                      setGraphLampPickerOpen(false);
                      setGraphProbePickerOpen((open) => !open);
                    }}
                    disabled={!(selectableProbeNodes.length || portalHistoryProbeDevices.length)}
                    accessibilityLabel={t('graph.chooseProbe')}
                  >
                    <View style={styles.graphSourceSelectCopy}>
                      <Text style={styles.graphSourceTypeText} numberOfLines={1}>{t('node.probe')}</Text>
                      <Text style={styles.graphSourceToggleText} numberOfLines={1} ellipsizeMode="tail">
                        {selectedProbeNode && selectableProbeNodes.some(node => node.id !== selectedProbeNode.id && node.name === selectedProbeNode.name)
                          ? graphDeviceLabel(selectedProbeNode) : selectedProbeGraphDisplayName ?? '—'}
                      </Text>
                    </View>
                    <Text style={styles.graphSourceChevron}>{graphProbePickerOpen ? '⌃' : '⌄'}</Text>
                  </TouchableOpacity>
                </View>

                {graphProbePickerOpen ? (
                  <View style={[styles.graphSourceDropdown, styles.graphSourceDropdownRight]}>
                    <ScrollView
                      style={styles.graphSourceDropdownScroll}
                      contentContainerStyle={styles.graphLampPickerList}
                      showsVerticalScrollIndicator={false}
                    >
                      {portalHistoryProbeDevices.map((device) => {
                        const selected = device.id === selectedPortalProbe?.id;
                        return (
                          <TouchableOpacity
                            key={`portal-${device.id}`}
                            style={[styles.graphLampPickerRow, selected && styles.graphLampPickerRowSelected]}
                            onPress={() => {
                              setSelectedPortalProbeId(device.id);
                              setSelectedProbeSourceId(null);
                              setGraphFocusedPoint(null);
                              setGraphProbePickerOpen(false);
                            }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                          >
                            <View style={[styles.meshTileBadge, styles.portalSourceBadge]}>
                              <ConnectionsIcon size={14} color={appTheme.colors.textPrimary} />
                            </View>
                            <View style={styles.portalPickerCopy}>
                              <Text style={styles.graphLampPickerName} numberOfLines={1} ellipsizeMode="tail">{device.displayName}</Text>
                              <Text style={styles.portalPickerMeta} numberOfLines={1}>{isOwnedDevice(device) ? t('devices.ownedByYou') : t('devices.sharedBy', { name: device.owner.displayName })}</Text>
                            </View>
                            <Text style={[styles.lampSelectorCheck, selected && styles.lampSelectorCheckSelected]}>
                              {selected ? '✓' : '○'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      {selectableProbeNodes.map((node) => {
                        const selected = node.id === selectedProbeNode?.id && (!selectedPortalProbe || selectedPortalProbe.id === node.canonicalDeviceId);
                        return (
                          <TouchableOpacity
                            key={node.id}
                            style={[styles.graphLampPickerRow, selected && styles.graphLampPickerRowSelected]}
                            onPress={() => {
                              setSelectedPortalProbeId(null);
                              setSelectedProbeSourceId(node.id);
                              setMeshSelectedNodeId(node.id);
                              setGraphFocusedPoint(null);
                              setGraphProbePickerOpen(false);
                            }}

                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                          >
                            <View style={[styles.meshTileBadge, { backgroundColor: node.color }]}>
                              <Text style={styles.meshTileBadgeText}>{node.abbreviation}</Text>
                            </View>
                            <Text style={styles.graphLampPickerName} numberOfLines={1} ellipsizeMode="tail">{selectableProbeNodes.some(other => other.id !== node.id && other.name === node.name) ? graphDeviceLabel(node) : node.name}</Text>
                            <Text style={[styles.lampSelectorCheck, selected && styles.lampSelectorCheckSelected]}>
                              {selected ? '✓' : '○'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.graphWorkspaceHeaderActions}>
              <View style={styles.graphCloudSyncControl}>
                <View style={styles.graphCloudSyncCopy}>
                  <Text style={styles.graphHeaderButtonText} numberOfLines={1}>{t('settings.cloudSync')}</Text>
                  <Text style={styles.graphCloudSyncStatus} numberOfLines={1}>{cloudSyncStatusLabel}</Text>
                </View>
                <Switch value={cloudSyncEnabled} onValueChange={setCloudSyncEnabled} disabled={ARC_CLOUD_SYNC_VALIDATION_HOLD} />
              </View>

              {/* Deliberate dead space between Cloud Sync and Exit. Storage
                  belongs in Settings; this gap also reduces accidental taps on
                  the Cloud Sync switch when reaching for the close control. */}
              <View style={styles.graphExitSafetyGap} pointerEvents="none" />

              <TouchableOpacity
                style={styles.graphExitButton}
                onPress={() => void closeProbeGraphView('exit_button')}
                accessibilityLabel={t('common.close')}
              >
                <Text style={styles.graphExitButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.graphWorkspaceBody}>
            {probeGraphDrawerOpen ? (
              <View
                style={[
                  styles.graphDrawer,
                  { width: graphDrawerWidth },
                ]}
              >
              <ScrollView contentContainerStyle={styles.graphDrawerContent} showsVerticalScrollIndicator={false}>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('graph.dataWindow')}</Text>
                  <View style={styles.graphChipWrap}>
                    {(['15m', '1h', '6h', '24h'] as const).map((windowKey) => {
                      const active = probeGraphWindow === windowKey;
                      return (
                        <TouchableOpacity
                          key={windowKey}
                          style={[styles.nodeKindButton, active && styles.nodeKindButtonActive]}
                          onPress={() => setProbeGraphWindow(windowKey)}
                        >
                          <Text style={[styles.nodeKindButtonText, active && styles.nodeKindButtonTextActive]}>{windowKey}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('graph.series')}</Text>
                  {selectedLampNode ? (
                    <View style={styles.graphSourceSeriesSection}>
                      <Text style={styles.graphSourceSeriesTitle}>{t('graph.sourceLampShort', { name: selectedLampName })}</Text>
                      {lampGraphSignalGroups.map((group) => (
                        <View key={`lamp-${group.title}`} style={styles.graphSignalGroup}>
                          <Text style={styles.graphSignalGroupTitle}>{group.title}</Text>
                          {group.signals.map((signalKey) => {
                            const active = lampGraphVisibleSignals.includes(signalKey);
                            const meta = lampGraphSignalMeta[signalKey];
                            return (
                              <TouchableOpacity
                                key={signalKey}
                                style={styles.graphCheckboxRow}
                                onPress={() => toggleLampGraphVisibleSignal(signalKey)}
                              >
                                <View style={[styles.graphCheckbox, active && styles.graphCheckboxActive]}>
                                  {active ? <GraphCheckboxTick color={appTheme.colors.infoText} /> : null}
                                </View>
                                <View style={[styles.graphColorSwatch, { backgroundColor: meta.color }]} />
                                <Text style={styles.label}>{meta.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {selectedProbeGraphId && selectedProbeGraphDisplayName ? (
                    <View style={styles.graphSourceSeriesSection}>
                      <Text style={styles.graphSourceSeriesTitle}>{t('graph.sourceProbeShort', { name: selectedProbeGraphDisplayName })}</Text>
                      {graphSignalGroups.map((group) => (
                        <View key={`probe-${group.title}`} style={styles.graphSignalGroup}>
                          <Text style={styles.graphSignalGroupTitle}>{group.title}</Text>
                          {group.signals.map((signalKey) => {
                            const active = probeGraphVisibleSignals.includes(signalKey);
                            const meta = getProbeGraphSignalMeta(signalKey);
                            return (
                              <TouchableOpacity
                                key={signalKey}
                                style={styles.graphCheckboxRow}
                                onPress={() => toggleProbeGraphVisibleSignal(signalKey)}
                              >
                                <View style={[styles.graphCheckbox, active && styles.graphCheckboxActive]}>
                                  {active ? <GraphCheckboxTick color={appTheme.colors.infoText} /> : null}
                                </View>
                                <View style={[styles.graphColorSwatch, { backgroundColor: meta.color }]} />
                                <Text style={styles.label}>{graphSignalLabels[signalKey]}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {!selectedLampNode && !selectedProbeGraphId ? (
                    <Text style={styles.muted}>{t('graph.selectSource')}</Text>
                  ) : null}
                </View>

                {arcCloudError ? <Text style={styles.muted}>{arcCloudError}</Text> : null}
              </ScrollView>
              </View>
            ) : null}

            <View style={[styles.graphMainPane, { paddingLeft: graphNotchInset }] }>
              <View style={styles.graphMainContent}>
                {graphHasPoints ? (
                  <View style={styles.graphCard}>
                    <View
                      style={[
                        styles.graphCanvas,
                        Platform.OS === 'android' && { minHeight: 0 },
                        {
                          paddingLeft: graphAxisLeftGutter,
                          paddingRight: graphAxisRightGutter,
                        },
                      ]}
                    >
                      <View style={styles.graphGridLineTop} />
                      <View style={styles.graphGridLineMid} />
                      <View style={styles.graphGridLineBottom} />
                      {graphLeftYAxisSeries ? (
                        <View style={styles.graphYAxisLeft}>
                          <View style={styles.graphYAxisRuleLeft}>
                            <View style={[styles.graphYAxisTick, styles.graphYAxisTickLeft]} />
                            <View style={[styles.graphYAxisTick, styles.graphYAxisTickLeft]} />
                            <View style={[styles.graphYAxisTick, styles.graphYAxisTickLeft]} />
                          </View>
                          <Text style={[styles.graphYAxisValue, { color: graphLeftYAxisSeries.meta.color }] }>
                            {graphLeftYAxisSeries.maxValue.toFixed(graphLeftYAxisSeries.meta.decimals)} {graphLeftYAxisSeries.meta.unit}
                          </Text>
                          <Text style={[styles.graphYAxisLabel, { color: graphLeftYAxisSeries.meta.color }]} numberOfLines={2}>
                            {graphLeftYAxisSeries.meta.label}
                          </Text>
                          <Text style={[styles.graphYAxisValue, { color: graphLeftYAxisSeries.meta.color }] }>
                            {graphLeftYAxisSeries.minValue.toFixed(graphLeftYAxisSeries.meta.decimals)} {graphLeftYAxisSeries.meta.unit}
                          </Text>
                        </View>
                      ) : null}
                      {graphRightYAxisSeries.length ? (
                        <View style={styles.graphYAxisRightWrap}>
                          {graphRightYAxisSeries.map((series) => (
                            <View key={`axis-${series.signalKey}`} style={styles.graphYAxisRight}>
                              <View style={styles.graphYAxisRuleRight}>
                                <View style={[styles.graphYAxisTick, styles.graphYAxisTickRight]} />
                                <View style={[styles.graphYAxisTick, styles.graphYAxisTickRight]} />
                                <View style={[styles.graphYAxisTick, styles.graphYAxisTickRight]} />
                              </View>
                              <Text style={[styles.graphYAxisValue, { color: series.meta.color }] }>
                                {series.maxValue.toFixed(series.meta.decimals)} {series.meta.unit}
                              </Text>
                              <Text style={[styles.graphYAxisLabel, { color: series.meta.color }]} numberOfLines={2}>
                                {series.meta.label}
                              </Text>
                              <Text style={[styles.graphYAxisValue, { color: series.meta.color }] }>
                                {series.minValue.toFixed(series.meta.decimals)} {series.meta.unit}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      <View
                        style={[styles.graphPlotArea, Platform.OS === 'android'
                          ? { flex: 1, minHeight: 0 }
                          : { height: graphPlotHeight }]}
                        onLayout={({ nativeEvent }) => {
                          const { width: measuredWidth, height: measuredHeight } = nativeEvent.layout;
                          if (Number.isFinite(measuredWidth) && measuredWidth > 0) {
                            setGraphMeasuredPlotWidth(previous => Math.abs(previous - measuredWidth) > 0.5 ? measuredWidth : previous);
                          }
                          if (Platform.OS === 'android' && Number.isFinite(measuredHeight) && measuredHeight > 0) {
                            setGraphMeasuredPlotHeight(previous => Math.abs(previous - measuredHeight) > 0.5 ? measuredHeight : previous);
                          }
                        }}
                      >
                        <HistoryPlot<ArcGraphSignal>
                          width={graphPlotWidth}
                          height={graphPlotHeight}
                          series={graphSeries}
                          pointStyle={styles.graphPoint}
                          dotStyle={styles.graphPointDot}
                          onSelect={(series, point) => setGraphFocusedPoint({
                            signalKey: series.signalKey, label: series.meta.label,
                            value: point.value, unit: series.meta.unit, timeLabel: point.timeLabel,
                            xPx: point.xPx, yPx: point.yPx, color: series.meta.color,
                          })}
                        />
                        {graphFocusedPoint ? (
                          <View
                            style={[
                              styles.graphTapLabel,
                              {
                                left: Math.min(Math.max(graphFocusedPoint.xPx - 72, 4), graphPlotWidth - 148),
                                top: Math.max(graphFocusedPoint.yPx - 54, 4),
                                borderColor: graphFocusedPoint.color,
                              },
                            ]}
                          >
                            <Text style={[styles.graphTapLabelTitle, { color: graphFocusedPoint.color }]}>{graphFocusedPoint.label}</Text>
                            <Text style={styles.graphTapLabelText}>
                              {graphFocusedPoint.value.toFixed(getArcGraphSignalMeta(graphFocusedPoint.signalKey).decimals)} {graphFocusedPoint.unit} · {graphFocusedPoint.timeLabel}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={[styles.graphXAxisLabels, { width: graphPlotWidth }] }>
                        <Text style={[styles.graphAxisLabel, styles.graphAxisLabelStart]}>{graphXAxisTicks[0] ?? '--:--'}</Text>
                        <Text style={styles.graphAxisLabel}>{graphXAxisTicks[1] ?? '--:--'}</Text>
                        <Text style={[styles.graphAxisLabel, styles.graphAxisLabelEnd]}>{graphXAxisTicks[2] ?? '--:--'}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.graphEmptyCard}>
                    <Text style={styles.muted}>
                      {!activeGraphSignals.length
                        ? t('graph.enableSource')
                        : graphRejectedNoEdgeTimeCount > 0
                          ? t('graph.unplottable', { count: formatNumber(graphRejectedNoEdgeTimeCount) })
                        : t('graph.noPoints')}
                    </Text>
                  </View>
                )}

              </View>
            </View>

          </View>
            </View>
          </View>
        </Reanimated.View>
        </View>
        </AndroidModalInsets>
        </SafeAreaProvider>
      </Modal>

      <Modal
        visible={probePickerOpen}
        animationType="fade"
        transparent
        supportedOrientations={["portrait", "portrait-upside-down"]}
      >
        <View style={styles.meshModalBackdrop}>
          <View style={styles.meshModalCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>{t('graph.chooseProbe')}</Text>
              <TouchableOpacity style={styles.iconButton} onPress={() => setProbePickerOpen(false)}>
                <Text style={styles.iconButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.meshModalSubtitle}>{t('graph.chooseProbeDetail')}</Text>
            <ScrollView contentContainerStyle={styles.probePickerList}>
              {portalLatestProbeDevices.map((device) => {
                const active = device.id === selectedPortalProbe?.id;
                const lastSeenLabel = device.latestSampleAt
                  ? formatTime(new Date(device.latestSampleAt).getTime())
                  : t('probe.noTelemetryYet');
                return (
                  <TouchableOpacity
                    key={`portal-${device.id}`}
                    style={[styles.probePickerRow, active && styles.probePickerRowActive]}
                    onPress={() => {
                      setSelectedPortalProbeId(device.id);
                      setSelectedProbeSourceId(null);
                      setProbePickerOpen(false);
                      setActiveTabSafe('sensors');
                    }}
                  >
                    <View style={[styles.meshTileBadge, styles.portalSourceBadge]}>
                      <ConnectionsIcon size={15} color={appTheme.colors.textPrimary} />
                    </View>
                    <View style={styles.probePickerCopy}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.probePickerName} numberOfLines={1}>{device.displayName}</Text>
                        {active ? <Text style={styles.probePickerSelectedText}>{t('graph.selected')}</Text> : null}
                      </View>
                      <Text style={styles.muted}>
                        {isOwnedDevice(device) ? t('devices.ownedByYou') : t('devices.sharedBy', { name: device.owner.displayName })}
                        {' • '}{t('comms.lastSample', { time: lastSeenLabel })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {selectableProbeNodes.map((node) => {
                const active = !selectedPortalProbe && node.id === selectedProbeNode?.id;
                const nodeGateway = node.assignedGatewayId
                  ? meshNodes.find((meshNode) => meshNode.id === node.assignedGatewayId) ?? null
                  : null;
                const nodeLamp = node.assignedBridgeId ? meshNodes.find((meshNode) => meshNode.id === node.assignedBridgeId) ?? null : null;
                const statusLabel = formatProbeConnectionLabel(node, nodeGateway, nodeLamp);
                const lastSeenLabel = node.probeStatus?.updatedAt
                  ? formatTime(node.probeStatus.updatedAt)
                  : node.lastSeen
                    ? formatTime(node.lastSeen)
                    : t('probe.noTelemetryYet');
                const batteryLabel =
                  typeof node.probeStatus?.batteryPct === 'number'
                    ? `${Math.round(node.probeStatus.batteryPct)} %`
                    : '-- %';
                return (
                  <TouchableOpacity
                    key={node.id}
                    style={[styles.probePickerRow, active && styles.probePickerRowActive]}
                    onPress={() => selectProbeForDataView(node)}

                  >
                    <View style={[styles.meshTileBadge, { backgroundColor: node.color }]}>
                      <Text style={styles.meshTileBadgeText}>{node.abbreviation}</Text>
                    </View>
                    <View style={styles.probePickerCopy}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.probePickerName} numberOfLines={1}>{node.name}</Text>
                        {active ? <Text style={styles.probePickerSelectedText}>{t('graph.selected')}</Text> : null}
                      </View>
                      <Text style={styles.muted}>{statusLabel} • {t('comms.lastSample', { time: lastSeenLabel })} • {t('probe.battery')} {batteryLabel}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {!portalLatestProbeDevices.length && !selectableProbeNodes.length ? (
                <Text style={styles.muted}>{t('graph.noProbeSources')}</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>


      {meshEditNodeId && (
        <Modal visible transparent animationType="fade">
          <View style={styles.meshModalBackdrop}>
            <View style={[styles.meshModalCard, { maxHeight: '92%' }]}>
              <View style={styles.rowBetween}>
                <Text style={styles.modalTitle}>{t('commission.editNode')}</Text>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => {
                    setMeshEditNodeId(null);
                    setMeshEditError('');

                  }}
                >
                  <Text style={styles.iconButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
              <View style={styles.field}>
                <Text style={styles.label}>{t('commission.name')}</Text>
                <TextInput
                  style={styles.input}
                  value={meshEditName}
                  onChangeText={setMeshEditName}
                  placeholder="Living Room"
                  placeholderTextColor={appTheme.colors.placeholder}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t('commission.firmwareType')}</Text>
                <View style={styles.firmwareTypeBox}>
                  <Text style={styles.firmwareTypeValue}>
                    {getMeshNodeKindLabel(editingMeshNode?.nodeKind)}
                  </Text>
                </View>
              </View>
              {editingMeshNode && ((Platform.OS === 'android' &&
                  (editingMeshNode.nodeKind === 'lamp' || editingMeshNode.nodeKind === 'probe')) ||
                  (Platform.OS === 'ios' && editingMeshNode.nodeKind === 'lamp')) ? (
                <View style={styles.gatewaySetupBlock}>
                  <Text style={styles.label}>Claimed ARC device ID</Text>
                  <Text style={styles.muted}>Local BLE: {editingMeshNode.blePeripheralId ?? editingMeshNode.id}</Text>
                  {Platform.OS==='ios'?<Text style={styles.muted}>Hardware UID: {lampHardwareIdentity[editingMeshNode.id]?.hardwareUid ?? lampHardwareIdentity[editingMeshNode.id]?.state ?? 'pending'} · {iosHardwareResolution(editingMeshNode).state}</Text>:null}
                  <Text style={styles.muted}>
                    Select the already-claimed device corresponding to this physical node.
                    The UID must match the server-registered ARC product. Binding confirmation does not authorize firmware or change its operating mode.
                  </Text>
                  <TouchableOpacity
                    style={styles.gatewaySetupChip}
                    onPress={() => setOwnerLinkPickerOpen(open => !open)}
                    accessibilityRole="button"
                    accessibilityLabel="Choose claimed ARC device"
                    disabled={ownerLinkSaving}
                  >
                    <Text style={styles.firmwareTypeValue}>
                      {ownerLinkTargetId
                        ? `${ownerLinkCandidates.find(device => device.id === ownerLinkTargetId)?.displayName ?? 'Selected ARC device'} · ${ownerLinkTargetId}`
                        : 'Choose claimed ARC device  ⌄'}
                    </Text>
                  </TouchableOpacity>
                  {ownerLinkPickerOpen ? (
                    <ScrollView style={{ maxHeight: 190 }} nestedScrollEnabled>
                      {ownerLinkCandidates.map(device => (
                        <TouchableOpacity key={device.id} style={styles.gatewaySetupChip}
                          onPress={() => { setOwnerLinkTargetId(device.id); setOwnerLinkPickerOpen(false); }}>
                          <Text style={styles.firmwareTypeValue}>{device.displayName}</Text>
                          <Text style={styles.muted}>{device.id}</Text>
                        </TouchableOpacity>
                      ))}
                      {ownerLinkExistingTarget && Platform.OS!=='ios' ? (
                        <TouchableOpacity style={styles.gatewaySetupChip}
                          onPress={() => { setOwnerLinkTargetId(null); setOwnerLinkPickerOpen(false); }}>
                          <Text style={styles.muted}>Remove local association</Text>
                        </TouchableOpacity>
                      ) : null}
                      {!ownerLinkCandidates.length ? (
                        <Text style={styles.muted}>No available claimed devices. Sign in and refresh device ownership.</Text>
                      ) : null}
                    </ScrollView>
                  ) : null}
                  <Text style={styles.muted}>
                    {ownerLinkExistingTarget === ownerLinkTargetId && ownerLinkExistingTarget && canConnectLocalNode(editingMeshNode)
                      ? 'Associated — Connect enabled. The saved mapping will reconnect on the next launch.'
                      : 'Save the selection before using Connect.'}
                  </Text>
                </View>
              ) : null}
              {editingMeshNode?.nodeKind === 'gateway' || editingMeshNode?.nodeKind === 'lamp' ? (
                <View style={styles.gatewaySetupBlock}>
                  <View>
                    <Text style={styles.label}>{editingMeshNode.nodeKind === 'gateway' ? 'Gateway' : 'Lamp'} setup</Text>
                    <Text style={styles.muted}>
                      {t('commission.assignProbe', { bridge: editingMeshNode.nodeKind === 'gateway' ? t('node.gateway') : t('node.lamp') })}
                    </Text>
                  </View>
                  {editingBridgeAssignableNodes.length ? (
                    <View style={styles.gatewaySetupChoices}>
                      {editingBridgeAssignableNodes.map((node) => {
                        const active = editingMeshNode.nodeKind === 'gateway'
                          ? node.assignedGatewayId === editingMeshNode.id
                          : node.assignedBridgeId === editingMeshNode.id;
                        return (
                          <View key={`${editingMeshNode.id}-${node.id}`} style={styles.gatewaySetupNodeRow}>
                            <TouchableOpacity
                              style={[styles.gatewaySetupChip, active && styles.gatewaySetupChipActive]}
                              onPress={() => editingMeshNode.nodeKind === 'gateway'
                                ? assignNodeToGateway(node.id, active ? null : editingMeshNode.id)
                                : assignNodeToLamp(node.id, active ? null : editingMeshNode.id)}
                            >
                              <Text
                                style={[
                                  styles.gatewaySetupChipText,
                                  active && styles.gatewaySetupChipTextActive,
                                ]}
                              >
                                {node.name}
                              </Text>
                            </TouchableOpacity>
                            {node.nodeKind === 'probe' ? (
                              <TouchableOpacity
                                style={styles.gatewaySetupOpenButton}
                                onPress={() => openAssignedNodeFromGateway(node)}
                              >
                                <Text style={styles.gatewaySetupOpenText}>{t('commission.open')}</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.muted}>{t('commission.addProbe')}</Text>
                  )}
                </View>
              ) : null}
              <View style={styles.field}>
                <Text style={styles.label}>{t('commission.abbreviation')}</Text>
                <TextInput
                  style={styles.input}
                  value={meshEditAbbrev}
                  onChangeText={setMeshEditAbbrev}
                  placeholder="LR"
                  placeholderTextColor={appTheme.colors.placeholder}
                  maxLength={4}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{t('commission.tileColor')}</Text>
                <View style={styles.meshColorRow}>
                  {meshColorOptions.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.meshColorSwatch,
                        { backgroundColor: color },
                        color === meshEditColor && styles.meshColorSwatchActive,
                      ]}
                      onPress={() => setMeshEditColor(color)}
                    />
                  ))}
                </View>
              </View>
              </ScrollView>
              {meshEditError ? <Text style={styles.meshError}>{meshEditError}</Text> : null}
              <View style={styles.meshModalActions}>
                <TouchableOpacity
                  style={styles.buttonSecondary}
                  onPress={() => {
                    setMeshEditNodeId(null);
                    setMeshEditError('');

                  }}
                >
                  <Text style={styles.buttonTextLight}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.button} onPress={() => void handleSaveMeshEdit()} disabled={ownerLinkSaving}>
                  <Text style={styles.buttonText}>{ownerLinkSaving ? 'Saving...' : t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'ios' ? <ArcDeviceQrScanner
        visible={iosDeviceQrScannerOpen}
        onCancel={() => { iosDeviceQrStagedScanRef.current = null; setIosDeviceQrScannerOpen(false); }}
        onScanned={identity => {
          // Close UIKit's camera Modal completely before presenting the review Modal.
          iosDeviceQrStagedScanRef.current = identity;
          setIosDeviceQrScannerOpen(false);
        }}
        onDismissed={() => {
          const identity = iosDeviceQrStagedScanRef.current;
          iosDeviceQrStagedScanRef.current = null;
          if (identity) handleArcDeviceQrScan(identity);
        }}
      /> : null}
      {Platform.OS === 'ios' ? <ArcDeviceQrReview
        state={iosDeviceQrReview}
        onDismiss={closeArcDeviceQrReview}
        onChoose={chooseArcDeviceForQr}
        onLocal={openLocalAfterQr}
        onOpenRegistered={device => {
          closeArcDeviceQrReview();
          setConnectionsSection('devices');
          setActiveTabSafe('comms');
          openPortalDevice(device);
        }}
      /> : null}
      <HardwareAssociationModal state={mandatoryHardwareAssociation}
        onMyDevices={()=>{if(mandatoryHardwareAssociation)hardwareOnboarding.cancel(mandatoryHardwareAssociation.nodeId);setConnectionsSection('devices');setActiveTabSafe('comms');}}
        onSelect={id=>{if(mandatoryHardwareAssociation)void hardwareOnboarding.select(mandatoryHardwareAssociation.nodeId,id).catch(error=>setMeshStatus(String(error)));}}
        onRefresh={()=>{if(mandatoryHardwareAssociation?.hardwareUid){hardwareBackend.refreshNext(mandatoryHardwareAssociation.hardwareUid);void hardwareOnboarding.retry(mandatoryHardwareAssociation.nodeId);}else if(mandatoryHardwareAssociation){hardwareOnboarding.cancel(mandatoryHardwareAssociation.nodeId);void mesh.disconnectNode(mandatoryHardwareAssociation.nodeId);}}}
        onCancel={()=>{if(mandatoryHardwareAssociation){hardwareOnboarding.cancel(mandatoryHardwareAssociation.nodeId);void mesh.disconnectNode(mandatoryHardwareAssociation.nodeId);}}} />
      {Platform.OS === 'ios' && timePickerVisible && activeTimeField && (
        <Modal transparent animationType="fade">
          <View style={styles.pickerBackdrop}>
            <View style={styles.pickerCard}>
              <Text style={styles.cardTitle}>{t('time.select')}</Text>
              <DateTimePicker
                value={pickerDate}
                mode="time"
                display="spinner"
                onChange={(_, selectedDate) => {
                  if (selectedDate) setPickerDate(selectedDate);
                }}
              />
              <View style={styles.pickerActions}>
                <TouchableOpacity
                  style={styles.buttonSecondary}
                  onPress={() => {
                    setTimePickerVisible(false);
                    setActiveTimeField(null);
                  }}
                >
                  <Text style={styles.buttonTextLight}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => {
                    setTimeForField(activeTimeField, pickerDate);
                    setTimePickerVisible(false);
                    setActiveTimeField(null);
                  }}
                >
                  <Text style={styles.buttonText}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
    </AppThemeProvider>
  );
}

function AndroidModalInsets({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  // Android Modal (navigationBarTranslucent=false) is already measured above
  // the system navigation bar. Applying its bottom safe inset again left an
  // empty strip and squeezed the DATA chart in landscape.
  return <View style={{ flex: 1, ...(Platform.OS === 'android' ? { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right } : {}) }}>{children}</View>;
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  commsScreen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 4,
    gap: 8,
  },
  commsTitle: {
    paddingTop: 0,
  },
  commsSubtitle: {
    paddingTop: 2,
  },
  connectionsScreen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  connectionsHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    gap: 12,
  },
  connectionsTabs: {
    flexDirection: 'row',
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  connectionsTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  connectionsTabActive: {
    borderBottomColor: theme.colors.accent,
  },
  connectionsTabText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  connectionsTabTextActive: {
    color: theme.colors.textPrimary,
  },
  connectionsContent: {
    flex: 1,
  },
  connectionsBody: {
    flex: 1,
  },
  connectionsScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 14,
  },
  connectionsStateCard: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalToolbar: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  portalToolbarCopy: {
    flex: 1,
    gap: 4,
  },
  portalRefreshButton: {
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  portalSection: {
    gap: 8,
  },
  portalSectionTitle: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  portalSharedIndicator: {
    alignSelf: 'flex-start',
    marginLeft: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalSharedIndicatorText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  portalFriendList: {
    gap: 8,
  },
  portalFriendCard: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderSubtle,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalFriendAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSelected,
  },
  portalFriendAvatarText: {
    color: theme.colors.accent,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  portalFriendAvatarImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  portalFriendCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  portalFriendName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  portalFriendMeta: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  portalFriendChevron: {
    color: theme.colors.textSoft,
    fontSize: 24,
    fontWeight: '300',
    marginLeft: 2,
  },
  portalListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalListRowMain: {
    flex: 1,
    gap: 4,
  },
  portalListTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  portalListTitle: {
    flexShrink: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  portalDeviceType: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  portalMeta: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  portalChevron: {
    color: theme.colors.textSecondary,
    fontSize: 24,
    fontWeight: '300',
  },
  portalPermissionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 2,
  },
  portalPermissionBadge: {
    color: theme.colors.infoText,
    backgroundColor: theme.colors.surfaceInfo,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: '700',
  },
  portalPanel: {
    gap: 10,
    padding: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalPanelTitle: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '800',
  },
  portalDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  portalDetailHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  portalDetailTitle: {
    color: theme.colors.textStrong,
    fontSize: 18,
    fontWeight: '800',
  },
  portalBackButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalBackButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    lineHeight: 30,
  },
  portalStatusGrid: {
    gap: 8,
  },
  portalStatusCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  portalStatusLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
  },
  portalStatusValue: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  portalActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  portalInlineForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  portalPeoplePickerSlot: {
    flex: 1,
    minWidth: 0,
  },
  portalConnectButton: {
    flexShrink: 0,
    marginRight: 4,
  },
  portalInput: {
    flex: 1,
    minHeight: 40,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  portalClaimInput: {
    minWidth: 150,
    fontVariant: ['tabular-nums'],
  },
  portalConnectionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  portalPersonChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  portalPersonChipActive: {
    borderColor: theme.colors.info,
    backgroundColor: theme.colors.surfaceInfo,
  },
  portalPersonChipText: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  portalPersonChipTextActive: {
    color: theme.colors.infoText,
  },
  portalPresetButton: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 7,
    backgroundColor: theme.colors.secondaryButton,
  },
  portalPresetText: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  portalSwitchRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  portalSwitchLabel: {
    color: theme.colors.textPrimary,
    fontSize: 12,
  },
  portalGrantList: {
    gap: 7,
  },
  portalGrantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  portalGrantCopy: {
    flex: 1,
    gap: 2,
  },
  portalGrantTitle: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  portalCompactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  portalTextAction: {
    color: theme.colors.infoText,
    fontSize: 11,
    fontWeight: '800',
  },
  portalDangerAction: {
    color: theme.colors.powerOff,
    fontSize: 11,
    fontWeight: '800',
  },
  portalWarningText: {
    color: theme.colors.powerOff,
    fontSize: 11,
  },
  portalSuccessText: {
    color: theme.colors.infoText,
    fontSize: 11,
  },
  portalSourceBadge: {
    backgroundColor: theme.colors.surfaceInfo,
    borderWidth: 1,
    borderColor: theme.colors.info,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalPickerCopy: {
    flex: 1,
    minWidth: 0,
  },
  portalPickerMeta: {
    color: theme.colors.textSecondary,
    fontSize: 9,
  },
  portalChatShell: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  portalChatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  portalChatMenuButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  portalChatMenuButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '700',
  },
  portalMessageList: {
    flex: 1,
  },
  portalMessageListContent: {
    paddingVertical: 12,
    gap: 9,
  },
  portalMessageRow: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    minWidth: '45%',
    padding: 10,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    gap: 4,
  },
  portalMessageRowOwn: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.surfaceInfo,
  },
  portalMessageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  portalMessageSender: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  portalMessageTime: {
    color: theme.colors.textSecondary,
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  portalMessageBody: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    lineHeight: 17,
  },
  portalWaitingText: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    paddingBottom: 6,
  },
  portalComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  portalComposerInput: {
    flex: 1,
    maxHeight: 100,
    minHeight: 40,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  portalSendButton: {
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 9,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalSendButtonText: {
    color: theme.colors.background,
    fontSize: 11,
    fontWeight: '800',
  },
  portalProjectScreen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  portalProjectTopBar: {
    minHeight: 52,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  portalProjectTopButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalProjectTopIcon: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  portalProjectTopTitle: {
    flex: 1,
    paddingHorizontal: 8,
    color: theme.colors.textStrong,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  portalProjectInlineError: {
    color: theme.colors.powerOff,
    fontSize: 11,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  portalProjectFeed: {
    flex: 1,
  },
  portalProjectFeedContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
  },
  portalProjectPost: {
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalProjectPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  portalProjectAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.surfaceInfo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalProjectAvatarText: {
    color: theme.colors.infoText,
    fontSize: 11,
    fontWeight: '800',
  },
  portalProjectPostAuthor: {
    color: theme.colors.textStrong,
    fontSize: 12,
    fontWeight: '800',
  },
  portalProjectPostBodyWrap: {
    marginLeft: 39,
    paddingRight: 4,
    gap: 4,
  },
  portalProjectPostMore: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  portalProjectPostBody: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  portalProjectPostFooter: {
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  portalProjectEmptyFeed: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  portalProjectComposer: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginHorizontal: 10,
    marginTop: 6,
    marginBottom: 8,
    padding: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
  },
  portalProjectComposerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 104,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13,
  },
  portalProjectSendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalProjectSendButtonDisabled: {
    opacity: 0.35,
  },
  portalProjectSendText: {
    color: theme.colors.background,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  portalProjectSubviewHeader: {
    minHeight: 54,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  portalProjectSubviewSideSlot: {
    width: 48,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalProjectSubviewTitle: {
    flex: 1,
    color: theme.colors.textStrong,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  portalProjectSettingsContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 28,
  },
  portalProjectSettingsIntro: {
    gap: 4,
    paddingHorizontal: 3,
    paddingBottom: 12,
  },
  portalProjectSettingsProject: {
    color: theme.colors.textStrong,
    fontSize: 14,
    fontWeight: '800',
  },
  portalProjectToolSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  portalProjectToolHeader: {
    minHeight: 60,
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  portalProjectToolTitle: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '800',
  },
  portalProjectToolChevron: {
    color: theme.colors.textSecondary,
    fontSize: 20,
  },
  portalProjectToolContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  portalProjectToolCard: {
    gap: 8,
    padding: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalProjectToolLabel: {
    color: theme.colors.textStrong,
    fontSize: 12,
    fontWeight: '800',
  },
  portalProjectCompactRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 9,
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalProjectShareBlock: {
    gap: 8,
    paddingTop: 4,
  },
  portalProjectMemberAdd: {
    gap: 7,
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  portalProjectRoleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  portalProjectRoleChip: {
    flex: 1,
    minHeight: 38,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalProjectRoleChipActive: {
    borderColor: theme.colors.info,
    backgroundColor: theme.colors.surfaceInfo,
  },
  portalProjectRoleChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  portalProjectRoleChipTextActive: {
    color: theme.colors.infoText,
  },
  portalProjectMemberButtonDisabled: {
    opacity: 0.4,
  },
  portalProjectAddTaskButton: {
    width: 40,
    height: 40,
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalProjectAddTaskText: {
    color: theme.colors.textStrong,
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 30,
  },
  portalProjectTaskFormContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
    gap: 16,
  },
  portalProjectTaskField: {
    gap: 7,
  },
  portalProjectTaskLabel: {
    color: theme.colors.textStrong,
    fontSize: 12,
    fontWeight: '800',
  },
  portalProjectTaskInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  portalProjectTaskTextArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  portalProjectTaskDateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  portalProjectTaskDateButton: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalProjectTaskDateValue: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  portalProjectTaskOpenCard: {
    gap: 4,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalProjectTaskOpenTitle: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '800',
  },
  portalProjectTaskDetailContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 14,
  },
  portalProjectTaskDetailTitle: {
    color: theme.colors.textStrong,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  portalProjectTaskStatus: {
    color: theme.colors.infoText,
    fontSize: 12,
    fontWeight: '800',
  },
  portalProjectTaskDetailBody: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
  },
  portalProjectTaskMetaCard: {
    gap: 5,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalProjectTaskActionStack: {
    gap: 10,
    paddingTop: 4,
  },
  portalProjectCalendarContext: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: 'center',
  },
  portalProjectCalendarContextText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  portalProjectTaskModeRow: {
    flexDirection: 'row',
    gap: 7,
  },
  portalProjectTaskModeButton: {
    flex: 1,
    minHeight: 38,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalProjectTaskModeButtonActive: {
    borderColor: theme.colors.info,
    backgroundColor: theme.colors.surfaceInfo,
  },
  portalProjectTaskModeText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  portalProjectTaskModeTextActive: {
    color: theme.colors.infoText,
  },
  portalProjectWeekPicker: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalProjectWeekStep: {
    width: 48,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalProjectWeekStepText: {
    color: theme.colors.textStrong,
    fontSize: 28,
    fontWeight: '400',
  },
  portalProjectWeekValue: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  portalProjectWeekTitle: {
    color: theme.colors.textStrong,
    fontSize: 16,
    fontWeight: '800',
  },
  portalProjectPickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay,
  },
  portalProjectPickerDismiss: {
    flex: 1,
  },
  portalProjectPickerCard: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  portalProjectPickerDone: {
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: theme.colors.secondaryButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalProjectCalendarContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 30,
    gap: 10,
  },
  portalProjectCalendarTitle: {
    color: theme.colors.textStrong,
    fontSize: 18,
    fontWeight: '800',
  },
  portalProjectAgendaRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 11,
    backgroundColor: theme.colors.surfaceAlt,
  },
  portalProjectAgendaDate: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalProjectAgendaDay: {
    color: theme.colors.textStrong,
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  portalProjectAgendaMonth: {
    color: theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  homeContainer: {
    flex: 1,
    padding: 20,
    gap: 16,
    justifyContent: 'space-between',
  },
  homeTop: {
    gap: 16,
  },
  homeBottom: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 28,
    transform: [{ translateY: -32 }],
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  futureMenuSlot: {
    width: 44,
    height: 44,
  },
  probeLink: {
    minWidth: 72,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  probeLinkText: {
    color: theme.colors.textStrong,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  dataLink: {
    minWidth: 54,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  dataLinkText: {
    color: theme.colors.textStrong,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  logo: {
    fontSize: 27,
    fontWeight: '700',
    color: theme.colors.accent,
    paddingLeft: 17,
  },
  iconButton: {
    backgroundColor: theme.colors.secondaryButton,
    borderRadius: 14,
    padding: 8,
  },
  homeIconButton: {
    backgroundColor: 'transparent',
    borderRadius: 0,
  },
  iconButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
  },
  lampSelectorCard: {
    width: '92%',
    maxWidth: 460,
    maxHeight: '90%',
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderColor: theme.colors.border,
    borderWidth: 1,
    padding: 18,
    gap: 16,
  },
  lampSelectorList: {
    flexGrow: 0,
  },
  lampSelectorListContent: {
    gap: 10,
  },
  manualControlCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.borderStrong,
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    gap: 12,
  },
  manualSliderRow: {
    gap: 5,
  },
  manualSliderLabel: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  manualSliderValue: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  phaseGradient: {
    borderRadius: 9,
    height: 28,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  phaseGradientEnd: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    opacity: 0.9,
  },
  manualTouchTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.mode === 'light' ? 'rgba(39,51,43,0.15)' : 'rgba(15,23,42,0.60)',
    justifyContent: 'center',
    overflow: 'visible',
  },
  manualTouchFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 5,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  manualGradientStop: {
    flex: 1,
    height: '100%',
  },
  manualTouchThumb: {
    position: 'absolute',
    marginLeft: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: theme.colors.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  manualScreenContent: {
    gap: 16,
    paddingBottom: 36,
  },
  manualLampSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  manualLampSummaryCopy: {
    flex: 1,
    gap: 2,
  },
  manualLampSummaryName: {
    color: theme.colors.textStrong,
    fontSize: 16,
    fontWeight: '700',
  },
  manualLimitPill: {
    color: '#9a3412',
    backgroundColor: '#fed7aa',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: '800',
  },
  manualControlGroup: {
    gap: 0,
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  manualGroupHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 2,
  },
  manualGroupTitle: {
    color: theme.colors.textStrong,
    fontSize: 17,
    fontWeight: '700',
  },
  manualGroupHint: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  manualControlRow: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  manualControlButtonRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  manualControlTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  manualControlDetail: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  manualValueStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manualLargeValue: {
    minWidth: 42,
    color: theme.colors.textStrong,
    fontSize: 19,
    lineHeight: 26,
    textAlign: 'center',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  manualUnit: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  manualStepButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualStepButtonText: {
    color: theme.colors.accent,
    fontSize: 21,
    lineHeight: 24,
    fontWeight: '500',
  },
  manualGroupDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginLeft: 16,
  },
  schedulePhaseTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  schedulePhaseButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  schedulePhaseButtonActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  schedulePhaseButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  schedulePhaseButtonTextActive: {
    color: theme.colors.accentInk,
  },
  manualApplyButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualApplyButtonText: {
    color: theme.colors.accentInk,
    fontSize: 16,
    fontWeight: '800',
  },
  manualDisableButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    borderColor: theme.colors.border,
    borderWidth: 1,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualDisableButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  manualDivider: {
    height: 1,
    backgroundColor: theme.colors.borderStrong,
    marginVertical: 2,
  },
  lampSelectorRow: {
    minHeight: 68,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lampSelectorRowSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surfaceSelected,
  },
  lampSelectorBulb: {
    width: 40,
    height: 30,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lampSelectorBulbText: {
    fontSize: 19,
  },
  lampSelectorCopy: {
    flex: 1,
    gap: 4,
  },
  lampSelectorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lampSelectorName: {
    flexShrink: 1,
    color: theme.colors.textStrong,
    fontSize: 15,
    fontWeight: '700',
  },
  lampSelectorMeta: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  lampSelectorWarning: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '800',
  },
  lampSelectorCheck: {
    color: theme.colors.placeholder,
    fontSize: 19,
    fontWeight: '700',
  },
  lampSelectorCheckSelected: {
    color: theme.colors.accent,
  },
  lampSelectorEmpty: {
    paddingVertical: 22,
    gap: 8,
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    paddingLeft: 17,
    paddingTop: 17,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    paddingLeft: 17,
    paddingTop: 5,
  },
  screenHeader: {
    gap: 4,
  },
  screenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  screenHeaderCopy: {
    flex: 1,
  },
  probeSelectorHeader: {
    flex: 1,
  },
  probeSelectorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  probeSelectorChevron: {
    color: theme.colors.textSecondary,
    fontSize: 18,
    fontWeight: '700',
    paddingTop: 16,
  },
  headerActionCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 18,
    paddingRight: 6,
  },
  headerActionButton: {
    backgroundColor: theme.colors.secondaryButton,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 38,
  },
  probeHeaderIconButton: {
    backgroundColor: 'transparent',
    borderRadius: 0,
  },
  headerActionButtonDisabled: {
    opacity: 0.45,
  },
  headerActionText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
  },
  homeIcon: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '500',
  },
  card: {
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  scheduleScreenContent: {
    gap: 10,
    paddingBottom: 84,
  },
  scheduleHeaderBlock: {
    gap: 8,
  },
  scheduleVersionDataRow: {
    minHeight: 42,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  scheduleDataLink: {
    minWidth: 54,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingLeft: 8,
  },
  scheduleVersionLine: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.15,
  },
  scheduleReadOnlyNotice: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 10,
    paddingBottom: 2,
  },
  scheduleReadOnlyMuted: {
    opacity: 0.58,
  },
  scheduleToggleCard: {
    minHeight: 58,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  scheduleToggleCopy: {
    flex: 1,
    gap: 1,
  },
  scheduleToggleTitle: {
    color: theme.colors.textStrong,
    fontSize: 14,
    fontWeight: '700',
  },
  scheduleToggleHint: {
    color: theme.colors.textSoft,
    fontSize: 10.5,
    lineHeight: 14,
  },
  scheduleSectionCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  scheduleSectionHeader: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduleSectionTitle: {
    color: theme.colors.textStrong,
    fontSize: 17,
    fontWeight: '700',
  },
  scheduleSectionChevron: {
    color: theme.colors.textSecondary,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '500',
  },
  scheduleSectionBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  scheduleOutputBody: {
    paddingBottom: 14,
  },
  scheduleFieldGridRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  scheduleFieldColumn: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
  },
  scheduleCompactLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginBottom: 5,
  },
  scheduleOutputControlRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 9,
  },
  scheduleApplyButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  scheduleOutputApplyButton: {
    marginHorizontal: 16,
    marginTop: 20,
  },
  scheduleApplyButtonText: {
    color: theme.colors.accentInk,
    fontSize: 14,
    fontWeight: '800',
  },
  status: {
    fontSize: 12,
    color: theme.colors.textSoft,
  },
  meshStatusRow: {
    paddingLeft: 17,
    minHeight: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lampStatusHeader: {
    paddingHorizontal: 4,
  },
  field: {
    gap: 6,
  },
  label: {
    color: theme.colors.textSoft,
    fontSize: 13,
  },
  value: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  muted: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  input: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8,
    padding: 10,
    color: theme.colors.textStrong,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  multilineInput: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  inputButton: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8,
    padding: 10,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  inputText: {
    color: theme.colors.textStrong,
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  probeLiveContent: {
    paddingBottom: 18,
    gap: 12,
  },
  probeLiveCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  probeLiveControlCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  probeLiveStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  probeLiveSampleMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  probeLiveMetaCopyLeft: {
    alignItems: 'flex-start',
    gap: 1,
  },
  probeLiveMetaCopy: {
    alignItems: 'flex-end',
    minWidth: 72,
    gap: 1,
  },
  probeLiveMetaStrong: {
    color: theme.colors.textStrong,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  probeLiveMeta: {
    color: theme.colors.textSecondary,
    fontSize: 10,
  },
  probeLiveMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  probeLiveMetricCell: {
    width: '48%',
    minHeight: 66,
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  probeLiveMetricValue: {
    color: theme.colors.textStrong,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  probeLiveMetricLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  probeLiveSoilCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 13,
    padding: 12,
    gap: 9,
  },
  probeLiveSoilTitle: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  probeLiveSoilGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  probeLiveSoilCell: {
    flex: 1,
  },
  probeLiveSoilValue: {
    color: theme.colors.textStrong,
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sensorMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sensorNotice: {
    color: theme.colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  sensorMetricGroupRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  sensorMetricGroupLabel: {
    color: theme.colors.textStrong,
    fontSize: 14,
    fontWeight: '700',
    width: '100%',
  },
  statCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    width: '48%',
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  sensorMetricCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    width: '48%',
    minHeight: 78,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  sensorMetricGroupCard: {
    flex: 1,
    width: undefined,
  },
  probeLoggerSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  probeProofRow: {
    flexDirection: 'row',
    gap: 12,
  },
  probeProofCard: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    minHeight: 78,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  appModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  appModeChip: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  appModeChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  appModeChipText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  appModeChipTextActive: {
    color: theme.colors.accentInk,
  },
  statValue: {
    color: theme.colors.textStrong,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 6,
  },
  deviceList: {
    gap: 8,
  },
  commsFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 54,
    paddingTop: 2,
    paddingBottom: 2,
  },
  meshTileList: {
    paddingBottom: 6,
    gap: 8,
  },
  meshList: {
    flex: 1,
  },
  meshTileRowWrap: {
    gap: 10,
    justifyContent: 'space-between',
  },
  meshTile: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    borderColor: theme.colors.border,
    borderWidth: 1,
    padding: 10,
    flex: 1,
    height: Platform.OS === 'ios' ? iosLocalNodeGeometry.tileHeight : 180,
    ...(Platform.OS === 'ios' ? {} : { overflow: 'hidden' as const }),
  },
  meshTileTwoColumn: {
    // Keep the last tile the same width as tiles in a complete two-column row.
    maxWidth: '49%',
  },
  meshTileSelected: {
    borderColor: theme.colors.info,
  },
  meshTileHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    ...(Platform.OS === 'ios' ? { minHeight: iosLocalNodeGeometry.headerMinHeight } : { height: 78, flexShrink: 0 }),
  },
  meshTileBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meshTileBadgeText: {
    color: theme.colors.background,
    fontWeight: '700',
    fontSize: 12,
  },
  meshTileTitleWrap: {
    flex: 1,
    gap: 2,
    ...(Platform.OS === 'ios' ? { minHeight: iosLocalNodeGeometry.headerMinHeight } : { minWidth: 0, height: 78, overflow: 'hidden' as const }),
  },
  meshTileGear: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meshTileGearText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  meshTileTitle: {
    color: theme.colors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  meshTileSubtitle: {
    color: '#f59e0b',
    fontSize: 11,
  },
  meshTileSubtitleProbe: {
    color: theme.colors.info,
  },
  meshTileSubtitleGateway: {
    color: theme.colors.powerOn,
  },
  meshTileBody: {
    flex: 1,
    ...(Platform.OS === 'ios' ? {} : { minHeight: 0 }),
    marginTop: 4,
    justifyContent: 'space-between',
  },
  meshTileLiveLine: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  meshTileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  meshTileActionSlot: {
    height: Platform.OS === 'ios' ? iosLocalNodeGeometry.actionHeight : 44,
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  meshTileAction: {
    width: 112,
    height: Platform.OS === 'ios' ? iosLocalNodeGeometry.actionHeight : 44,
    alignSelf: 'flex-start',
    paddingVertical: 0,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meshTileClaimAction: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.info,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  meshTileClaimText: {
    color: theme.colors.accentInk,
    fontSize: 12,
    fontWeight: '700',
  },
  meshTileClaimedText: {
    marginTop: 8,
    color: theme.colors.powerOn,
    fontSize: 12,
    fontWeight: '700',
  },
  meshTileLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
  },
  meshTileValue: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  meshTileStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    position: 'absolute',
    right: 10,
    bottom: 10,
  },
  meshTileStatusDotOn: {
    backgroundColor: theme.colors.powerOn,
  },
  meshTileStatusDotOff: {
    backgroundColor: theme.colors.powerOff,
  },
  arcRoutePanel: {
    backgroundColor: theme.colors.surfaceRoute,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  arcRouteBadge: {
    color: theme.colors.infoText,
    fontSize: 12,
    fontWeight: '700',
  },
  arcRoleScroll: {
    maxHeight: 116,
  },
  arcRoleList: {
    gap: 8,
    paddingBottom: 2,
  },
  arcRoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 34,
  },
  arcRoleRowFocused: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 6,
    marginHorizontal: -6,
  },
  arcRoleTextWrap: {
    flex: 1,
  },
  arcRoleName: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  arcRoleMeta: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  arcRoleState: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '700',
  },
  arcRoleStateConnected: {
    color: theme.colors.powerOn,
  },
  meshLogPanel: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 4,
    marginBottom: 2,
  },
  meshLogPanelCompact: {
    height: 36,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meshLogPanelExpanded: {
    minHeight: 112,
    maxHeight: 126,
    padding: 10,
  },
  meshLogToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  meshLogScroll: {
    flexGrow: 0,
  },
  meshLogContent: {
    gap: 2,
  },
  meshLogLine: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  meshLogChevron: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 16,
  },
  deviceRow: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8,
    padding: 10,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  deviceRowSelected: {
    borderColor: theme.colors.info,
  },
  deviceName: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  deviceId: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  actionButton: {
    marginTop: 22,
  },
  buttonSecondary: {
    backgroundColor: theme.colors.secondaryButton,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: theme.colors.background,
    fontWeight: '600',
  },
  buttonTextLight: {
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  cornerNav: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: -8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  persistentFooter: {
    height: 40,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  persistentFooterComms: {
    height: 62,
    paddingVertical: 9,
  },
  footerCommsActions: {
    flex: 1,
    minWidth: 0,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footerCommsButton: {
    width: 96,
    height: 44,
    flexShrink: 1,
    paddingVertical: 0,
    paddingHorizontal: 4,
    backgroundColor: '#3979d4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCommsAuxButton: {
    width: 54,
  },
  footerScanButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
  },
  footerBackButton: {
    width: 40,
    height: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerButton: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerIcon: {
    color: theme.colors.textPrimary,
    fontSize: 18,
  },
  cornerIconActive: {
    color: theme.colors.accent,
  },
  probeIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  probeIconStem: {
    width: 3,
    height: 13,
    borderRadius: 2,
    backgroundColor: theme.colors.textPrimary,
  },
  probeIconHead: {
    position: 'absolute',
    top: 3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: theme.colors.info,
    backgroundColor: theme.colors.surfaceAlt,
  },
  probeIconTip: {
    width: 7,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
    marginTop: 1,
  },
  bleIcon: {
    tintColor: undefined,
  },
  bleIconConnected: {
    tintColor: undefined,
  },
  bleIconDisconnected: {
    opacity: 0.6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  dotConnected: {
    backgroundColor: theme.colors.powerOn,
  },
  dotDisconnected: {
    backgroundColor: theme.colors.powerOff,
  },
  dotWarning: {
    backgroundColor: '#eab308',
  },
  lampHealthText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  lampHealthWarning: {
    color: '#a16207',
  },
  lampHealthError: {
    color: theme.colors.powerOff,
  },
  lampHealthBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  lampHealthBannerWarning: {
    backgroundColor: '#fef9c3',
    borderColor: '#eab308',
  },
  lampHealthBannerError: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  lampHealthBannerText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  lampHealthBannerTime: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  lampHealthLogRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 5,
  },
  lampHealthLogActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    maxHeight: '85%',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    padding: 20,
  },
  pickerCard: {
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  pickerActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  modalTitle: {
    color: theme.colors.textStrong,
    fontSize: 18,
    fontWeight: '700',
  },
  meshModalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    padding: 20,
  },
  meshModalCard: {
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  meshModalSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  probePickerList: {
    gap: 10,
    paddingTop: 4,
    paddingBottom: 4,
  },
  probePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
  },
  probePickerRowActive: {
    borderColor: theme.colors.info,
    backgroundColor: theme.colors.surfaceInfo,
  },
  probePickerCopy: {
    flex: 1,
    gap: 4,
  },
  probePickerName: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  probePickerSelectedText: {
    color: theme.colors.infoText,
    fontSize: 11,
    fontWeight: '700',
  },
  meshCapabilitiesContent: {
    gap: 10,
    paddingTop: 4,
  },
  meshCapsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  meshCapsLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  meshCapsValue: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    textAlign: 'right',
    flex: 1,
  },
  meshProgressList: {
    marginTop: 8,
    gap: 6,
  },
  meshProgressLine: {
    color: theme.colors.textSoft,
    fontSize: 11,
  },
  meshModalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  meshModalActionsRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  meshConfirmText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    flex: 1,
  },
  meshColorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  meshColorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  meshColorSwatchActive: {
    borderColor: theme.colors.textStrong,
  },
  meshError: {
    color: theme.colors.pending,
    fontSize: 12,
  },
  firmwareTypeBox: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  firmwareTypeValue: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  gatewaySetupBlock: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    padding: 12,
    gap: 10,
  },
  gatewaySetupChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gatewaySetupNodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gatewaySetupChip: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  gatewaySetupChipActive: {
    backgroundColor: theme.colors.surfaceInfo,
    borderColor: theme.colors.powerOn,
  },
  gatewaySetupChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  gatewaySetupChipTextActive: {
    color: theme.colors.textPrimary,
  },
  gatewaySetupOpenButton: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  gatewaySetupOpenText: {
    color: theme.colors.info,
    fontSize: 12,
    fontWeight: '700',
  },
  nodeKindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  nodeKindButton: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  nodeKindButtonActive: {
    borderColor: theme.colors.info,
    backgroundColor: theme.colors.surfaceInfo,
  },
  nodeKindButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  nodeKindButtonTextActive: {
    color: theme.colors.textPrimary,
  },
  nodeKindPill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  nodeKindPillProbe: {
    backgroundColor: theme.colors.surfaceInfo,
  },
  nodeKindPillText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  probeSettingsContent: {
    paddingBottom: 28,
    gap: 14,
  },
  probeSampleIntervalValue: {
    minWidth: 68,
  },
  probeSamplingScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  probeSettingsSwitchRow: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  probeNotificationsHeader: {
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  probeNotificationSwitchSlot: {
    width: 56,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  probeNotificationsDisclosure: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  probeThresholdRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  probeThresholdRange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  probeThresholdSingleValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  probeThresholdInput: {
    width: 62,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 7,
    textAlign: 'center',
  },
  probeThresholdSeparator: {
    color: theme.colors.textSecondary,
    fontSize: 15,
  },
  probeSettingsNavRow: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  probeSettingsStaticRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  probeSettingsRowCopy: {
    flex: 1,
    gap: 2,
  },
  probeSettingsRowTitle: {
    color: theme.colors.textStrong,
    fontSize: 14,
    fontWeight: '600',
  },
  probeSettingsRowDetail: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  probeSettingsRowValue: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  probeSettingsChevron: {
    color: theme.colors.textSecondary,
    fontSize: 22,
    lineHeight: 24,
  },
  probeSettingsExpandedArea: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 14,
    gap: 12,
  },
  probeSettingsNoteInput: {
    minHeight: 58,
    textAlignVertical: 'top',
  },
  probeSettingsEmpty: {
    paddingVertical: 24,
  },
  probeSettingsHeaderCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    padding: 12,
    gap: 8,
  },
  probeCalibrationCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    padding: 12,
    gap: 10,
  },
  settingsHomeButton: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    paddingBottom: 24,
    gap: 20,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  appearanceSelector: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
  },
  appearanceOption: {
    flex: 1,
    minHeight: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appearanceOptionSelected: {
    backgroundColor: theme.colors.textPrimary,
  },
  appearanceOptionText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  appearanceOptionTextSelected: {
    color: theme.colors.background,
  },
  settingsListGroup: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  settingsListDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginLeft: 16,
  },
  settingsRowIcon: {
    width: 28,
    textAlign: 'center',
    fontSize: 19,
  },
  settingsExpandedArea: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  settingsExpandedTitle: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  settingsExpandedDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
  settingsSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
  },
  settingsSubBackButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsSubBackText: {
    color: theme.colors.textStrong,
    fontSize: 24,
    fontWeight: '600',
  },
  settingsSubHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  settingsLanguageContent: {
    paddingBottom: 24,
  },
  storageScreen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  storageHeader: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  storageBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storageBackText: {
    color: theme.colors.textStrong,
    fontSize: 24,
    fontWeight: '600',
  },
  storageHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  storageTitle: {
    color: theme.colors.textStrong,
    fontSize: 20,
    fontWeight: '800',
  },
  storageSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  storageContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  storageCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 12,
  },
  storageSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  storageSummaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  storageSectionTitle: {
    color: theme.colors.textStrong,
    fontSize: 14,
    fontWeight: '800',
  },
  storageMeta: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  storageSizeValue: {
    color: theme.colors.textStrong,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  storageStatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  storageStatItem: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 120,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  storageStatValue: {
    color: theme.colors.textStrong,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  storageStatLabel: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  storageDeviceList: {
    gap: 2,
  },
  storageDeviceRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  storageDeviceCopy: {
    flex: 1,
    minWidth: 0,
  },
  storageDeviceName: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  storageDeviceCount: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  storageDateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  storageDateField: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  storageActionRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  storageDeleteButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  storageDeleteButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  storageClearButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.pending,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  storageClearButtonText: {
    color: theme.colors.pending,
    fontSize: 12,
    fontWeight: '700',
  },
  languagePickerCard: {
    width: '88%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 14,
  },
  languagePickerList: {
    gap: 6,
  },
  languagePickerRow: {
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  languagePickerRowSelected: {
    borderColor: theme.colors.info,
    backgroundColor: theme.colors.surfaceInfo,
  },
  languagePickerRowText: {
    color: theme.colors.textStrong,
    fontSize: 15,
    fontWeight: '600',
  },
  languagePickerRowTextSelected: {
    color: theme.colors.textPrimary,
    fontWeight: '800',
  },
  languagePickerCheck: {
    width: 22,
    color: theme.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
  languagePickerCheckSelected: {
    color: theme.colors.info,
  },
  radioRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: theme.colors.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.accent,
  },
  syncModePillActive: {
    backgroundColor: theme.colors.surfaceInfo,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.info,
  },
  syncModePillDisabled: {
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    opacity: 0.7,
  },
  syncModePillTextActive: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  syncModePillTextDisabled: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  authScreen: {
    flex: 1,
    backgroundColor: theme.colors.backgroundDeep,
  },
  authContent: {
    minHeight: '100%',
    paddingHorizontal: 22,
    paddingVertical: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authContentCentered: {
    flex: 1,
    paddingHorizontal: 22,
    paddingVertical: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startupLoader: {
    flex: 1,
    position: 'relative',
    paddingHorizontal: 24,
    paddingTop: 44,
    paddingBottom: 30,
    alignItems: 'center',
  },
  startupLoaderTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  startupLoaderSpinner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -18 }],
  },
  startupLoaderLogo: {
    marginTop: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 6,
  },
  authCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: 22,
    gap: 16,
  },
  authModeRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.backgroundDeep,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  authModeButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authModeButtonActive: {
    backgroundColor: theme.colors.textPrimary,
  },
  authModeText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  authModeTextActive: {
    color: theme.colors.backgroundDeep,
  },
  authNotice: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    padding: 12,
    gap: 8,
  },
  authMessage: {
    color: theme.colors.infoText,
    fontSize: 12,
    fontWeight: '700',
  },
  accountHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    padding: 14,
  },
  accountAvatarFrame: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2,
    borderColor: theme.colors.infoText,
    backgroundColor: theme.colors.backgroundDeep,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  accountAvatarImage: {
    width: 74,
    height: 74,
    borderRadius: 37,
  },
  accountAvatarInitial: {
    color: theme.colors.infoText,
    fontSize: 30,
    fontWeight: '900',
  },
  accountHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  accountHalfField: {
    flex: 1,
  },
  accountMultilineInput: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  mainContentShell: {
    flex: 1,
  },
  graphTransitionHost: {
    flex: 1,
  },
  scheduleDataScreen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scheduleDataHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  scheduleDataBackButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  scheduleDataBackText: {
    color: theme.colors.textStrong,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  scheduleDataHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  scheduleDataTitle: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  scheduleDataSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  scheduleDataWindowTabs: {
    flexDirection: 'row',
    gap: 4,
  },
  scheduleDataWindowButton: {
    minWidth: 32,
    minHeight: 28,
    paddingHorizontal: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleDataWindowButtonActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
  },
  scheduleDataWindowText: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  scheduleDataWindowTextActive: {
    color: theme.colors.accentInk,
  },
  scheduleDataScroll: {
    flex: 1,
  },
  scheduleDataContent: {
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 12,
    gap: 7,
  },
  scheduleDataLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 20,
  },
  scheduleDataLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scheduleDataLegendRequested: {
    width: 22,
    height: 2,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.textSecondary,
  },
  scheduleDataLegendApplied: {
    width: 22,
    height: 2,
    backgroundColor: theme.colors.textStrong,
  },
  scheduleDataLegendText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
  },
  scheduleDataSampleCount: {
    marginLeft: 'auto',
    color: theme.colors.textSoft,
    fontSize: 10,
  },
  scheduleDataChartCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 5,
  },
  scheduleDataChartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  scheduleDataChartTitle: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  scheduleDataChartDetail: {
    color: theme.colors.textSecondary,
    fontSize: 9,
  },
  scheduleDataLatestValue: {
    color: theme.colors.textStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  scheduleDataChartPlot: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
    overflow: 'hidden',
  },
  scheduleDataYAxisLabels: {
    width: 22,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: 1,
  },
  scheduleDataAxisText: {
    color: theme.colors.textSoft,
    fontSize: 8,
  },
  scheduleDataXAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  scheduleDataEmptyCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  scheduleDataEmptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  scheduleDataEmptyText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  graphWorkspaceScreen: {
    flex: 1,
    backgroundColor: theme.colors.backgroundDeep,
  },
  graphRotateViewport: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  graphRotateStage: {
    backgroundColor: theme.colors.backgroundDeep,
    alignItems: 'stretch',
  },
  graphWorkspaceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    position: 'relative',
    zIndex: 60,
    overflow: 'visible',
  },
  graphHamburgerButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphHamburgerText: {
    color: theme.colors.textStrong,
    fontSize: 22,
    fontWeight: '800',
  },
  graphWorkspaceHeaderCopy: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    overflow: 'visible',
  },
  graphSourceControlWrap: {
    position: 'relative',
    flexBasis: 160,
    flexShrink: 1,
    minWidth: 105,
    maxWidth: 180,
    zIndex: 70,
  },
  graphSourceControlWrapOpen: {
    zIndex: 120,
  },
  graphSourceToggle: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  graphSourceToggleCheck: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphSourceSelect: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  graphSourceSelectCopy: {
    flex: 1,
    minWidth: 0,
  },
  graphSourceTypeText: {
    color: theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  graphSourceChevron: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  graphSourceToggleActive: {
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surfaceAlt,
  },
  graphSourceToggleDisabled: {
    opacity: 0.45,
  },
  graphSourceToggleMark: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphSourceToggleMarkActive: {
    borderColor: theme.colors.textSecondary,
  },
  graphSourceToggleText: {
    flexShrink: 1,
    color: theme.colors.textStrong,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 13,
  },
  graphWorkspaceHeaderActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexShrink: 0,
    zIndex: 65,
  },
  graphHeaderButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  graphCloudSyncControl: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 2,
  },
  graphCloudSyncCopy: {
    minWidth: 68,
    flexShrink: 1,
  },
  graphExitSafetyGap: {
    width: 42,
    height: 40,
  },
  graphSourceDropdown: {
    position: 'absolute',
    top: 44,
    left: 0,
    width: 250,
    maxHeight: 230,
    zIndex: 140,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    padding: 8,
  },
  graphSourceDropdownRight: {
    left: undefined,
    right: 0,
  },
  graphSourceDropdownScroll: {
    maxHeight: 212,
  },
  graphLampPickerList: {
    gap: 8,
  },
  graphLampPickerRow: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  graphLampPickerRowSelected: {
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  graphLampPickerName: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  graphCloudSyncStatus: {
    color: theme.colors.textSecondary,
    fontSize: 9,
    marginTop: 1,
  },
  graphHeaderButtonText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  graphExitButton: {
    width: 38,
    height: 38,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphExitButtonText: {
    color: theme.colors.textStrong,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '400',
  },
  graphWorkspaceBody: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  graphDrawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 30,
    backgroundColor: theme.colors.drawer,
    borderRightWidth: 1,
    borderRightColor: theme.colors.drawerBorder,
    paddingLeft: 58,
    paddingRight: 18,
    paddingVertical: 16,
  },
  graphDrawerContent: {
    gap: 20,
    paddingBottom: 24,
  },
  graphChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  graphSourceSeriesSection: {
    marginTop: 10,
    gap: 4,
  },
  graphSourceSeriesTitle: {
    color: theme.colors.textStrong,
    fontSize: 12,
    fontWeight: '900',
  },
  graphSignalGroup: {
    gap: 8,
    marginTop: 10,
  },
  graphSignalGroupTitle: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  graphCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 34,
  },
  graphCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundDeep,
  },
  graphCheckboxActive: {
    borderColor: theme.colors.infoText,
    backgroundColor: theme.colors.surfaceInfo,
  },
  graphColorSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  graphMainPane: {
    flex: 1,
    paddingRight: 10,
    paddingBottom: 10,
  },
  graphMainContent: {
    flex: 1,
  },
  graphDrawerEdgeHandle: {
    position: 'absolute',
    left: 0,
    top: 24,
    zIndex: 10,
    backgroundColor: theme.colors.surfaceInfo,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: theme.colors.info,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  graphDrawerEdgeText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  graphCard: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
  },
  graphEmptyCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
  },
  graphCanvas: {
    flex: 1,
    minHeight: 260,
    position: 'relative',
    paddingTop: 10,
    paddingBottom: 4,
  },
  graphGridLineTop: {
    position: 'absolute',
    top: 14,
    left: 58,
    right: 118,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  graphGridLineMid: {
    position: 'absolute',
    top: '50%',
    left: 58,
    right: 118,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  graphGridLineBottom: {
    position: 'absolute',
    bottom: 12,
    left: 58,
    right: 118,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  graphPlotArea: {
    position: 'relative',
  },
  graphYAxisLeft: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 16,
    width: 50,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  graphYAxisRuleLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 1,
    backgroundColor: theme.colors.border,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  graphYAxisRightWrap: {
    position: 'absolute',
    right: 0,
    top: 10,
    bottom: 16,
    width: 112,
    flexDirection: 'row',
    gap: 8,
  },
  graphYAxisRight: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  graphYAxisRuleRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 1,
    backgroundColor: theme.colors.border,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  graphYAxisTick: {
    width: 7,
    height: 1,
    backgroundColor: theme.colors.textSecondary,
  },
  graphYAxisTickLeft: {
    transform: [{ translateX: 1 }],
  },
  graphYAxisTickRight: {
    transform: [{ translateX: -1 }],
  },
  graphYAxisValue: {
    fontSize: 9,
    fontWeight: '800',
  },
  graphYAxisLabel: {
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
  graphXAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 1,
  },
  graphAxisLabel: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    minWidth: 52,
    textAlign: 'center',
  },
  graphAxisLabelStart: {
    textAlign: 'left',
  },
  graphAxisLabelEnd: {
    textAlign: 'right',
  },
  graphPoint: {
    position: 'absolute',
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphPointDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.infoText,
  },
  graphTapLabel: {
    position: 'absolute',
    width: 144,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: theme.colors.drawer,
    paddingHorizontal: 10,
    paddingVertical: 8,
    zIndex: 20,
  },
  graphTapLabelTitle: {
    fontSize: 11,
    fontWeight: '900',
  },
  graphTapLabelText: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  jsonPreviewCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    maxHeight: 240,
  },
  jsonPreviewText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 16,
  },
});

type AppStyles = ReturnType<typeof createStyles>;
