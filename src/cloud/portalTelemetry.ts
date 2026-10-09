import type { ProbeLogEnvelope } from '../probeDataFormat';
import type { ProbeSensorStatus } from '../mesh/meshTypes';
import type { LatestTelemetrySummary, PortalDeviceSummary, PortalHistorySample } from './portalTypes';

const numeric = (values: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
};

const bool = (values: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) if (typeof values[key] === 'boolean') return values[key] as boolean;
  return null;
};

const timestampMs = (value?: string) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const portalLatestToProbeStatus = (latest?: LatestTelemetrySummary): ProbeSensorStatus | null => {
  if (!latest) return null;
  const values = latest.values;
  const sampledAt = timestampMs(latest.sampledAt) ?? timestampMs(latest.receivedAt);
  if (sampledAt === null) return null;
  return {
    updatedAt: sampledAt,
    source: 'portal-canonical',
    temperatureC: numeric(values, 'temperatureC', 'temperature_c', 'sht45_temp_c', 'bme690_temp_c'),
    humidityPct: numeric(values, 'humidityPct', 'humidity_pct', 'sht45_humidity_rh', 'bme690_humidity_rh'),
    pressureHpa: numeric(values, 'pressureHpa', 'pressure_hpa', 'bme690_pressure_hpa'),
    gasOhms: numeric(values, 'gasOhms', 'gas_ohms', 'bme690_gas_ohms'),
    batteryPct: numeric(values, 'batteryPct', 'battery_percent', 'battery_pct'),
    charging: bool(values, 'charging'),
    sht45TemperatureC: numeric(values, 'sht45TemperatureC', 'sht45_temp_c'),
    sht45HumidityPct: numeric(values, 'sht45HumidityPct', 'sht45_humidity_rh'),
    bme690TemperatureC: numeric(values, 'bme690TemperatureC', 'bme690_temp_c'),
    bme690HumidityPct: numeric(values, 'bme690HumidityPct', 'bme690_humidity_rh'),
    bme690PressureHpa: numeric(values, 'bme690PressureHpa', 'bme690_pressure_hpa'),
    bme690GasOhms: numeric(values, 'bme690GasOhms', 'bme690_gas_ohms'),
    earthTemperatureC: numeric(values, 'earthTemperatureC', 'soil_temp_c'),
    earthTemperatureRaw: numeric(values, 'earthTemperatureRaw', 'soil_temp_raw', 'soil_thermistor_raw'),
    tscDepth0Raw: numeric(values, 'tscDepth0Raw', 'soil_tsc_depth0_raw'),
    tscDepth1Raw: numeric(values, 'tscDepth1Raw', 'soil_tsc_depth1_raw'),
    tscDepth2Raw: numeric(values, 'tscDepth2Raw', 'soil_tsc_depth2_raw'),
    tscDepth0Delta: numeric(values, 'tscDepth0Delta', 'soil_tsc_depth0_delta'),
    tscDepth1Delta: numeric(values, 'tscDepth1Delta', 'soil_tsc_depth1_delta'),
    tscDepth2Delta: numeric(values, 'tscDepth2Delta', 'soil_tsc_depth2_delta'),
    lightLux: numeric(values, 'lightLux', 'light_lux'),
    lightIntensityRaw: numeric(values, 'lightIntensityRaw', 'light_intensity_raw'),
    lightRedRaw: numeric(values, 'lightRedRaw', 'light_red_raw'),
    lightGreenRaw: numeric(values, 'lightGreenRaw', 'light_green_raw'),
    lightBlueRaw: numeric(values, 'lightBlueRaw', 'light_blue_raw'),
  } as ProbeSensorStatus;
};

export const portalHistoryToProbeLogs = (
  device: PortalDeviceSummary,
  history: PortalHistorySample[]
): ProbeLogEnvelope[] => history.flatMap((sample, index) => {
  const sampledAtMs = timestampMs(sample.sampledAt);
  if (sampledAtMs === null) return [];
  const receivedAtMs = timestampMs(sample.receivedAt) ?? sampledAtMs;
  const status = portalLatestToProbeStatus({ sampledAt: sample.sampledAt, receivedAt: sample.receivedAt, values: sample.values });
  if (!status) return [];
  return [{
    schemaVersion: 1,
    recordId: sample.recordId ?? `portal:${device.id}:${sampledAtMs}:${index}`,
    probeId: device.id,
    source: 'portal-canonical',
    timeline: {
      receivedAtMs,
      deviceTimestampMs: sampledAtMs,
      timestampOrigin: 'probe_device',
    },
    telemetry: {
      batteryPct: status.batteryPct ?? null,
      charging: status.charging ?? null,
      chargeState: status.chargeState ?? null,
      pmicStatusRaw: status.pmicStatusRaw ?? null,
      pmicFaultRaw: status.pmicFaultRaw ?? null,
      bme690TemperatureC: status.bme690TemperatureC ?? null,
      bme690HumidityPct: status.bme690HumidityPct ?? null,
      bme690PressureHpa: status.bme690PressureHpa ?? null,
      bme690GasOhms: status.bme690GasOhms ?? null,
      sht45TemperatureC: status.sht45TemperatureC ?? null,
      sht45HumidityPct: status.sht45HumidityPct ?? null,
      earthTemperatureC: status.earthTemperatureC ?? null,
      earthTemperatureRaw: status.earthTemperatureRaw ?? null,
      mcuTemperatureC: status.mcuTemperatureC ?? null,
      tscDepth0Raw: status.tscDepth0Raw ?? null,
      tscDepth1Raw: status.tscDepth1Raw ?? null,
      tscDepth2Raw: status.tscDepth2Raw ?? null,
      tscDepth0Delta: status.tscDepth0Delta ?? null,
      tscDepth1Delta: status.tscDepth1Delta ?? null,
      tscDepth2Delta: status.tscDepth2Delta ?? null,
      lightLux: status.lightLux ?? null,
      lightIntensityRaw: status.lightIntensityRaw ?? null,
      lightRedRaw: status.lightRedRaw ?? null,
      lightGreenRaw: status.lightGreenRaw ?? null,
      lightBlueRaw: status.lightBlueRaw ?? null,
      bme690GasDiagRaw: status.bme690GasDiagRaw ?? null,
      apds9253SampleStatusRaw: status.apds9253SampleStatusRaw ?? null,
      linkRssiDbm: status.linkRssiDbm ?? null,
    },
    raw: { snapshot: status as any },
    sync: { mode: 'cloud_later', state: 'synced', provider: 'portal-canonical' },
  } as ProbeLogEnvelope];
});


/** Canonical Portal records use the same operational graph model as local Lamp history. */
export const portalHistoryToLampLogs = (device: PortalDeviceSummary, history: PortalHistorySample[]): import('../lampLogger').LampOperationalRecord[] => {
  if (!device.access.canViewHistory) return [];
  return history.flatMap((sample, index) => {
    const at = timestampMs(sample.sampledAt);
    if (at === null) return [];
    const values = sample.values;
    return [{
      schemaVersion: 1, recordType: 'lamp_operational', recordId: sample.recordId ?? `portal:${device.id}:${at}:${index}`, lampId: device.id,
      timeline: { lampSampledAtMs: at, receivedAtMs: timestampMs(sample.receivedAt) ?? at,
        timestampOrigin: 'portal_sample', timestampQuality: 'edge_timestamp' },
      measured: { coreTemperatureC: numeric(values, 'lamp_core_temp_c'), boardTemperatureC: numeric(values, 'lamp_board_temp_c'),
        mcuTemperatureC: numeric(values, 'lamp_mcu_temp_c'), currentMa: numeric(values, 'lamp_current_ma'),
        fan1Rpm: numeric(values, 'lamp_fan1_rpm'), fan2Rpm: numeric(values, 'lamp_fan2_rpm') },
      commanded: { lampOn: values.lamp_output_enabled === true, fanDutyPercent: null, fanTargetRpm: null,
        requestedChannelsPercent: null, powerTargetWatts: null, targetPwmHz: null },
      derived: { inputPowerWatts: numeric(values, 'lamp_power_w'), filteredDisplayPowerWatts: null },
      state: { appliedChannelsPercent: null, outputsEnabled: bool(values, 'lamp_output_enabled'), fanAutomatic: null,
        fanRpmControl: null, activePwmHz: null, thermalLimitReached: false, thermalShutdown: false,
        healthSeverity: null, healthCode: null, flagsRaw: null },
      provenance: { sourcePath: 'portal_canonical', power: 'reported_cloud_record' },
    }];
  });
};
