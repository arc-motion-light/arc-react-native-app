export type LampBleDevice = {
  id: string;
  name?: string | null;
  localName?: string | null;
};

export type LampStatus = {
  configVersion?: number;
  power: boolean;
  intensity: number;
  hue: number;
  pwmFreq: number;
  timerOn: number;
  timerOff: number;
  hueTime: number;
  hueFade: number;
  timerEnabled: boolean;
  lampTimeEpoch: number;
  lampTimeSynced: boolean;
  tempMcu: number;
  tempBoard: number;
  tempHeatsink: number;
  currentDraw: number;
  inputPowerWatts?: number;
  /** Smoothed presentation telemetry; raw inputPowerWatts remains available for diagnostics. */
  displayPowerWatts?: number;
  telemetryValidity?: {
    coreTemp: boolean;
    boardTemp: boolean;
    power: boolean;
  };
  /** True only when the current G4 status frame carries the extended controls telemetry. */
  extendedStatus?: boolean;
  manualControl?: {
    active: boolean;
    requestedChannels: [number, number, number, number];
    appliedChannels: [number, number, number, number];
    temperatureLimitC: number;
    powerLimitWatts: number;
    limiting: boolean;
    powerTargetWatts?: number;
    powerTargetActive?: boolean;
  };
  fan?: {
    dutyPercent: number;
    rpm: number;
    tachPresent: boolean;
    /** Fan 2 is monitor-only; Fan 1 remains the shared-PWM control tach. */
    tach2Present: boolean;
    tach2Rpm: number;
    automatic: boolean;
    rpmControl: boolean;
    targetRpm: number;
  };
  pwmFrequency?: { activeHz: number; targetHz: number; outputsEnabled: boolean };
  /** Health severity and reason code emitted by G4, relayed unchanged by WBA. */
  health?: { severity: 'nominal' | 'warning' | 'error'; code: number };
  openMeshFlagsRaw?: number;
  openMeshFlags?: {
    overrideActive: boolean;
    thermalShutdown: boolean;
    timeSynced: boolean;
    timeValid: boolean;
    thermalLimitReached: boolean;
    timerEnabled: boolean;
    lampOn: boolean;
    reserved: boolean;
  };
};

export type SecurityStatus = {
  bonded: boolean;
  authenticated: boolean;
  encrypted: boolean;
};

export type LampBle = {
  scan: () => Promise<LampBleDevice[]>;
  connect: () => Promise<void>;
  connectTo: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  setPower: (value: boolean) => Promise<void>;
  setIntensity: (value: number) => Promise<void>;
  setHue: (value: number) => Promise<void>;
  setPwmFreq: (value: number) => Promise<void>;
  setTimerOn: (minutes: number) => Promise<void>;
  setTimerOff: (minutes: number) => Promise<void>;
  setTimerEnable: (enabled: boolean) => Promise<void>;
  setHueTime: (minutes: number) => Promise<void>;
  setHueFade: (minutes: number) => Promise<void>;
  setTimeEpoch: (epochSeconds: number) => Promise<void>;
  readStatus: () => Promise<LampStatus | null>;
  readSecurityStatus: () => Promise<SecurityStatus | null>;
  updatePasskey: (oldPasskey: number, newPasskey: number) => Promise<void>;
  subscribeStatus: (onStatus: (status: LampStatus) => void) => Promise<() => void>;
};
