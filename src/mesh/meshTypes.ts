import type { LampStatus } from '../ble/bleTypes';

export type MeshNodeKind = 'lamp' | 'probe' | 'gateway' | 'remote' | 'other';

export type ProbeGatewayRouteState = 'not-configured' | 'config-requested' | 'native-config-missing' | 'failed';
export type ProbeActiveTelemetryRoute = 'direct' | 'viaGateway' | 'viaLamp' | 'none' | 'unknown';
export type ProbeNodePowerRole = 'activeBle' | 'sleepyChild' | 'routerCapable' | 'standalone' | 'unknown';
export type ProbeGatewayChildState = 'recent' | 'sleeping' | 'missedWindow' | 'stale' | 'unknown';

export type ProbeGatewayRouteStatus = {
  gatewayId: string | null;
  state: ProbeGatewayRouteState;
  updatedAt: number;
  detail?: string | null;
};

export type ProbeSensorStatus = {
  temperatureC?: number | null;
  humidityPct?: number | null;
  pressureHpa?: number | null;
  gasOhms?: number | null;
  bme690TemperatureC?: number | null;
  bme690HumidityPct?: number | null;
  bme690PressureHpa?: number | null;
  bme690GasOhms?: number | null;
  sht45TemperatureC?: number | null;
  sht45HumidityPct?: number | null;
  earthTemperatureC?: number | null;
  earthTemperatureRaw?: number | null;
  mcuTemperatureC?: number | null;
  regularSampleIntervalS?: number | null;
  gasSampleIntervalS?: number | null;
  sensorFoundMask?: number | null;
  sensorIslandStatusRaw?: number | null;
  lslodoRaw?: number | null;
  tscDepthValidMask?: number | null;
  tscDepth0Raw?: number | null;
  tscDepth1Raw?: number | null;
  tscDepth2Raw?: number | null;
  tscDepth0Delta?: number | null;
  tscDepth1Delta?: number | null;
  tscDepth2Delta?: number | null;
  lightLux?: number | null;
  lightIntensityRaw?: number | null;
  lightRedRaw?: number | null;
  lightGreenRaw?: number | null;
  lightBlueRaw?: number | null;
  bme690GasDiagRaw?: number | null;
  apds9253SampleStatusRaw?: number | null;
  batteryPct?: number | null;
  batteryEstimateValid?: boolean | null;
  charging?: boolean | null;
  chargeState?: 'ready' | 'charging' | 'done' | 'fault' | null;
  pmicStatusRaw?: number | null;
  pmicFaultRaw?: number | null;
  pmicVbmonRaw?: number | null;
  pmicFlagsRaw?: number | null;
  pmicChargeControlRaw?: number | null;
  pmicVbatregRaw?: number | null;
  pmicSysRaw?: number | null;
  linkRssiDbm?: number | null;
  updatedAt?: number | null;
  source?: 'legacy-bridge' | 'probe-native' | 'gateway-thread' | 'portal-canonical' | null;
};

export type MeshNode = {
  id: string;
  uuid?: string | null;
  unicastAddress?: number | null;
  unicastHex?: string | null;
  nodeKind: MeshNodeKind;
  name: string;
  abbreviation: string;
  color: string;
  provisioned: boolean;
  connected: boolean;
  lastKnownConnected?: boolean;
  blePeripheralId?: string | null;
  metadataUpdatedAt?: number;
  staticOobHex?: string | null;
  lastSeen?: number;
  status?: LampStatus | null;
  probeStatus?: ProbeSensorStatus | null;
  assignedGatewayId?: string | null;
  assignedBridgeId?: string | null;
  probeGatewayRoute?: ProbeGatewayRouteStatus | null;
  probeActiveTelemetryRoute?: ProbeActiveTelemetryRoute | null;
  probePowerRole?: ProbeNodePowerRole | null;
  gatewayChildState?: ProbeGatewayChildState | null;
  lastSeenViaGatewayAt?: number | null;
  lastSeenViaLampAt?: number | null;
  lastDirectBleSeenAt?: number | null;
};

export type MeshScanResult = {
  id: string;
  uuid?: string | null;
  name?: string | null;
  localName?: string | null;
  cachedName?: string | null;
  rssi?: number | null;
  detail?: string | null;
  meshProvisioningAdvertised?: boolean | null;
  meshProxyAdvertised?: boolean | null;
  arcLocalRoleAdvertised?: boolean | null;
  // Set only for previously GATT-validated BLE addresses by the native WBA transport.
  arcPreviouslyValidated?: boolean | null;
  blePeripheralId?: string | null;
  nodeKind?: MeshNodeKind | null;
};

export type MeshProvisionResult = {
  id: string;
  uuid?: string | null;
  name?: string | null;
};

export type MeshProvisioningCapabilities = {
  numberOfElements: number;
  algorithms: string[];
  publicKeyAvailable: boolean;
  staticOobAvailable: boolean;
  outputOobSize: number;
  inputOobSize: number;
  outputOobActions: string[];
  inputOobActions: string[];
};
