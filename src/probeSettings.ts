import * as FileSystem from 'expo-file-system/legacy';

export type ProbePowerProfile = 'live' | 'balanced' | 'battery_saver' | 'custom';
export type ProbeSettingCommandState = 'local_only' | 'pending' | 'applied' | 'failed' | 'unsupported';
export type ProbeCalibrationStatus = 'not_started' | 'experimental' | 'calibrated';
export type ProbeGraphWindow = '15m' | '1h' | '6h' | '24h';
export type ProbeGraphSignal =
  | 'sht45Temp'
  | 'sht45Humidity'
  | 'bmePressure'
  | 'bmeGas'
  | 'soilTop'
  | 'soilMid'
  | 'soilBottom'
  | 'soilTemp'
  | 'lightRed'
  | 'lightGreen'
  | 'lightBlue'
  | 'lightIntensity'
  | 'battery';

export type ProbeSettings = {
  schemaVersion: 1;
  probeId: string;
  updatedAtMs: number;
  localAppSettings: {
    displayName: string;
    plantLabel: string;
    note: string;
    loggingEnabled: boolean;
    loggingIntervalSec: number;
    logOnlyWhileConnected: boolean;
    retentionDays: number;
    storageBudgetMb: number;
    rawPayloadRetention: boolean;
    graphDefaultWindow: ProbeGraphWindow;
    graphLiveFollow: boolean;
    defaultVisibleSignals: ProbeGraphSignal[];
  };
  desiredProbeSettings: {
    powerProfile: ProbePowerProfile;
    regularMeasurementIntervalSec: number;
    gasMeasurementIntervalSec: number | null;
    lightSamplingEnabled: boolean;
    soilSpearSamplingEnabled: boolean;
    environmentSamplingEnabled: boolean;
    commandState: ProbeSettingCommandState;
  };
  calibration: {
    status: ProbeCalibrationStatus;
    dryReferenceSet: boolean;
    wetReferenceSet: boolean;
    inSoilSettleStepDone: boolean;
    lastCalibratedAtMs: number | null;
  };
  alerts: {
    lowBatteryPct: number;
    longDisconnectedHours: number;
    temperatureMinC: number;
    temperatureMaxC: number;
    humidityMinPct: number;
    humidityMaxPct: number;
    soilDryishThreshold: number;
  };
  advanced: {
    keepRawPayloadSnapshots: boolean;
    developerDiagnostics: boolean;
  };
};

const directory = `${FileSystem.documentDirectory ?? ''}probe-settings`;

const ensureDirectory = async () => {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
};

const sanitizeProbeId = (probeId: string) => encodeURIComponent(probeId.replace(/[^a-zA-Z0-9_.:-]/g, '_'));

const clampInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const sanitizeGraphWindow = (value: unknown): ProbeGraphWindow =>
  value === '15m' || value === '1h' || value === '6h' || value === '24h' ? value : '1h';

const sanitizeGraphSignal = (value: unknown): ProbeGraphSignal | null =>
  value === 'sht45Temp' ||
  value === 'sht45Humidity' ||
  value === 'bmePressure' ||
  value === 'bmeGas' ||
  value === 'soilTop' ||
  value === 'soilMid' ||
  value === 'soilBottom' ||
  value === 'soilTemp' ||
  value === 'lightRed' ||
  value === 'lightGreen' ||
  value === 'lightBlue' ||
  value === 'lightIntensity' ||
  value === 'battery'
    ? value
    : value === 'temp'
      ? 'sht45Temp'
      : value === 'humidity'
        ? 'sht45Humidity'
        : value === 'soil'
          ? 'soilTop'
          : null;

const sanitizePowerProfile = (value: unknown): ProbePowerProfile =>
  value === 'live' || value === 'balanced' || value === 'battery_saver' || value === 'custom' ? value : 'balanced';

const sanitizeCommandState = (value: unknown): ProbeSettingCommandState =>
  value === 'pending' || value === 'applied' || value === 'failed' || value === 'unsupported' ? value : 'local_only';

const sanitizeCalibrationStatus = (value: unknown): ProbeCalibrationStatus =>
  value === 'experimental' || value === 'calibrated' ? value : 'not_started';

export const buildDefaultProbeSettings = (probeId: string, displayName = 'Probe'): ProbeSettings => ({
  schemaVersion: 1,
  probeId,
  updatedAtMs: Date.now(),
  localAppSettings: {
    displayName,
    plantLabel: '',
    note: '',
    loggingEnabled: true,
    loggingIntervalSec: 30,
    logOnlyWhileConnected: true,
    retentionDays: 7,
    storageBudgetMb: 25,
    rawPayloadRetention: false,
    graphDefaultWindow: '1h',
    graphLiveFollow: true,
    defaultVisibleSignals: ['sht45Temp', 'soilTop', 'soilMid', 'soilBottom'],
  },
  desiredProbeSettings: {
    powerProfile: 'balanced',
    regularMeasurementIntervalSec: 30,
    gasMeasurementIntervalSec: 300,
    lightSamplingEnabled: true,
    soilSpearSamplingEnabled: true,
    environmentSamplingEnabled: true,
    commandState: 'local_only',
  },
  calibration: {
    status: 'not_started',
    dryReferenceSet: false,
    wetReferenceSet: false,
    inSoilSettleStepDone: false,
    lastCalibratedAtMs: null,
  },
  alerts: {
    lowBatteryPct: 20,
    longDisconnectedHours: 12,
    temperatureMinC: 5,
    temperatureMaxC: 35,
    humidityMinPct: 25,
    humidityMaxPct: 85,
    soilDryishThreshold: 25,
  },
  advanced: {
    keepRawPayloadSnapshots: false,
    developerDiagnostics: false,
  },
});

export const normalizeProbeSettings = (
  probeId: string,
  displayName: string,
  partial: Partial<ProbeSettings> | null | undefined
): ProbeSettings => {
  const defaults = buildDefaultProbeSettings(probeId, displayName);
  const local: Partial<ProbeSettings['localAppSettings']> = partial?.localAppSettings ?? {};
  const desired: Partial<ProbeSettings['desiredProbeSettings']> = partial?.desiredProbeSettings ?? {};
  const calibration: Partial<ProbeSettings['calibration']> = partial?.calibration ?? {};
  const alerts: Partial<ProbeSettings['alerts']> = partial?.alerts ?? {};
  const advanced: Partial<ProbeSettings['advanced']> = partial?.advanced ?? {};
  const graphSignals = Array.isArray(local.defaultVisibleSignals)
    ? local.defaultVisibleSignals.map(sanitizeGraphSignal).filter((value): value is ProbeGraphSignal => value !== null)
    : defaults.localAppSettings.defaultVisibleSignals;

  return {
    schemaVersion: 1,
    probeId,
    updatedAtMs: typeof partial?.updatedAtMs === 'number' ? partial.updatedAtMs : Date.now(),
    localAppSettings: {
      displayName: String(local.displayName ?? displayName ?? defaults.localAppSettings.displayName),
      plantLabel: String(local.plantLabel ?? defaults.localAppSettings.plantLabel),
      note: String(local.note ?? defaults.localAppSettings.note),
      loggingEnabled: local.loggingEnabled ?? defaults.localAppSettings.loggingEnabled,
      loggingIntervalSec: clampInteger(local.loggingIntervalSec, defaults.localAppSettings.loggingIntervalSec, 1, 86400),
      logOnlyWhileConnected: local.logOnlyWhileConnected ?? defaults.localAppSettings.logOnlyWhileConnected,
      retentionDays: clampInteger(local.retentionDays, defaults.localAppSettings.retentionDays, 1, 365),
      storageBudgetMb: clampInteger(local.storageBudgetMb, defaults.localAppSettings.storageBudgetMb, 1, 2048),
      rawPayloadRetention: local.rawPayloadRetention ?? defaults.localAppSettings.rawPayloadRetention,
      graphDefaultWindow: sanitizeGraphWindow(local.graphDefaultWindow),
      graphLiveFollow: local.graphLiveFollow ?? defaults.localAppSettings.graphLiveFollow,
      defaultVisibleSignals: graphSignals.length ? graphSignals : defaults.localAppSettings.defaultVisibleSignals,
    },
    desiredProbeSettings: {
      powerProfile: sanitizePowerProfile(desired.powerProfile),
      regularMeasurementIntervalSec: clampInteger(
        desired.regularMeasurementIntervalSec,
        defaults.desiredProbeSettings.regularMeasurementIntervalSec,
        1,
        3600
      ),
      gasMeasurementIntervalSec:
        desired.gasMeasurementIntervalSec === null
          ? null
          : clampInteger(desired.gasMeasurementIntervalSec, defaults.desiredProbeSettings.gasMeasurementIntervalSec ?? 300, 60, 86400),
      lightSamplingEnabled: desired.lightSamplingEnabled ?? defaults.desiredProbeSettings.lightSamplingEnabled,
      soilSpearSamplingEnabled: desired.soilSpearSamplingEnabled ?? defaults.desiredProbeSettings.soilSpearSamplingEnabled,
      environmentSamplingEnabled: desired.environmentSamplingEnabled ?? defaults.desiredProbeSettings.environmentSamplingEnabled,
      commandState: sanitizeCommandState(desired.commandState),
    },
    calibration: {
      status: sanitizeCalibrationStatus(calibration.status),
      dryReferenceSet: calibration.dryReferenceSet ?? defaults.calibration.dryReferenceSet,
      wetReferenceSet: calibration.wetReferenceSet ?? defaults.calibration.wetReferenceSet,
      inSoilSettleStepDone: calibration.inSoilSettleStepDone ?? defaults.calibration.inSoilSettleStepDone,
      lastCalibratedAtMs:
        typeof calibration.lastCalibratedAtMs === 'number' ? calibration.lastCalibratedAtMs : defaults.calibration.lastCalibratedAtMs,
    },
    alerts: {
      lowBatteryPct: clampInteger(alerts.lowBatteryPct, defaults.alerts.lowBatteryPct, 1, 100),
      longDisconnectedHours: clampInteger(alerts.longDisconnectedHours, defaults.alerts.longDisconnectedHours, 1, 720),
      temperatureMinC: clampInteger(alerts.temperatureMinC, defaults.alerts.temperatureMinC, -40, 85),
      temperatureMaxC: clampInteger(alerts.temperatureMaxC, defaults.alerts.temperatureMaxC, -40, 85),
      humidityMinPct: clampInteger(alerts.humidityMinPct, defaults.alerts.humidityMinPct, 0, 100),
      humidityMaxPct: clampInteger(alerts.humidityMaxPct, defaults.alerts.humidityMaxPct, 0, 100),
      soilDryishThreshold: clampInteger(alerts.soilDryishThreshold, defaults.alerts.soilDryishThreshold, 0, 100),
    },
    advanced: {
      keepRawPayloadSnapshots: advanced.keepRawPayloadSnapshots ?? defaults.advanced.keepRawPayloadSnapshots,
      developerDiagnostics: advanced.developerDiagnostics ?? defaults.advanced.developerDiagnostics,
    },
  };
};

export const loadProbeSettings = async (probeId: string, displayName = 'Probe'): Promise<ProbeSettings> => {
  try {
    await ensureDirectory();
    const path = `${directory}/${sanitizeProbeId(probeId)}.json`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return buildDefaultProbeSettings(probeId, displayName);
    const raw = await FileSystem.readAsStringAsync(path);
    return normalizeProbeSettings(probeId, displayName, JSON.parse(raw) as Partial<ProbeSettings>);
  } catch {
    return buildDefaultProbeSettings(probeId, displayName);
  }
};

export const saveProbeSettings = async (settings: ProbeSettings): Promise<void> => {
  await ensureDirectory();
  const path = `${directory}/${sanitizeProbeId(settings.probeId)}.json`;
  const normalized = normalizeProbeSettings(settings.probeId, settings.localAppSettings.displayName, {
    ...settings,
    updatedAtMs: Date.now(),
  });
  await FileSystem.writeAsStringAsync(path, JSON.stringify(normalized, null, 2));
};
