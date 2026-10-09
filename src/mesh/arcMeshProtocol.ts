import {
  readInt16LE,
  readUint16LE,
  readUint32LE,
  readUint8,
} from '../protocol/valueCodec';

export const ARC_MESH_COMPANY_ID = 0x1234;
export const ARC_MESH_MODEL_ID = 0x0001;
export const ARC_OPEN_MESH_VENDOR_WRAPPER_OPCODE = 0x27;

export enum ArcMeshProbeOpcode {
  TELEMETRY_STATUS = 0x51,
  GATEWAY_ROUTE_SET = 0x52,
  SETTINGS_GET = 0x53,
  SETTINGS_STATUS = 0x54,
  SETTINGS_SET = 0x55,
  GATEWAY_CHILD_CONFIRM = 0x56,
  GATEWAY_DEBUG_STATUS = 0x57,
}

export const ARC_PROBE_TELEMETRY_PAYLOAD_VERSION = 0x02;
export const ARC_PROBE_TELEMETRY_PAYLOAD_LEN = 80;
export const ARC_PROBE_GATEWAY_ROUTE_PAYLOAD_VERSION = 0x01;
export const ARC_PROBE_GATEWAY_ROUTE_NODE_ID_MAX_LEN = 24;
export const ARC_PROBE_GATEWAY_CONFIRM_PAYLOAD_VERSION = 0x01;
export const ARC_PROBE_GATEWAY_CONFIRM_PAYLOAD_LEN = 32;
export const ARC_GATEWAY_DEBUG_STATUS_PAYLOAD_VERSION = 0x02;
export const ARC_GATEWAY_DEBUG_STATUS_PAYLOAD_LEN = 48;

export type ArcProbeTelemetryStatus = {
  opcode: ArcMeshProbeOpcode.TELEMETRY_STATUS;
  payloadVersion: number;
  payloadLength: number;
  sequence: number;
  tickMs: number;
  regularSampleIntervalS: number;
  gasSampleIntervalS: number;
  batteryPct: number | null;
  pmicStatusRaw: number;
  pmicFaultRaw: number;
  pmicVbmonRaw: number;
  pmicFlagsRaw: number;
  pmicChargeControlRaw: number;
  pmicSysRaw: number;
  lslodoRaw: number;
  sensorValidMask: number;
  sensorErrorMask: number;
  sensorFoundMask: number;
  tscDepthValidMask: number;
  tscDepth0Raw: number;
  tscDepth1Raw: number;
  tscDepth2Raw: number;
  sht45TemperatureC: number;
  sht45HumidityPct: number;
  bme690TemperatureC: number;
  bme690PressureHpa: number;
  bme690HumidityPct: number;
  bme690GasOhms: number;
  soilTemperatureC: number;
  earthTemperatureC: number;
  soilThermistorRaw: number;
  earthTemperatureRaw: number;
  lightRedRaw: number;
  lightGreenRaw: number;
  lightBlueRaw: number;
  lightIntensityRaw: number;
  bme690GasDiagRaw: number;
  apds9253SampleStatusRaw: number;
};

export type ArcProbeGatewayChildConfirmation = {
  opcode: ArcMeshProbeOpcode.GATEWAY_CHILD_CONFIRM;
  payloadVersion: number;
  payloadLength: number;
  gatewayTickMs: number;
  probeSourceAddress: number;
  gatewayAddress: number;
  flagsRaw: number;
  confirmed: boolean;
  expectedGatewayChild: boolean;
  telemetryReceived: boolean;
  routeSetSeen: boolean;
  lastProbeSequence: number;
  gatewayTelemetryCount: number;
  gatewayThreadRxCount: number;
  observedProbeRolePolicy: number;
  childState: 'recent' | 'sleeping' | 'missedWindow' | 'stale' | 'unknown';
};

export type ArcGatewayDebugStatus = {
  opcode: ArcMeshProbeOpcode.GATEWAY_DEBUG_STATUS;
  payloadVersion: number;
  payloadLength: number;
  gatewayTickMs: number;
  status: number;
  otRole: number;
  flagsRaw: number;
  appBleFacing: boolean;
  threadDeviceFacing: boolean;
  cloudFacing: boolean;
  udpBound: boolean;
  observedProbeRolePolicy: number;
  processCount: number;
  udpBindError: number;
  threadRxCount: number;
  threadRxLastSequence: number;
  appRoutePublishCountLow: number;
  appRoutePublishSuccessCountLow: number;
  appRoutePublishFailCountLow: number;
  appRouteLastResultLow: number;
  resetCauseBits: number;
  faultCode: number;
  lastAliveSource: number;
  bootCount: number;
};

export const encodeArcProbeGatewayRouteSetFrame = (gatewayNodeId: string, routeMode: 0 | 1 = 1) => {
  const gatewayBytes = new Uint8Array(Math.min(gatewayNodeId.length, ARC_PROBE_GATEWAY_ROUTE_NODE_ID_MAX_LEN));
  for (let index = 0; index < gatewayBytes.length; index += 1) {
    gatewayBytes[index] = gatewayNodeId.charCodeAt(index) & 0xff;
  }

  const payload = new Uint8Array(4 + gatewayBytes.length);
  payload[0] = ArcMeshProbeOpcode.GATEWAY_ROUTE_SET;
  payload[1] = ARC_PROBE_GATEWAY_ROUTE_PAYLOAD_VERSION;
  payload[2] = routeMode;
  payload[3] = gatewayBytes.length;
  payload.set(gatewayBytes, 4);
  return payload;
};

export const decodeArcProbeTelemetryStatusFrame = (payload: Uint8Array): ArcProbeTelemetryStatus => {
  if (payload.length < ARC_PROBE_TELEMETRY_PAYLOAD_LEN) {
    throw new Error(`decodeArcProbeTelemetryStatusFrame: expected ${ARC_PROBE_TELEMETRY_PAYLOAD_LEN} bytes, got ${payload.length}.`);
  }

  const opcode = readUint8(payload, 0);
  if (opcode !== ArcMeshProbeOpcode.TELEMETRY_STATUS) {
    throw new Error(`decodeArcProbeTelemetryStatusFrame: unsupported opcode 0x${opcode.toString(16)}.`);
  }

  const payloadVersion = readUint8(payload, 1);
  if (payloadVersion !== ARC_PROBE_TELEMETRY_PAYLOAD_VERSION) {
    throw new Error(`decodeArcProbeTelemetryStatusFrame: unsupported version ${payloadVersion}.`);
  }

  const batteryPctRaw = readUint8(payload, 16);
  const pmicFlagsRaw = readUint8(payload, 20);

  return {
    opcode: ArcMeshProbeOpcode.TELEMETRY_STATUS,
    payloadVersion,
    payloadLength: readUint16LE(payload, 2),
    sequence: readUint32LE(payload, 4),
    tickMs: readUint32LE(payload, 8),
    regularSampleIntervalS: readUint16LE(payload, 12),
    gasSampleIntervalS: readUint16LE(payload, 14),
    batteryPct: (pmicFlagsRaw & 0x80) !== 0 && batteryPctRaw <= 100 ? batteryPctRaw : null,
    pmicStatusRaw: readUint8(payload, 17),
    pmicFaultRaw: readUint8(payload, 18),
    pmicVbmonRaw: readUint8(payload, 19),
    pmicFlagsRaw,
    pmicChargeControlRaw: readUint8(payload, 21),
    pmicSysRaw: readUint8(payload, 22),
    lslodoRaw: readUint8(payload, 23),
    sensorValidMask: readUint32LE(payload, 24),
    sensorErrorMask: readUint32LE(payload, 28),
    sensorFoundMask: readUint32LE(payload, 32),
    tscDepthValidMask: readUint16LE(payload, 36),
    tscDepth0Raw: readUint16LE(payload, 38),
    tscDepth1Raw: readUint16LE(payload, 40),
    tscDepth2Raw: readUint16LE(payload, 42),
    sht45TemperatureC: readInt16LE(payload, 44) / 100,
    sht45HumidityPct: readUint16LE(payload, 46) / 100,
    bme690TemperatureC: readInt16LE(payload, 48) / 100,
    bme690PressureHpa: readUint32LE(payload, 50) / 100,
    bme690HumidityPct: readUint16LE(payload, 54) / 100,
    bme690GasOhms: readUint32LE(payload, 56),
    soilTemperatureC: readInt16LE(payload, 60) / 100,
    earthTemperatureC: readInt16LE(payload, 60) / 100,
    soilThermistorRaw: readUint16LE(payload, 62),
    earthTemperatureRaw: readUint16LE(payload, 62),
    lightRedRaw: readUint32LE(payload, 64),
    lightGreenRaw: readUint32LE(payload, 68),
    lightBlueRaw: readUint32LE(payload, 72),
    lightIntensityRaw: readUint16LE(payload, 76),
    bme690GasDiagRaw: readUint8(payload, 78),
    apds9253SampleStatusRaw: readUint8(payload, 79),
  };
};

export const decodeArcProbeGatewayChildConfirmationFrame = (payload: Uint8Array): ArcProbeGatewayChildConfirmation => {
  if (payload.length < ARC_PROBE_GATEWAY_CONFIRM_PAYLOAD_LEN) {
    throw new Error(`decodeArcProbeGatewayChildConfirmationFrame: expected ${ARC_PROBE_GATEWAY_CONFIRM_PAYLOAD_LEN} bytes, got ${payload.length}.`);
  }

  const opcode = readUint8(payload, 0);
  if (opcode !== ArcMeshProbeOpcode.GATEWAY_CHILD_CONFIRM) {
    throw new Error(`decodeArcProbeGatewayChildConfirmationFrame: unsupported opcode 0x${opcode.toString(16)}.`);
  }

  const payloadVersion = readUint8(payload, 1);
  if (payloadVersion !== ARC_PROBE_GATEWAY_CONFIRM_PAYLOAD_VERSION) {
    throw new Error(`decodeArcProbeGatewayChildConfirmationFrame: unsupported version ${payloadVersion}.`);
  }

  const flagsRaw = readUint8(payload, 12);
  const ageMs = readUint32LE(payload, 28);
  const confirmed = (flagsRaw & 0x01) !== 0;
  const childState = confirmed
    ? ageMs > 120000
      ? 'stale'
      : ageMs > 30000
        ? 'sleeping'
        : 'recent'
    : (flagsRaw & 0x04) !== 0
      ? 'missedWindow'
      : 'unknown';

  return {
    opcode: ArcMeshProbeOpcode.GATEWAY_CHILD_CONFIRM,
    payloadVersion,
    payloadLength: readUint16LE(payload, 2),
    gatewayTickMs: readUint32LE(payload, 4),
    probeSourceAddress: readUint16LE(payload, 8),
    gatewayAddress: readUint16LE(payload, 10),
    flagsRaw,
    confirmed,
    expectedGatewayChild: (flagsRaw & 0x02) !== 0,
    telemetryReceived: (flagsRaw & 0x04) !== 0,
    routeSetSeen: (flagsRaw & 0x08) !== 0,
    observedProbeRolePolicy: readUint8(payload, 13),
    lastProbeSequence: readUint32LE(payload, 16),
    gatewayTelemetryCount: readUint32LE(payload, 20),
    gatewayThreadRxCount: readUint32LE(payload, 24),
    childState,
  };
};

export const decodeArcGatewayDebugStatusFrame = (payload: Uint8Array): ArcGatewayDebugStatus => {
  if (payload.length < ARC_GATEWAY_DEBUG_STATUS_PAYLOAD_LEN) {
    throw new Error(`decodeArcGatewayDebugStatusFrame: expected ${ARC_GATEWAY_DEBUG_STATUS_PAYLOAD_LEN} bytes, got ${payload.length}.`);
  }

  const opcode = readUint8(payload, 0);
  if (opcode !== ArcMeshProbeOpcode.GATEWAY_DEBUG_STATUS) {
    throw new Error(`decodeArcGatewayDebugStatusFrame: unsupported opcode 0x${opcode.toString(16)}.`);
  }

  const payloadVersion = readUint8(payload, 1);
  if (payloadVersion !== ARC_GATEWAY_DEBUG_STATUS_PAYLOAD_VERSION) {
    throw new Error(`decodeArcGatewayDebugStatusFrame: unsupported version ${payloadVersion}.`);
  }

  const flagsRaw = readUint8(payload, 10);
  return {
    opcode: ArcMeshProbeOpcode.GATEWAY_DEBUG_STATUS,
    payloadVersion,
    payloadLength: readUint16LE(payload, 2),
    gatewayTickMs: readUint32LE(payload, 4),
    status: readUint8(payload, 8),
    otRole: readUint8(payload, 9),
    flagsRaw,
    appBleFacing: (flagsRaw & 0x01) !== 0,
    threadDeviceFacing: (flagsRaw & 0x02) !== 0,
    cloudFacing: (flagsRaw & 0x04) !== 0,
    udpBound: (flagsRaw & 0x08) !== 0,
    observedProbeRolePolicy: readUint8(payload, 11),
    processCount: readUint32LE(payload, 12),
    udpBindError: readUint32LE(payload, 16),
    threadRxCount: readUint32LE(payload, 20),
    threadRxLastSequence: readUint32LE(payload, 24),
    appRoutePublishCountLow: readUint8(payload, 28),
    appRoutePublishSuccessCountLow: readUint8(payload, 29),
    appRoutePublishFailCountLow: readUint8(payload, 30),
    appRouteLastResultLow: readUint8(payload, 31),
    resetCauseBits: readUint32LE(payload, 32),
    faultCode: readUint32LE(payload, 36),
    lastAliveSource: readUint32LE(payload, 40),
    bootCount: readUint32LE(payload, 44),
  };
};
