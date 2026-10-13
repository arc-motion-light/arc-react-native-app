import { isProbeUtcMs } from './mesh/probeSampleTimeProtocol';
import type { HardwareHistoryProvenance } from './mesh/iosHardwareHistoryProtocol';
import type { ProbeSensorStatus } from './mesh/meshTypes';

export const PROBE_LOG_SCHEMA_VERSION = 1 as const;

export type ProbeCloudSyncMode = 'local_only' | 'cloud_later';
export type ProbeCloudSyncState = 'local' | 'queued' | 'synced';

export type ProbeLogEnvelope = {
  hardwareProvenance?: HardwareHistoryProvenance;
  schemaVersion: typeof PROBE_LOG_SCHEMA_VERSION;
  recordId: string;
  probeId: string;
  source: ProbeSensorStatus['source'];
  timeline: {
    receivedAtMs: number;
    storageStartedAtMs?: number;
    deviceTimestampMs: number | null;
    timestampValid?: boolean;
    timestampOrigin?: 'lamp_g4_receive_rtc' | 'phone_received' | 'probe_device' | 'unknown';
  };
  telemetry: {
    batteryPct: number | null;
    charging: boolean | null;
    chargeState: ProbeSensorStatus['chargeState'];
    pmicStatusRaw: number | null;
    pmicFaultRaw: number | null;
    bme690TemperatureC: number | null;
    bme690HumidityPct: number | null;
    bme690PressureHpa: number | null;
    bme690GasOhms: number | null;
    sht45TemperatureC: number | null;
    sht45HumidityPct: number | null;
    earthTemperatureC: number | null;
    earthTemperatureRaw: number | null;
    mcuTemperatureC: number | null;
    tscDepth0Raw: number | null;
    tscDepth1Raw: number | null;
    tscDepth2Raw: number | null;
    tscDepth0Delta: number | null;
    tscDepth1Delta: number | null;
    tscDepth2Delta: number | null;
    lightLux: number | null;
    lightIntensityRaw: number | null;
    lightRedRaw: number | null;
    lightGreenRaw: number | null;
    lightBlueRaw: number | null;
    bme690GasDiagRaw: number | null;
    apds9253SampleStatusRaw: number | null;
    linkRssiDbm: number | null;
  };
  raw: {
    snapshot: ProbeSensorStatus;
  };
  sync: {
    mode: ProbeCloudSyncMode;
    state: ProbeCloudSyncState;
    provider: 'firebase_candidate' | 'portal-canonical' | null;
  };
};

const normalizeNumber = (value: number | null | undefined) => (typeof value === 'number' ? value : null);

export const buildProbeLogEnvelope = (
  probeId: string,
  snapshot: ProbeSensorStatus,
  syncMode: ProbeCloudSyncMode,
  identity?: {
    recordId?: string;
    deviceTimestampMs?: number | null;
    receivedAtMs?: number;
    storageStartedAtMs?: number;
    timestampValid?: boolean;
    timestampOrigin?: 'lamp_g4_receive_rtc' | 'phone_received' | 'probe_device' | 'unknown';
  }
): ProbeLogEnvelope => {
  const receivedAtMs = identity?.receivedAtMs ?? snapshot.updatedAt ?? Date.now();

  const explicitTime=identity&&Object.prototype.hasOwnProperty.call(identity,'deviceTimestampMs');
  const deviceTimestampMs=explicitTime?identity!.deviceTimestampMs??null:snapshot.deviceTimestampMs??null;
  const timestampValid=identity?.timestampValid!==false&&snapshot.timestampValid!==false&&(identity?.timestampValid===true||snapshot.timestampValid===true)&&isProbeUtcMs(deviceTimestampMs);
  const timestampOrigin=identity?.timestampOrigin??snapshot.timestampOrigin??(deviceTimestampMs==null?'phone_received':'unknown');
  return {
    schemaVersion: PROBE_LOG_SCHEMA_VERSION,
    recordId: identity?.recordId ?? snapshot.sampleRecordId ?? `${probeId}:${receivedAtMs}`,
    probeId,
    source: snapshot.source ?? null,
    timeline: {
      receivedAtMs,
      deviceTimestampMs,
      timestampValid,
      timestampOrigin,
      storageStartedAtMs: identity?.storageStartedAtMs,
    },
    telemetry: {
      batteryPct: normalizeNumber(snapshot.batteryPct),
      charging: typeof snapshot.charging === 'boolean' ? snapshot.charging : null,
      chargeState: snapshot.chargeState ?? null,
      pmicStatusRaw: normalizeNumber(snapshot.pmicStatusRaw),
      pmicFaultRaw: normalizeNumber(snapshot.pmicFaultRaw),
      bme690TemperatureC: normalizeNumber(snapshot.bme690TemperatureC ?? snapshot.temperatureC),
      bme690HumidityPct: normalizeNumber(snapshot.bme690HumidityPct ?? snapshot.humidityPct),
      bme690PressureHpa: normalizeNumber(snapshot.bme690PressureHpa ?? snapshot.pressureHpa),
      bme690GasOhms: normalizeNumber(snapshot.bme690GasOhms ?? snapshot.gasOhms),
      sht45TemperatureC: normalizeNumber(snapshot.sht45TemperatureC),
      sht45HumidityPct: normalizeNumber(snapshot.sht45HumidityPct),
      earthTemperatureC: normalizeNumber(snapshot.earthTemperatureC),
      earthTemperatureRaw: normalizeNumber(snapshot.earthTemperatureRaw),
      mcuTemperatureC: normalizeNumber(snapshot.mcuTemperatureC),
      tscDepth0Raw: normalizeNumber(snapshot.tscDepth0Raw),
      tscDepth1Raw: normalizeNumber(snapshot.tscDepth1Raw),
      tscDepth2Raw: normalizeNumber(snapshot.tscDepth2Raw),
      tscDepth0Delta: normalizeNumber(snapshot.tscDepth0Delta),
      tscDepth1Delta: normalizeNumber(snapshot.tscDepth1Delta),
      tscDepth2Delta: normalizeNumber(snapshot.tscDepth2Delta),
      lightLux: normalizeNumber(snapshot.lightLux),
      lightIntensityRaw: normalizeNumber(snapshot.lightIntensityRaw),
      lightRedRaw: normalizeNumber(snapshot.lightRedRaw),
      lightGreenRaw: normalizeNumber(snapshot.lightGreenRaw),
      lightBlueRaw: normalizeNumber(snapshot.lightBlueRaw),
      bme690GasDiagRaw: normalizeNumber(snapshot.bme690GasDiagRaw),
      apds9253SampleStatusRaw: normalizeNumber(snapshot.apds9253SampleStatusRaw),
      linkRssiDbm: normalizeNumber(snapshot.linkRssiDbm),
    },
    raw: {
      snapshot: {
        ...snapshot,
        updatedAt: receivedAtMs,
      },
    },
    sync: {
      mode: syncMode,
      state: syncMode === 'cloud_later' ? 'queued' : 'local',
      provider: syncMode === 'cloud_later' ? 'firebase_candidate' : null,
    },
  };
};
