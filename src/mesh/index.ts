import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import {
  fromBase64,
  readInt16LE,
  readUint16LE,
  readUint32LE,
  readUint8,
  toBase64,
} from '../protocol/valueCodec';
import type { LampStatus } from '../ble/bleTypes';
import {
  ARC_MESH_COMPANY_ID,
  ARC_MESH_MODEL_ID,
  ARC_OPEN_MESH_VENDOR_WRAPPER_OPCODE,
  ArcMeshProbeOpcode,
  decodeArcGatewayDebugStatusFrame,
  decodeArcProbeTelemetryStatusFrame,
  decodeArcProbeGatewayChildConfirmationFrame,
  type ArcProbeTelemetryStatus,
  type ArcGatewayDebugStatus,
  type ArcProbeGatewayChildConfirmation,
} from './arcMeshProtocol';
import { createOpenMeshClient } from './openMeshClient';
import { encodeLampCadence, decodeLampCadence, type LampCadenceReply } from './lampCadenceProtocol';
import {
  encodeOpenMeshHomeScreenControlFrame,
  encodeOpenMeshHomeControlFlags,
  decodeOpenMeshStatusFrame,
  encodeOpenMeshGetStatusFrame,
  encodeOpenMeshSetLampConfigFrame,
  encodeOpenMeshGetLampConfigFrame,
  decodeOpenMeshLampConfigStatusFrame,
  encodeOpenMeshManualChannelControlFrame,
  encodeOpenMeshManualFanControlFrame,
  encodeOpenMeshPreparePwmFrequencyFrame,
  encodeOpenMeshManualPowerControlFrame,
  encodeOpenMeshManualPowerTargetFrame,
  OpenMeshOpcode,
  type OpenMeshLampConfig,
  type OpenMeshLampConfigReply,
  type OpenMeshHomeControlFlags,
  type OpenMeshStatusFrame,
  type OpenMeshManualChannelControl,
  type OpenMeshManualFanControl,
  type OpenMeshManualFrequencyControl,
  type OpenMeshManualPowerControl,
  type OpenMeshManualPowerTargetControl,
} from './openMeshProtocol';
import type { MeshNode, MeshScanResult, ProbeSensorStatus } from './meshTypes';
import { clampLampIntensity } from '../lamp/lampLimits';
import {
  ArcHistoryOpcode,
  decodeArcHistoryAck,
  decodeArcHistoryRecord,
  decodeArcHistoryStream,
  decodeArcHistoryStatus,
  encodeArcHistoryAck,
  encodeArcHistoryGetAfter,
  encodeArcHistoryGetBatch,
  encodeArcHistoryStatusGet,
  type ArcHistoryRecord,
  type ArcHistoryStatus,
} from './arcHistoryProtocol';

const OPEN_MESH_WRAPPED_OPCODES = new Set<number>([
  OpenMeshOpcode.SET_STATUS,
  OpenMeshOpcode.GET_STATUS,
  OpenMeshOpcode.STATUS,
  OpenMeshOpcode.HOMESCREEN_CONTROL,
  OpenMeshOpcode.SET_TIME,
  OpenMeshOpcode.SET_LAMP_CONFIG,
  OpenMeshOpcode.LAMP_CONFIG_STATUS,
  OpenMeshOpcode.GET_LAMP_CONFIG,
  OpenMeshOpcode.MANUAL_CHANNEL_CONTROL,
  OpenMeshOpcode.MANUAL_FAN_CONTROL,
  OpenMeshOpcode.PREPARE_PWM_FREQUENCY,
  OpenMeshOpcode.MANUAL_POWER_OVERRIDE,
  OpenMeshOpcode.MANUAL_POWER_TARGET,
  OpenMeshOpcode.ERROR,
]);

const ARC_GATEWAY_LOADER_TX_OPCODES = new Set<number>([
  ArcMeshProbeOpcode.TELEMETRY_STATUS,
  ArcMeshProbeOpcode.GATEWAY_CHILD_CONFIRM,
  ArcMeshProbeOpcode.GATEWAY_DEBUG_STATUS,
  ArcHistoryOpcode.STATUS,
  ArcHistoryOpcode.RECORD,
  ArcHistoryOpcode.ACK,
  ArcHistoryOpcode.STREAM,
]);

// Metro forwards console output from a development build over the same bridge as
// telemetry. Logging every BLE packet eventually makes the debug connection the
// bottleneck, so retain one diagnostic line per source every 30 seconds.
const telemetryLogLastAt = new Map<string, number>();
const loaderWriteQueues = new Map<string, Promise<void>>();
const logTelemetry = (key: string, message: string) => {
  if (!__DEV__) return;
  const now = Date.now();
  if (now - (telemetryLogLastAt.get(key) ?? 0) < 30_000) return;
  telemetryLogLastAt.set(key, now);
  console.log(message);
};

const writeLoaderControlQueued = async (module: MeshNativeModule, nodeId: string, payload: Uint8Array) => {
  if (!module.writeLoaderControl) throw new Error('MeshManager.writeLoaderControl is not available.');
  const previous = loaderWriteQueues.get(nodeId) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(() => module.writeLoaderControl!(nodeId, toBase64(payload)));
  loaderWriteQueues.set(nodeId, pending);
  try {
    await pending;
  } finally {
    if (loaderWriteQueues.get(nodeId) === pending) loaderWriteQueues.delete(nodeId);
  }
};

type MeshNativeModule = {
  initialize?: () => Promise<void>;
  scanArcDevices?: () => Promise<MeshScanResult[]>;
  listNodes?: () => Promise<MeshNode[]>;
  connectNode?: (nodeId: string) => Promise<void>;
  disconnectNode?: (nodeId: string) => Promise<void>;
  sendVendorMessage?: (params: {
    nodeId: string;
    companyId: number;
    modelId: number;
    opcode: number;
    payloadBase64?: string;
    responseExpected?: boolean;
  }) => Promise<void>;
  writeLoaderControl?: (nodeId: string, payloadBase64: string) => Promise<void>;
  getHistorySessionState?: (nodeId: string) => Promise<string>;
  readVendorStatus?: (params: {
    nodeId: string;
    companyId: number;
    modelId: number;
    opcode: number;
  }) => Promise<{ payloadBase64?: string } | null>;
  configureProbeGatewayRoute?: (params: {
    probeNodeId: string;
    gatewayNodeId: string;
    routeMode?: 0 | 1;
    companyId: number;
    modelId: number;
  }) => Promise<{ configured?: boolean; requestAccepted?: boolean; confirmed?: boolean; detail?: string; transport?: string } | null>;
};

const meshModule = NativeModules?.MeshManager as MeshNativeModule | undefined;

const ensureModule = () => {
  if (!meshModule) {
    throw new Error('MeshManager native module not available.');
  }
  return meshModule;
};

const toLampStatusFromOpenMesh = (
  frame: OpenMeshStatusFrame,
  previous?: LampStatus | null,
  fallbackEpochSeconds?: number
): LampStatus => {
  const lampTimeEpoch = previous?.lampTimeEpoch ?? fallbackEpochSeconds ?? 0;
  const flagsRaw = frame.flagsRaw ?? 0;
  /* SPI/BLE delivery can include a status frame while the G4 ADC sample is
   * temporarily unavailable.  That is not a new temperature of zero and must
   * not erase a previously valid reading from the UI.  Each telemetry channel
   * is therefore independently sticky until it receives a newer valid value. */
  const incomingValidity = frame.telemetryValidity;
  const coreValid = incomingValidity?.coreTemp ?? Number.isFinite(frame.tempHeatsinkC);
  const boardValid = incomingValidity?.boardTemp ?? Number.isFinite(frame.tempBoardC);
  const powerValid = incomingValidity?.power ?? typeof frame.powerWatts === 'number';
  const telemetryValidity = {
    coreTemp: coreValid || previous?.telemetryValidity?.coreTemp === true,
    boardTemp: boardValid || previous?.telemetryValidity?.boardTemp === true,
    power: powerValid || previous?.telemetryValidity?.power === true,
  };
  return {
    configVersion: frame.configVersion,
    power: frame.flags.lampOn,
    intensity: previous?.intensity ?? 0,
    hue: previous?.hue ?? 0,
    pwmFreq: previous?.pwmFreq ?? 0,
    timerOn: previous?.timerOn ?? 0,
    timerOff: previous?.timerOff ?? 0,
    hueTime: previous?.hueTime ?? 0,
    hueFade: previous?.hueFade ?? 0,
    timerEnabled: frame.flags.timerEnabled,
    lampTimeEpoch,
    lampTimeSynced: frame.flags.timeValid || frame.flags.timeSynced,
    tempMcu: frame.tempMcuC,
    tempBoard: boardValid ? frame.tempBoardC : previous?.tempBoard ?? frame.tempBoardC,
    tempHeatsink: coreValid ? frame.tempHeatsinkC : previous?.tempHeatsink ?? frame.tempHeatsinkC,
    currentDraw: frame.currentMa,
    inputPowerWatts: powerValid ? frame.powerWatts : previous?.inputPowerWatts,
    displayPowerWatts: powerValid ? frame.displayPowerWatts ?? frame.powerWatts : previous?.displayPowerWatts,
    telemetryValidity,
    /* The bridge may interleave compact status frames with full status frames.
     * A compact frame has no fan bytes, so it must not erase the last valid
     * tach pair and make the UI alternate between a value and an empty readout.
     * Full status frames still replace these fields, including a nominal health
     * state after a recovered protection event. */
    extendedStatus: frame.extendedStatus === true,
    manualControl: frame.manualControl ?? previous?.manualControl,
    fan: frame.fan ?? previous?.fan,
    pwmFrequency: frame.pwmFrequency ?? previous?.pwmFrequency,
    health: frame.health ?? previous?.health,
    openMeshFlagsRaw: flagsRaw,
    openMeshFlags: {
      overrideActive: (flagsRaw & 0x01) !== 0,
      thermalShutdown: (flagsRaw & 0x02) !== 0,
      timeSynced: (flagsRaw & 0x04) !== 0,
      timeValid: (flagsRaw & 0x08) !== 0,
      thermalLimitReached: (flagsRaw & 0x10) !== 0,
      timerEnabled: (flagsRaw & 0x20) !== 0,
      lampOn: (flagsRaw & 0x40) !== 0,
      reserved: (flagsRaw & 0x80) !== 0,
    },
  };
};

const readProbeTempX100 = (data: Uint8Array, offset: number) => readInt16LE(data, offset) / 100;

const readProbePctX100 = (data: Uint8Array, offset: number) => readUint16LE(data, offset) / 100;

const probeSampleIsValid = (sampleMask: number, bit: number, status: number) => (sampleMask & bit) !== 0 && status === 0;

const decodeProbeChargeState = (statusRaw: number): ProbeSensorStatus['chargeState'] => {
  switch ((statusRaw >> 6) & 0x03) {
    case 0:
      return 'ready';
    case 1:
      return 'charging';
    case 2:
      return 'done';
    case 3:
      return 'fault';
    default:
      return null;
  }
};

const decodeProbeEnvPayload = (data: Uint8Array): ProbeSensorStatus | null => {
  if (data.length >= 6 && data.length < 20) {
    const lslodo = readUint8(data, 2);
    const foundMask = readUint8(data, 3);
    const islandStatus = readUint8(data, 4);
    if (![0x00, 0x28, 0x64, 0xa8, 0xe4].includes(lslodo) || ![0x00, 0x10, 0x11, 0x20, 0x21, 0x22, 0x30].includes(islandStatus)) {
      return null;
    }
    if (lslodo === 0 && foundMask === 0 && islandStatus === 0) return null;
    return {
      lslodoRaw: lslodo,
      sensorFoundMask: foundMask,
      sensorIslandStatusRaw: islandStatus,
      updatedAt: Date.now(),
      source: 'probe-native',
    };
  }

  if (data.length < 20) {
    return null;
  }

  const lslodo = readUint8(data, 2);
  const foundMask = readUint8(data, 3);
  const islandStatus = readUint8(data, 4);
  if (![0x00, 0x28, 0x64, 0xa8, 0xe4].includes(lslodo) || ![0x00, 0x10, 0x11, 0x20, 0x21, 0x22, 0x30].includes(islandStatus)) {
    return null;
  }

  const sampleMask = data.length >= 29 ? readUint8(data, 28) : 0;
  const shtStatus = data.length >= 30 ? readUint8(data, 29) : 0xfe;
  const bmeStatus = data.length >= 51 ? readUint8(data, 50) : 0xfe;
  const apdsStatus = data.length >= 77 ? readUint8(data, 76) : 0xfe;
  const mcuStatus = data.length >= 93 ? readUint8(data, 92) : 0xfe;
  const gasStatus = data.length >= 65 ? readUint8(data, 64) : 0;

  const shtValid = probeSampleIsValid(sampleMask, 0x01, shtStatus);
  const bmeValid = probeSampleIsValid(sampleMask, 0x02, bmeStatus);
  const bmeGasValid = (sampleMask & 0x04) !== 0 && (gasStatus & 0x30) === 0x30;
  const apdsValid = probeSampleIsValid(sampleMask, 0x08, apdsStatus);

  const status: ProbeSensorStatus = {
    lslodoRaw: lslodo,
    sensorFoundMask: foundMask,
    sensorIslandStatusRaw: islandStatus,
    updatedAt: Date.now(),
    source: 'probe-native',
  };
  let hasMeasurement = false;

  if (bmeValid && data.length >= 64) {
    status.temperatureC = readProbeTempX100(data, 52);
    status.humidityPct = readProbePctX100(data, 58);
    status.pressureHpa = readUint32LE(data, 54) / 100;
    status.bme690TemperatureC = status.temperatureC;
    status.bme690HumidityPct = status.humidityPct;
    status.bme690PressureHpa = status.pressureHpa;
    hasMeasurement = true;
  }

  if (bmeGasValid && data.length >= 72) {
    status.gasOhms = readUint32LE(data, 68);
    status.bme690GasOhms = status.gasOhms;
    hasMeasurement = true;
  }

  if (shtValid && data.length >= 38) {
    status.sht45TemperatureC = readProbeTempX100(data, 30);
    status.sht45HumidityPct = readProbePctX100(data, 32);
    hasMeasurement = true;
  }

  if (data.length >= 42) {
    status.regularSampleIntervalS = readUint16LE(data, 38);
    status.gasSampleIntervalS = readUint16LE(data, 40);
  }

  if (data.length >= 50) {
    const tscDepthValidMask = readUint8(data, 42);
    status.tscDepthValidMask = tscDepthValidMask;
    if ((tscDepthValidMask & 0x01) !== 0) {
      status.tscDepth0Delta = readUint16LE(data, 44);
      status.tscDepth0Raw = status.tscDepth0Delta;
      hasMeasurement = true;
    }
    if ((tscDepthValidMask & 0x02) !== 0) {
      status.tscDepth1Delta = readUint16LE(data, 46);
      status.tscDepth1Raw = status.tscDepth1Delta;
      hasMeasurement = true;
    }
    if ((tscDepthValidMask & 0x04) !== 0) {
      status.tscDepth2Delta = readUint16LE(data, 48);
      status.tscDepth2Raw = status.tscDepth2Delta;
      hasMeasurement = true;
    }
  }

  if (apdsValid && data.length >= 92) {
    status.lightRedRaw = readUint32LE(data, 80);
    status.lightGreenRaw = readUint32LE(data, 84);
    status.lightBlueRaw = readUint32LE(data, 88);
    status.lightLux = status.lightGreenRaw;
    hasMeasurement = true;
  }

  if (mcuStatus === 0 && data.length >= 98) {
    status.mcuTemperatureC = readProbeTempX100(data, 96);
    hasMeasurement = true;
  }

  if (data.length >= 100) {
    status.earthTemperatureRaw = readUint16LE(data, 98);
    if (status.earthTemperatureRaw !== 0) hasMeasurement = true;
  } else if (data.length >= 8) {
    status.earthTemperatureRaw = readUint16LE(data, 6);
    if (status.earthTemperatureRaw !== 0) hasMeasurement = true;
  }

  if (data.length >= 108) {
    const pmicStatusRaw = readUint8(data, 100);
    const pmicFaultRaw = readUint8(data, 101);
    const pmicVbmonRaw = readUint8(data, 102);
    const batteryPctRaw = readUint8(data, 103);
    const pmicFlagsRaw = readUint8(data, 104);
    const pmicChargeControlRaw = readUint8(data, 105);
    const pmicVbatregRaw = readUint8(data, 106);
    const pmicSysRaw = readUint8(data, 107);
    const batteryEstimateValid = (pmicFlagsRaw & 0x80) !== 0;
    const pmicPopulated = [pmicStatusRaw, pmicFaultRaw, pmicVbmonRaw, pmicFlagsRaw, pmicChargeControlRaw, pmicVbatregRaw, pmicSysRaw].some(
      (value) => value !== 0
    );
    if (pmicPopulated) {
      status.pmicStatusRaw = pmicStatusRaw;
      status.pmicFaultRaw = pmicFaultRaw;
      status.pmicVbmonRaw = pmicVbmonRaw;
      status.batteryPct = batteryEstimateValid && batteryPctRaw !== 0xff ? batteryPctRaw : null;
      status.batteryEstimateValid = batteryEstimateValid;
      status.charging = (pmicFlagsRaw & 0x01) !== 0;
      status.chargeState = decodeProbeChargeState(pmicStatusRaw);
      status.pmicFlagsRaw = pmicFlagsRaw;
      status.pmicChargeControlRaw = pmicChargeControlRaw;
      status.pmicVbatregRaw = pmicVbatregRaw;
      status.pmicSysRaw = pmicSysRaw;
      hasMeasurement = true;
    }
  }

  return foundMask !== 0 || sampleMask !== 0 || hasMeasurement ? status : null;
};

const toProbeStatusFromArcTelemetry = (frame: ArcProbeTelemetryStatus): ProbeSensorStatus => ({
  temperatureC: frame.bme690TemperatureC,
  humidityPct: frame.bme690HumidityPct,
  pressureHpa: frame.bme690PressureHpa,
  gasOhms: frame.bme690GasOhms,
  bme690TemperatureC: frame.bme690TemperatureC,
  bme690HumidityPct: frame.bme690HumidityPct,
  bme690PressureHpa: frame.bme690PressureHpa,
  bme690GasOhms: frame.bme690GasOhms,
  sht45TemperatureC: frame.sht45TemperatureC,
  sht45HumidityPct: frame.sht45HumidityPct,
  earthTemperatureC: frame.earthTemperatureC,
  earthTemperatureRaw: frame.earthTemperatureRaw,
  regularSampleIntervalS: frame.regularSampleIntervalS,
  gasSampleIntervalS: frame.gasSampleIntervalS,
  lslodoRaw: frame.lslodoRaw,
  sensorFoundMask: frame.sensorFoundMask,
  tscDepthValidMask: frame.tscDepthValidMask,
  tscDepth0Raw: frame.tscDepth0Raw,
  tscDepth1Raw: frame.tscDepth1Raw,
  tscDepth2Raw: frame.tscDepth2Raw,
  lightRedRaw: frame.lightRedRaw,
  lightGreenRaw: frame.lightGreenRaw,
  lightBlueRaw: frame.lightBlueRaw,
  lightLux: frame.lightIntensityRaw,
  lightIntensityRaw: frame.lightIntensityRaw,
  bme690GasDiagRaw: frame.bme690GasDiagRaw,
  apds9253SampleStatusRaw: frame.apds9253SampleStatusRaw,
  batteryPct: frame.batteryPct,
  batteryEstimateValid: frame.batteryPct !== null,
  charging: ((frame.pmicStatusRaw >> 6) & 0x03) === 1,
  chargeState: decodeProbeChargeState(frame.pmicStatusRaw),
  pmicStatusRaw: frame.pmicStatusRaw,
  pmicFaultRaw: frame.pmicFaultRaw,
  pmicVbmonRaw: frame.pmicVbmonRaw,
  pmicFlagsRaw: frame.pmicFlagsRaw,
  pmicChargeControlRaw: frame.pmicChargeControlRaw,
  pmicSysRaw: frame.pmicSysRaw,
  updatedAt: Date.now(),
  source: 'gateway-thread',
});

const fallbackLampStatusForProbeTelemetry = (previous?: LampStatus | null): LampStatus => ({
  configVersion: previous?.configVersion ?? 0,
  power: previous?.power ?? false,
  intensity: previous?.intensity ?? 0,
  hue: previous?.hue ?? 0,
  pwmFreq: previous?.pwmFreq ?? 0,
  timerOn: previous?.timerOn ?? 0,
  timerOff: previous?.timerOff ?? 0,
  hueTime: previous?.hueTime ?? 0,
  hueFade: previous?.hueFade ?? 0,
  timerEnabled: previous?.timerEnabled ?? false,
  lampTimeEpoch: previous?.lampTimeEpoch ?? 0,
  lampTimeSynced: previous?.lampTimeSynced ?? false,
  tempMcu: previous?.tempMcu ?? 0,
  tempBoard: previous?.tempBoard ?? 0,
  tempHeatsink: previous?.tempHeatsink ?? 0,
  currentDraw: previous?.currentDraw ?? 0,
  inputPowerWatts: previous?.inputPowerWatts,
  telemetryValidity: previous?.telemetryValidity,
  fan: previous?.fan,
  openMeshFlagsRaw: previous?.openMeshFlagsRaw ?? 0,
  openMeshFlags: previous?.openMeshFlags ?? {
    overrideActive: false,
    thermalShutdown: false,
    timeSynced: false,
    timeValid: false,
    thermalLimitReached: false,
    timerEnabled: false,
    lampOn: false,
    reserved: false,
  },
});

const describeProbeEnvDecodeDrop = (nodeId: string, data: Uint8Array) => {
  const lslodo = data.length > 2 ? readUint8(data, 2) : null;
  const found = data.length > 3 ? readUint8(data, 3) : null;
  const status = data.length > 4 ? readUint8(data, 4) : null;
  const sample = data.length > 28 ? readUint8(data, 28) : null;
  const prefix = Array.from(data.slice(0, 40), (value) => value.toString(16).padStart(2, '0')).join('');
  logTelemetry(`probe-env-drop:${nodeId}`,
    `[ProbeDirect][ENV][DROP] node=${nodeId} len=${data.length} lslodo=${lslodo ?? 'n/a'} found=${found ?? 'n/a'} status=${status ?? 'n/a'} sample=${sample ?? 'n/a'} hex=${prefix}`
  );
};

const formatProbeEnvHealth = (probeStatus: ProbeSensorStatus) => {
  const found = typeof probeStatus.sensorFoundMask === 'number' ? `0x${probeStatus.sensorFoundMask.toString(16).padStart(2, '0')}` : 'n/a';
  const island = typeof probeStatus.sensorIslandStatusRaw === 'number' ? `0x${probeStatus.sensorIslandStatusRaw.toString(16).padStart(2, '0')}` : 'n/a';
  const lslodo = typeof probeStatus.lslodoRaw === 'number' ? `0x${probeStatus.lslodoRaw.toString(16).padStart(2, '0')}` : 'n/a';
  return `lslodo=${lslodo} found=${found} status=${island}`;
};

const decodeAsciiTraceLine = (data: Uint8Array) => {
  if (!data.length) return null;
  let text = '';
  for (let index = 0; index < data.length; index += 1) {
    const value = data[index];
    if (value === 0x0d || value === 0x0a || value === 0x09 || (value >= 0x20 && value <= 0x7e)) {
      text += String.fromCharCode(value);
    } else {
      return null;
    }
  }
  const trimmed = text.trim();
  return trimmed.length ? trimmed : null;
};

const sendVendorMessage = async (
  nodeId: string,
  opcode: number,
  payload?: Uint8Array,
  responseExpected = false
) => {
  const module = ensureModule();
  if (!module.sendVendorMessage) {
    throw new Error('MeshManager.sendVendorMessage is not available.');
  }
  const payloadLength = payload?.length ?? 0;
  const appOpcode = payloadLength > 0 ? payload?.[0] ?? opcode : opcode;
  const isOpenMeshFrame = payloadLength > 0 && appOpcode === opcode && OPEN_MESH_WRAPPED_OPCODES.has(opcode);
  const meshOpcode = isOpenMeshFrame ? ARC_OPEN_MESH_VENDOR_WRAPPER_OPCODE : opcode;
  const localBleNodeId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(nodeId) || /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(nodeId);
  try {
    // Local ARC entries use CoreBluetooth UUIDs; commissioned ST Mesh nodes
    // use normalized mesh UUIDs/unicast addresses. Sending a CoreBluetooth ID
    // to the mesh vendor model can never resolve. The WBA app-facing service
    // accepts the same OpenMesh application frames directly on Loader RX.
    if (isOpenMeshFrame && localBleNodeId && module.writeLoaderControl && payload) {
      await writeLoaderControlQueued(module, nodeId, payload);
      logTelemetry(
        `loader-tx:${nodeId}:${appOpcode}`,
        `[LampTX][BLE] node=${nodeId} appOp=0x${appOpcode.toString(16).toUpperCase()} len=${payloadLength}`
      );
      return;
    }
    await module.sendVendorMessage({
      nodeId,
      companyId: ARC_MESH_COMPANY_ID,
      modelId: ARC_MESH_MODEL_ID,
      opcode: meshOpcode,
      payloadBase64: payload ? toBase64(payload) : undefined,
      responseExpected,
    });
    logTelemetry(
      `mesh-tx:${nodeId}:${meshOpcode}:${appOpcode}`,
      `[MeshTX][OK] node=${nodeId} opcode=0x${meshOpcode.toString(16).toUpperCase()} appOp=0x${appOpcode
        .toString(16)
        .toUpperCase()} len=${payloadLength} ack=${responseExpected}`
    );
  } catch (error: any) {
    const message = String(error?.message ?? error);
    logTelemetry(
      `mesh-tx-fail:${nodeId}:${meshOpcode}:${appOpcode}:${message}`,
      `[MeshTX][FAIL] node=${nodeId} opcode=0x${meshOpcode.toString(16).toUpperCase()} appOp=0x${appOpcode
        .toString(16)
        .toUpperCase()} len=${payloadLength} ack=${responseExpected} error=${message}`
    );
    throw error;
  }
};

const readVendorStatus = async (nodeId: string, opcode: number) => {
  const module = ensureModule();
  if (!module.readVendorStatus) {
    return null;
  }
  const result = await module.readVendorStatus({
    nodeId,
    companyId: ARC_MESH_COMPANY_ID,
    modelId: ARC_MESH_MODEL_ID,
    opcode,
  });
  if (!result?.payloadBase64) return null;
  return fromBase64(result.payloadBase64);
};

/** One immutable ownership snapshot for one Loader TX notification. */
export type HistoryIngressContext =
  | Readonly<{ owner: 'NONE' }>
  | Readonly<{ owner: 'PRODUCTION'; leaseId: number; phaseGeneration?: number }>
  | Readonly<{ owner: 'DEBUG_MAILBOX'; leaseId: number; debugRunId: number }>;

export type HistorySubscriptionHandlers = {
  captureRecordContext?: (lampId: string) => HistoryIngressContext;
  onStatus?: (lampId: string, status: ArcHistoryStatus, context?: HistoryIngressContext) => void;
  onRecord?: (lampId: string, record: ArcHistoryRecord | null, context?: HistoryIngressContext) => void;
  onAck?: (lampId: string, context?: HistoryIngressContext) => void;
  onError?: (lampId: string, error: Error, context?: HistoryIngressContext) => void;
};

export const createMeshComms = () => {
  let cadenceNonce = Date.now() >>> 0;
  const requestLampCadence = (nodeId: string, seconds?: number, revision?: number): Promise<LampCadenceReply> => new Promise((resolve, reject) => {
    if (!emitter) { reject(new Error('Lamp telemetry notifications unavailable')); return; }
    const nonce = cadenceNonce = (cadenceNonce + 1) >>> 0 || 1;
    let settled = false;
    const finish = (error?: Error, reply?: LampCadenceReply) => {
      if (settled) return; settled = true; clearTimeout(timer); sub.remove();
      if (error) reject(error); else resolve(reply!);
    };
    const sub = emitter.addListener('MeshTelemetry', (event: any) => {
      if (String(event?.nodeId ?? event?.id ?? '') !== nodeId) return;
      const payload = event?.payloadBase64 ?? event?.payload ?? event?.data;
      if (!payload) return;
      const frame = fromBase64(String(payload));
      if (frame[0] !== 0x76) return;
      try {
        const reply = decodeLampCadence(frame); if (reply.nonce !== nonce) return;
        if (reply.status !== 0) { finish(new Error(`Lamp cadence rejected (status ${reply.status})`)); return; }
        if (seconds !== undefined && (!reply.persisted || reply.seconds !== seconds)) { finish(new Error('Lamp cadence was not persisted')); return; }
        finish(undefined, reply);
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    });
    const timer = setTimeout(() => finish(new Error('Lamp cadence confirmation timed out; firmware may not support it')), 10000);
    try { void writeLoaderControlQueued(ensureModule(), nodeId, encodeLampCadence(nonce, seconds, revision)).catch(error => finish(error)); }
    catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  });
  const emitter = meshModule ? new NativeEventEmitter(meshModule as any) : null;
  const lastStatusByNode = new Map<string, LampStatus>();
  const lastSetTimeEpochByNode = new Map<string, number>();
  const openMeshConfigByNode = new Map<string, OpenMeshLampConfig>();
  const openMeshConfigVersionByNode = new Map<string, number>();

  const waitForLampConfigReply = (
    nodeId: string,
    send: () => Promise<void>,
    expectedVersion?: number,
    timeoutMs = 5000
  ): Promise<OpenMeshLampConfigReply> => new Promise((resolve, reject) => {
    if (!emitter) {
      reject(new Error('Mesh telemetry event emitter is not available for Lamp config confirmation.'));
      return;
    }
    let settled = false;
    const finish = (error?: Error, reply?: OpenMeshLampConfigReply) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sub.remove();
      if (error) reject(error);
      else resolve(reply!);
    };
    const sub = emitter.addListener('MeshTelemetry', (event: any) => {
      const eventNodeId = String(event?.nodeId ?? event?.id ?? '');
      if (eventNodeId !== nodeId) return;
      const payloadBase64 = event?.payloadBase64 ?? event?.payload ?? event?.data;
      if (!payloadBase64) return;
      const data = fromBase64(String(payloadBase64));
      if (!data.length || data[0] !== OpenMeshOpcode.LAMP_CONFIG_STATUS) return;
      try {
        const reply = decodeOpenMeshLampConfigStatusFrame(data);
        if (typeof expectedVersion === 'number' && reply.configVersion !== (expectedVersion & 0xff)) return;
        openMeshConfigByNode.set(nodeId, { enabled: reply.enabled, ...reply.config });
        openMeshConfigVersionByNode.set(nodeId, reply.configVersion);
        console.log(`[Schedule][RX][SCHEMA3] node=${nodeId} version=${reply.configVersion} enabled=${reply.enabled} sunrise=${reply.config.sunriseTarget.join('/')} daylight=${reply.config.daylightTarget.join('/')} evening=${reply.config.eveningTarget.join('/')}`);
        finish(undefined, reply);
      } catch (error: any) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    const timer = setTimeout(() => {
      finish(new Error(`Timed out waiting for Lamp config response${typeof expectedVersion === 'number' ? ` v${expectedVersion & 0xff}` : ''}.`));
    }, timeoutMs);

    void send().catch((error: any) => {
      finish(error instanceof Error ? error : new Error(String(error)));
    });
  });
  const openMeshHomeStateByNode = new Map<
    string,
    {
      power: boolean;
      intensity: number;
      hue: number;
      pwmFreqHz: number;
      rampSeconds: number;
    }
  >();

  const clampU16 = (value: number) => {
    const n = Math.trunc(Number.isFinite(value) ? value : 0);
    return Math.max(0, Math.min(0xffff, n));
  };

  const defaultOpenMeshConfig = (): OpenMeshLampConfig => ({
    enabled: false,
    onMinutes: 7 * 60,
    sunriseFadeMinutes: 15,
    daylightStartMinutes: 8 * 60,
    daylightFadeMinutes: 30,
    eveningStartMinutes: 19 * 60 + 30,
    eveningFadeMinutes: 30,
    offMinutes: 22 * 60 + 30,
    nightFadeMinutes: 15,
    sunriseTarget: [45, 5, 20, 45],
    daylightTarget: [100, 70, 45, 100],
    eveningTarget: [55, 5, 35, 70],
  });

  const getOpenMeshConfig = (nodeId: string) => openMeshConfigByNode.get(nodeId) ?? defaultOpenMeshConfig();

  const clampU8 = (value: number) => {
    const n = Math.trunc(Number.isFinite(value) ? value : 0);
    return Math.max(0, Math.min(0xff, n));
  };

  const configureProbeGatewayRoute = async (
    probeNodeId: string,
    gatewayNodeId: string,
    routeMode: 0 | 1 = 1
  ) => {
    const module = ensureModule();
    if (module.configureProbeGatewayRoute) {
      console.log(`[ProbeRoute][NATIVE][BEGIN] probe=${probeNodeId} bridge=${gatewayNodeId} mode=${routeMode}`);
      const result = await module.configureProbeGatewayRoute({
        probeNodeId,
        gatewayNodeId,
        routeMode,
        companyId: ARC_MESH_COMPANY_ID,
        modelId: ARC_MESH_MODEL_ID,
      });
      console.log(`[ProbeRoute][NATIVE][RESULT] probe=${probeNodeId} bridge=${gatewayNodeId} mode=${routeMode} result=${JSON.stringify(result)}`);
      if (result?.transport !== 'ARC_BLE') throw new Error('Current ARC BLE route configuration is unavailable; no Mesh fallback was sent.');
      console.log(`[ProbeRoute][SET][DONE] probe=${probeNodeId} bridge=${gatewayNodeId} mode=${routeMode}`);
      return {
        state: (result?.requestAccepted ?? result?.configured) ? 'config-requested' as const : 'native-config-missing' as const,
        detail: result?.detail ?? 'Native mesh publication/subscription config requested.',
      };
    }

    return {
      state: 'native-config-missing' as const,
      detail: 'Native publication/subscription config API is not available yet; no simulated route-set vendor frame was sent.',
    };
  };

  const defaultHomeState = () => ({
    power: false,
    intensity: 0,
    hue: 0,
    pwmFreqHz: 10000,
    rampSeconds: 0,
  });

  const getOpenMeshHomeState = (nodeId: string) => openMeshHomeStateByNode.get(nodeId) ?? defaultHomeState();

  const applyOpenMeshHomeControl = async (
    nodeId: string,
    flags: OpenMeshHomeControlFlags,
    patch: Partial<{ power: boolean; intensity: number; hue: number; pwmFreqHz: number; rampSeconds: number }>
  ) => {
    const current = getOpenMeshHomeState(nodeId);
    const next = {
      power: patch.power ?? current.power,
      intensity: clampLampIntensity(patch.intensity ?? current.intensity),
      hue: clampU16(patch.hue ?? current.hue),
      pwmFreqHz: clampU16(patch.pwmFreqHz ?? current.pwmFreqHz),
      rampSeconds: clampU16(patch.rampSeconds ?? current.rampSeconds),
    };

    const txFrame = encodeOpenMeshHomeScreenControlFrame({
      opcode: OpenMeshOpcode.HOMESCREEN_CONTROL,
      flags,
      power: next.power,
      intensity: next.intensity,
      hue: next.hue,
      pwmFreqHz: next.pwmFreqHz,
      rampSeconds: next.rampSeconds,
      reserved: 0,
    });

    const hex = Array.from(txFrame)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(' ')
      .toUpperCase();
    console.log(`[ArcLegacy][HOMESCREEN_CONTROL][TX] node=${nodeId} bytes=${hex}`);

    await openMesh.setHomeScreenControl(nodeId, {
      flags,
      power: next.power,
      intensity: next.intensity,
      hue: next.hue,
      pwmFreqHz: next.pwmFreqHz,
      rampSeconds: next.rampSeconds,
      reserved: 0,
    });

    openMeshHomeStateByNode.set(nodeId, next);
    const previous = lastStatusByNode.get(nodeId);
    if (previous) {
      lastStatusByNode.set(nodeId, {
        ...previous,
        power: flags.power ? next.power : previous.power,
        intensity: flags.intensity ? next.intensity : previous.intensity,
        hue: flags.hue ? next.hue : previous.hue,
        pwmFreq: flags.pwmFreq ? next.pwmFreqHz : previous.pwmFreq,
      });
    }
  };

  const getNextOpenMeshVersion = (nodeId: string) => {
    const current = openMeshConfigVersionByNode.get(nodeId) ?? 0;
    return (current + 1) & 0xff;
  };

  const writeOpenMeshConfigV3 = async (nodeId: string, configVersion: number, config: OpenMeshLampConfig) => {
    const version = configVersion & 0xff;
    const payload = encodeOpenMeshSetLampConfigFrame(version, config);
    const payloadHex = Array.from(payload)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(' ')
      .toUpperCase();
    console.log(`[Schedule][TX][SCHEMA3] node=${nodeId} version=${version} len=${payload.length} bytes=${payloadHex}`);
    const reply = await waitForLampConfigReply(
      nodeId,
      () => sendVendorMessage(nodeId, OpenMeshOpcode.SET_LAMP_CONFIG, payload, false),
      version
    );
    return reply;
  };

  const readOpenMeshConfigV3 = async (nodeId: string) => {
    const payload = encodeOpenMeshGetLampConfigFrame();
    console.log(`[Schedule][FETCH][SCHEMA3_TX] node=${nodeId} bytes=32 03`);
    return waitForLampConfigReply(
      nodeId,
      () => sendVendorMessage(nodeId, OpenMeshOpcode.GET_LAMP_CONFIG, payload, false)
    );
  };

  const applyOpenMeshConfig = async (nodeId: string, patch: Partial<OpenMeshLampConfig>) => {
    // Partial convenience setters must never invent the rest of a durable
    // schema-3 schedule. If this process has no confirmed cache yet, fetch the
    // Lamp's persisted config first and patch that complete record.
    if (!openMeshConfigByNode.has(nodeId)) {
      await readOpenMeshConfigV3(nodeId);
    }
    const current = getOpenMeshConfig(nodeId);
    const nextConfig: OpenMeshLampConfig = {
      ...current,
      ...patch,
      sunriseTarget: patch.sunriseTarget ?? current.sunriseTarget,
      daylightTarget: patch.daylightTarget ?? current.daylightTarget,
      eveningTarget: patch.eveningTarget ?? current.eveningTarget,
    };
    const version = getNextOpenMeshVersion(nodeId);
    return writeOpenMeshConfigV3(nodeId, version, nextConfig);
  };

  const openMesh = createOpenMeshClient({
    send: async ({ nodeId, opcode, payload, responseExpected }) => {
      await sendVendorMessage(nodeId, opcode, payload, responseExpected);
    },
    readStatus: async ({ nodeId, opcode }) => {
      return readVendorStatus(nodeId, opcode);
    },
  });

  const readStatusWithOpenMesh = async (nodeId: string) => {
    const version = openMeshConfigVersionByNode.get(nodeId) ?? 0;
    const request = encodeOpenMeshGetStatusFrame(version);
    const reqHex = Array.from(request)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(' ')
      .toUpperCase();
    console.log(`[ArcLegacy][GET_STATUS][TX] node=${nodeId} version=${version} bytes=${reqHex}`);

    const statusFrame = await openMesh.getStatus(nodeId, version);
    if (!statusFrame) {
      return lastStatusByNode.get(nodeId) ?? null;
    }

    const merged = toLampStatusFromOpenMesh(statusFrame, lastStatusByNode.get(nodeId), lastSetTimeEpochByNode.get(nodeId));
    lastStatusByNode.set(nodeId, merged);
    return merged;
  };

  return {
    isAvailable: Boolean(meshModule),
    initialize: async () => {
      const module = ensureModule();
      if (module.initialize) {
        await module.initialize();
      }
    },
    scanArcDevices: async () => {
      const module = ensureModule();
      if (Platform.OS === 'android') {
        const permissions = Number(Platform.Version) >= 31
          ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
          : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
        const grants = await PermissionsAndroid.requestMultiple(permissions);
        if (permissions.some(permission => grants[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
          throw new Error('Bluetooth permission is required to discover ARC devices.');
        }
      }
      if (!module.scanArcDevices) throw new Error('Current ARC BLE discovery is unavailable.');
      return module.scanArcDevices();
    },
    listProvisionedNodes: async () => {
      const module = ensureModule();
      if (!module.listNodes) return [];
      return module.listNodes();
    },
    connectNode: async (nodeId: string) => {
      const module = ensureModule();
      if (module.connectNode) {
        await module.connectNode(nodeId);
      }
    },
    disconnectNode: async (nodeId: string) => {
      const module = ensureModule();
      if (module.disconnectNode) {
        await module.disconnectNode(nodeId);
      }
      openMesh.cancelNode(nodeId);
      lastStatusByNode.delete(nodeId);
      lastSetTimeEpochByNode.delete(nodeId);
      openMeshConfigByNode.delete(nodeId);
      openMeshConfigVersionByNode.delete(nodeId);
      openMeshHomeStateByNode.delete(nodeId);
    },
    setPower: async (nodeId: string, value: boolean) => {
      await applyOpenMeshHomeControl(nodeId, { power: true }, { power: value });
    },
    setIntensity: async (nodeId: string, value: number) => {
      await applyOpenMeshHomeControl(nodeId, { intensity: true }, { intensity: value });
    },
    setHue: async (nodeId: string, value: number) => {
      await applyOpenMeshHomeControl(nodeId, { hue: true }, { hue: value });
    },
    setPwmFreq: async (nodeId: string, value: number) => {
      await applyOpenMeshHomeControl(nodeId, { pwmFreq: true }, { pwmFreqHz: value });
    },
    setTimerOn: async (nodeId: string, minutes: number) => {
      return applyOpenMeshConfig(nodeId, { onMinutes: Math.trunc(minutes) });
    },
    setTimerOff: async (nodeId: string, minutes: number) => {
      return applyOpenMeshConfig(nodeId, { offMinutes: Math.trunc(minutes) });
    },
    setTimerEnable: async (nodeId: string, enabled: boolean) => {
      // Schema 3 makes enablement part of the complete durable configuration.
      return applyOpenMeshConfig(nodeId, { enabled });
    },
    setTimeEpoch: async (nodeId: string, epochSeconds: number) => {
      const safeEpoch = Math.max(0, Math.trunc(epochSeconds));
      await openMesh.setTime(nodeId, {
        configVersion: 0,
        epochSeconds: safeEpoch,
      });
      lastSetTimeEpochByNode.set(nodeId, safeEpoch);
    },
    readStatus: async (nodeId: string) => readStatusWithOpenMesh(nodeId),
    setScheduleConfigV3: async (nodeId: string, configVersion: number, input: OpenMeshLampConfig & { schema?: number }) => {
      if (typeof input.schema === 'number' && input.schema !== 3) {
        throw new Error(`Unsupported Lamp schedule schema ${input.schema}; expected schema 3.`);
      }
      return writeOpenMeshConfigV3(nodeId, configVersion, input);
    },
    setOpenMeshConfigV3: async (nodeId: string, configVersion: number, input: OpenMeshLampConfig & { schema?: number }) => {
      if (typeof input.schema === 'number' && input.schema !== 3) {
        throw new Error(`Unsupported Lamp schedule schema ${input.schema}; expected schema 3.`);
      }
      return writeOpenMeshConfigV3(nodeId, configVersion, input);
    },
    setOpenMeshConfig: async (nodeId: string, configVersion: number, input: OpenMeshLampConfig & { schema?: number }) => {
      if (typeof input.schema === 'number' && input.schema !== 3) {
        throw new Error(`Unsupported Lamp schedule schema ${input.schema}; expected schema 3.`);
      }
      return writeOpenMeshConfigV3(nodeId, configVersion, input);
    },
    readScheduleConfigV3: async (nodeId: string) => readOpenMeshConfigV3(nodeId),
    readOpenMeshConfigV3: async (nodeId: string) => readOpenMeshConfigV3(nodeId),
    readPersistedOpenMeshConfig: async (nodeId: string) => readOpenMeshConfigV3(nodeId),
    readOpenMeshConfig: async (nodeId: string) => readOpenMeshConfigV3(nodeId),
    setOpenMeshHomeControl: async (nodeId: string, input: {
      power?: boolean;
      intensity?: number;
      hue?: number;
      pwmFreqHz?: number;
      rampSeconds?: number;
    }) => {
      const flagsValue = encodeOpenMeshHomeControlFlags({
        power: typeof input.power === 'boolean',
        intensity: typeof input.intensity === 'number',
        hue: typeof input.hue === 'number',
        pwmFreq: typeof input.pwmFreqHz === 'number',
      });

      if (flagsValue === 0) {
        return;
      }

      await applyOpenMeshHomeControl(
        nodeId,
        {
          power: typeof input.power === 'boolean',
          intensity: typeof input.intensity === 'number',
          hue: typeof input.hue === 'number',
          pwmFreq: typeof input.pwmFreqHz === 'number',
        },
        {
          power: input.power,
          intensity: input.intensity,
          hue: input.hue,
          pwmFreqHz: input.pwmFreqHz,
          rampSeconds: input.rampSeconds,
        }
      );
    },
    sendOpenMeshConfigPayload: async (nodeId: string, configVersion: number, config: OpenMeshLampConfig) => {
      return writeOpenMeshConfigV3(nodeId, configVersion, config);
    },
    setManualChannelControl: async (nodeId: string, control: OpenMeshManualChannelControl) => {
      const payload = encodeOpenMeshManualChannelControlFrame(control);
      const module = ensureModule();
      await writeLoaderControlQueued(module, nodeId, payload);
    },
    setManualPowerTarget: async (nodeId: string, control: OpenMeshManualPowerTargetControl) => {
      const payload = encodeOpenMeshManualPowerTargetFrame(control);
      const module = ensureModule();
      await writeLoaderControlQueued(module, nodeId, payload);
    },
    setManualFanControl: async (nodeId: string, control: OpenMeshManualFanControl) => {
      const payload = encodeOpenMeshManualFanControlFrame(control);
      const module = ensureModule();
      await writeLoaderControlQueued(module, nodeId, payload);
    },
    preparePwmFrequency: async (nodeId: string, control: OpenMeshManualFrequencyControl) => {
      const payload = encodeOpenMeshPreparePwmFrequencyFrame(control);
      const module = ensureModule();
      await writeLoaderControlQueued(module, nodeId, payload);
    },
    setManualLampPower: async (nodeId: string, control: OpenMeshManualPowerControl) => {
      const payload = encodeOpenMeshManualPowerControlFrame(control);
      const module = ensureModule();
      await writeLoaderControlQueued(module, nodeId, payload);
    },
    getHistorySessionState: async (nodeId: string): Promise<string> => {
      const module = ensureModule();
      return module.getHistorySessionState ? module.getHistorySessionState(nodeId) : 'UNKNOWN';
    },
    requestHistoryStatus: async (nodeId: string) => {
      const module = ensureModule();
      await writeLoaderControlQueued(module, nodeId, encodeArcHistoryStatusGet());
    },
    requestLampCadence,
    requestHistoryAfter: async (nodeId: string, sequence: number) => {
      const module = ensureModule();
      await writeLoaderControlQueued(module, nodeId, encodeArcHistoryGetAfter(sequence));
    },
    requestHistoryBatch: async (
      nodeId: string,
      afterSequence: number,
      headSequence: number,
      limit = 8,
    ) => {
      const module = ensureModule();
      await writeLoaderControlQueued(
        module,
        nodeId,
        encodeArcHistoryGetBatch(afterSequence, headSequence, limit),
      );
    },
    acknowledgeHistoryThrough: async (nodeId: string, sequence: number) => {
      const module = ensureModule();
      await writeLoaderControlQueued(module, nodeId, encodeArcHistoryAck(sequence));
    },
    subscribeHistory: (handlers: HistorySubscriptionHandlers) => {
      if (!emitter) return () => undefined;
      const sub = emitter.addListener('MeshTelemetry', (event: any) => {
        const nodeId = String(event?.nodeId ?? event?.id ?? '');
        const payloadBase64 = event?.payloadBase64 ?? event?.payload ?? event?.data;
        if (!nodeId || !payloadBase64) return;
        const data = fromBase64(String(payloadBase64));
        if (![ArcHistoryOpcode.STATUS, ArcHistoryOpcode.RECORD, ArcHistoryOpcode.ACK, ArcHistoryOpcode.STREAM].includes(data[0])) return;
        const recordContext: HistoryIngressContext = Object.freeze(handlers.captureRecordContext?.(nodeId) ?? { owner: 'NONE' });
        try {
          if (data[0] === ArcHistoryOpcode.STATUS) handlers.onStatus?.(nodeId, decodeArcHistoryStatus(data), recordContext);
          if (data[0] === ArcHistoryOpcode.RECORD) handlers.onRecord?.(nodeId, decodeArcHistoryRecord(data), recordContext);
          if (data[0] === ArcHistoryOpcode.ACK) { decodeArcHistoryAck(data); handlers.onAck?.(nodeId, recordContext); }
          if (data[0] === ArcHistoryOpcode.STREAM) {
            // Ownership changes may affect future notifications only; they must
            // never reclassify records from an already-decoded notification.
            // Decode every physical record (including CRC) before dispatch.
            for (const record of decodeArcHistoryStream(data)) {
              handlers.onRecord?.(nodeId, record, recordContext);
            }
          }
        } catch (error: any) {
          handlers.onError?.(nodeId, error instanceof Error ? error : new Error(String(error)), recordContext);
        }
      });
      return () => sub.remove();
    },
    configureProbeGatewayRoute,
    subscribeTelemetry: (onStatus: (nodeId: string, status: LampStatus, probeStatus?: ProbeSensorStatus | null) => void) => {
      if (!emitter) return () => undefined;
      const sub = emitter.addListener('MeshTelemetry', (event: any) => {
        const nodeId = String(event?.nodeId ?? event?.id ?? '');
        if (!nodeId) return;
        const payloadBase64 = event?.payloadBase64 ?? event?.payload ?? event?.data;
        const probePayloadBase64 = event?.probeEnvBase64 ?? event?.probePayloadBase64;
        const probeEnvData = probePayloadBase64 ? fromBase64(String(probePayloadBase64)) : new Uint8Array();
        let probeStatus = probeEnvData.length ? decodeProbeEnvPayload(probeEnvData) : null;
        if (probeEnvData.length && !probeStatus) {
          describeProbeEnvDecodeDrop(nodeId, probeEnvData);
        }
        const rssi = Number(event?.rssi);
        // RSSI by itself is link metadata, not a Probe sample. In particular,
        // when the app is connected through a Lamp it is the Lamp's RSSI.
        if (probeStatus && Number.isFinite(rssi)) {
          probeStatus = {
            ...probeStatus,
            linkRssiDbm: rssi,
          };
        }
        if (probeStatus?.source === 'probe-native') {
          logTelemetry(`probe-env:${nodeId}`,
            `[ProbeDirect][ENV][RX] node=${nodeId} temp=${probeStatus.bme690TemperatureC ?? probeStatus.sht45TemperatureC ?? 'n/a'} rh=${probeStatus.bme690HumidityPct ?? probeStatus.sht45HumidityPct ?? 'n/a'} battery=${probeStatus.batteryPct ?? 'n/a'} ${formatProbeEnvHealth(probeStatus)} rssi=${probeStatus.linkRssiDbm ?? 'n/a'}`
          );
        }
        if (!payloadBase64) {
          if (probeStatus) {
            onStatus(nodeId, fallbackLampStatusForProbeTelemetry(lastStatusByNode.get(nodeId)), probeStatus);
          }
          return;
        }
        const data = fromBase64(payloadBase64);
        if (!data.length) {
          if (probeStatus) {
            onStatus(nodeId, fallbackLampStatusForProbeTelemetry(lastStatusByNode.get(nodeId)), probeStatus);
          }
          return;
        }
        if (ARC_GATEWAY_LOADER_TX_OPCODES.has(data[0])) {
          if (probeStatus) {
            onStatus(nodeId, fallbackLampStatusForProbeTelemetry(lastStatusByNode.get(nodeId)), probeStatus);
          }
          return;
        }
        // Full schema-3 config replies are consumed by the one-shot config
        // waiter above; they are not status telemetry and must not be decoded
        // as 0x03 status frames here.
        if (data[0] === OpenMeshOpcode.LAMP_CONFIG_STATUS) return;
        try {
          const frame = decodeOpenMeshStatusFrame(data);
          const merged = toLampStatusFromOpenMesh(frame, lastStatusByNode.get(nodeId), lastSetTimeEpochByNode.get(nodeId));
          lastStatusByNode.set(nodeId, merged);
          const validity = merged.telemetryValidity;
          logTelemetry(
            `lamp-telemetry:${nodeId}`,
            `[LampTelemetry][RX] node=${nodeId} len=${data.length} core=${validity?.coreTemp === false ? 'n/a' : merged.tempHeatsink.toFixed(1)}C board=${validity?.boardTemp === false ? 'n/a' : merged.tempBoard.toFixed(1)}C mcu=${merged.tempMcu.toFixed(1)}C power=${validity?.power === false || typeof merged.inputPowerWatts !== 'number' ? 'n/a' : `${merged.inputPowerWatts.toFixed(1)}W`} current=${merged.currentDraw}mA fan=${merged.fan?.tachPresent ? `${Math.round(merged.fan.rpm)}rpm` : 'n/a'} flags=0x${(merged.openMeshFlagsRaw ?? 0).toString(16).padStart(2, '0')}`
          );
          onStatus(nodeId, merged, probeStatus);
        } catch {
          if (probeStatus) {
            onStatus(nodeId, fallbackLampStatusForProbeTelemetry(lastStatusByNode.get(nodeId)), probeStatus);
          }
        }
      });
      return () => sub.remove();
    },
    subscribeProbeGatewayConfirmation: (
      onConfirm: (gatewayNodeId: string, confirmation: ArcProbeGatewayChildConfirmation) => void,
      onTelemetry?: (gatewayNodeId: string, probeStatus: ProbeSensorStatus, frame: ArcProbeTelemetryStatus) => void,
      onGatewayDebug?: (gatewayNodeId: string, status: ArcGatewayDebugStatus) => void
    ) => {
      if (!emitter) return () => undefined;
      const sub = emitter.addListener('MeshTelemetry', (event: any) => {
        const gatewayNodeId = String(event?.nodeId ?? event?.id ?? '');
        if (!gatewayNodeId) return;
        const payloadBase64 = event?.payloadBase64 ?? event?.payload ?? event?.data;
        if (!payloadBase64) return;
        const data = fromBase64(String(payloadBase64));
        if (!data.length) return;
        const traceLine = decodeAsciiTraceLine(data);
        if (traceLine) {
          logTelemetry(`gateway-trace:${gatewayNodeId}`, `[GatewayTrace][TXT] gateway=${gatewayNodeId} ${traceLine}`);
          return;
        }
        if (data[0] === ArcMeshProbeOpcode.GATEWAY_DEBUG_STATUS) {
          try {
            const status = decodeArcGatewayDebugStatusFrame(data);
            logTelemetry(`gateway-debug:${gatewayNodeId}`,
              `[GatewayDebug][RX] gateway=${gatewayNodeId} status=${status.status} role=${status.otRole} udp=${status.udpBound} rx=${status.threadRxCount} seq=${status.threadRxLastSequence} policy=${status.observedProbeRolePolicy} routePub=${status.appRoutePublishCountLow}/${status.appRoutePublishSuccessCountLow}/${status.appRoutePublishFailCountLow} result=${status.appRouteLastResultLow}`
            );
            onGatewayDebug?.(gatewayNodeId, status);
          } catch (error: any) {
            logTelemetry(`gateway-debug-drop:${gatewayNodeId}`, `[GatewayDebug][DROP] gateway=${gatewayNodeId} reason=${String(error?.message ?? error)} len=${data.length}`);
          }
          return;
        }
        if (data[0] === ArcMeshProbeOpcode.TELEMETRY_STATUS) {
          try {
            const frame = decodeArcProbeTelemetryStatusFrame(data);
            const probeStatus = toProbeStatusFromArcTelemetry(frame);
            logTelemetry(`probe-route-telemetry:${gatewayNodeId}`,
              `[ProbeRoute][TELEMETRY][RX] gateway=${gatewayNodeId} seq=${frame.sequence} temp=${frame.bme690TemperatureC.toFixed(1)}C rh=${frame.bme690HumidityPct.toFixed(1)}% battery=${frame.batteryPct ?? 'n/a'}`
            );
            onTelemetry?.(gatewayNodeId, probeStatus, frame);
          } catch (error: any) {
            logTelemetry(`probe-route-telemetry-drop:${gatewayNodeId}`, `[ProbeRoute][TELEMETRY][DROP] gateway=${gatewayNodeId} reason=${String(error?.message ?? error)} len=${data.length}`);
          }
          return;
        }
        if (data[0] !== ArcMeshProbeOpcode.GATEWAY_CHILD_CONFIRM) return;
        try {
          const confirmation = decodeArcProbeGatewayChildConfirmationFrame(data);
          logTelemetry(`probe-route-confirm:${gatewayNodeId}`,
            `[ProbeRoute][CONFIRM][RX] gateway=${gatewayNodeId} probe=0x${confirmation.probeSourceAddress
              .toString(16)
              .padStart(4, '0')} confirmed=${confirmation.confirmed} seq=${confirmation.lastProbeSequence}`
          );
          onConfirm(gatewayNodeId, confirmation);
        } catch (error: any) {
          logTelemetry(`probe-route-confirm-drop:${gatewayNodeId}`, `[ProbeRoute][CONFIRM][DROP] gateway=${gatewayNodeId} reason=${String(error?.message ?? error)} len=${data.length}`);
        }
      });
      return () => sub.remove();
    },
    subscribeConnection: (onChange: (nodeId: string, connected: boolean) => void) => {
      if (!emitter) return () => undefined;
      const sub = emitter.addListener('MeshConnection', (event: any) => {
        const nodeId = String(event?.nodeId ?? event?.id ?? '');
        if (!nodeId) return;
        const connected = Boolean(event?.connected);
        onChange(nodeId, connected);
      });
      return () => sub.remove();
    },
    subscribeProvisioningDebug: (onDebug: (nodeId: string | null, message: string) => void) => {
      if (!emitter) return () => undefined;
      const sub = emitter.addListener('MeshProvisioningDebug', (event: any) => {
        const nodeId = event?.nodeId ? String(event.nodeId) : null;
        const message = String(event?.message ?? '').trim();
        if (!message) return;
        onDebug(nodeId, message);
      });
      return () => sub.remove();
    },

  };
};

export * from './openMeshProtocol';
export * from './openMeshQueue';
export * from './openMeshClient';
export * from './arcMeshProtocol';
