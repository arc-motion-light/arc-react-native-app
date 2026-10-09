import { clampNumber, readInt16LE, readUint16LE, readUint32LE, readUint8 } from '../protocol/valueCodec';

export const OPEN_MESH_FRAME_SIZE = 11;
export const OPEN_MESH_STATUS_EXTENDED_FRAME_SIZE = 15;
export const OPEN_MESH_STATUS_MANUAL_FRAME_SIZE = 26;
export const OPEN_MESH_STATUS_FAN_FRAME_SIZE = 32;
export const OPEN_MESH_STATUS_PWM_FREQUENCY_FRAME_SIZE = 37;
export const OPEN_MESH_STATUS_DISPLAY_POWER_FRAME_SIZE = 39;
export const OPEN_MESH_STATUS_POWER_TARGET_FRAME_SIZE = 42;
export const OPEN_MESH_STATUS_HEALTH_FRAME_SIZE = 44;
export const OPEN_MESH_STATUS_FAN_TACH2_FRAME_SIZE = 46;
export const OPEN_MESH_RESERVED_BYTE = 0x00;
export const OPEN_MESH_SET_LAMP_CONFIG_FRAME_SIZE = 31;
export const OPEN_MESH_LAMP_CONFIG_STATUS_FRAME_SIZE = 31;
export const OPEN_MESH_GET_LAMP_CONFIG_FRAME_SIZE = 2;
export const OPEN_MESH_LAMP_CONFIG_SCHEMA = 0x03;

export enum OpenMeshOpcode {
  SET_STATUS = 0x01,
  GET_STATUS = 0x02,
  STATUS = 0x03,
  HOMESCREEN_CONTROL = 0x10,
  SET_TIME = 0x20,
  SET_LAMP_CONFIG = 0x30,
  LAMP_CONFIG_STATUS = 0x31,
  GET_LAMP_CONFIG = 0x32,
  MANUAL_CHANNEL_CONTROL = 0x40,
  MANUAL_FAN_CONTROL = 0x41,
  PREPARE_PWM_FREQUENCY = 0x42,
  MANUAL_POWER_OVERRIDE = 0x43,
  MANUAL_POWER_TARGET = 0x44,
  ERROR = 0x7f,
}

export enum OpenMeshErrorCode {
  SEGMENT_ERROR = 0x01,
  CHECKSUM_ERROR = 0x02,
  VERSION_MISMATCH = 0x03,
  INVALID_LENGTH = 0x04,
  UNSUPPORTED_OPCODE = 0x05,
}

export type OpenMeshStateFlags = {
  override: boolean;
  thermalShutdown: boolean;
  timeSynced: boolean;
  timeValid: boolean;
  thermalLimitReached: boolean;
  timerEnabled: boolean;
  lampOn: boolean;
};

export type OpenMeshStatusFrame = {
  opcode: OpenMeshOpcode.SET_STATUS | OpenMeshOpcode.STATUS;
  configVersion: number;
  tempHeatsinkC: number;
  tempBoardC: number;
  tempMcuC: number;
  currentMa: number;
  powerWatts?: number;
  displayPowerWatts?: number;
  telemetryValidity?: {
    coreTemp: boolean;
    boardTemp: boolean;
    power: boolean;
  };
  /** Decoder-only capability marker; omitted by legacy status writers. */
  extendedStatus?: boolean;
  flagsRaw?: number;
  flags: OpenMeshStateFlags;
  reserved: number;
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
    tach2Present: boolean;
    tach2Rpm: number;
    automatic: boolean;
    rpmControl: boolean;
    targetRpm: number;
  };
  pwmFrequency?: { activeHz: number; targetHz: number; outputsEnabled: boolean };
  health?: { severity: 'nominal' | 'warning' | 'error'; code: number };
};

export type OpenMeshManualChannelControl = {
  enabled: boolean;
  channels: [number, number, number, number];
  temperatureLimitC: number;
  powerLimitWatts: number;
};

export type OpenMeshManualFanControl = {
  automatic: boolean;
  targetRpm: number;
};

export type OpenMeshManualFrequencyControl = { targetHz: number };
export type OpenMeshManualPowerControl = { power: boolean };
export type OpenMeshManualPowerTargetControl = {
  enabled: boolean;
  channels: [number, number, number, number];
  targetWatts: number;
};

export type OpenMeshLampConfig = {
  enabled: boolean;
  onMinutes: number;
  sunriseFadeMinutes: number;
  daylightStartMinutes: number;
  daylightFadeMinutes: number;
  eveningStartMinutes: number;
  eveningFadeMinutes: number;
  offMinutes: number;
  nightFadeMinutes: number;
  sunriseTarget: [number, number, number, number];
  daylightTarget: [number, number, number, number];
  eveningTarget: [number, number, number, number];
};

export type OpenMeshLampConfigReply = {
  opcode: OpenMeshOpcode.LAMP_CONFIG_STATUS;
  configVersion: number;
  enabled: boolean;
  config: Omit<OpenMeshLampConfig, 'enabled'>;
};

export type OpenMeshSetTimeFrame = {
  opcode: OpenMeshOpcode.SET_TIME;
  configVersion: number;
  epochSeconds: number;
};

export type OpenMeshHomeControlFlags = {
  power?: boolean;
  intensity?: boolean;
  hue?: boolean;
  pwmFreq?: boolean;
};

export type OpenMeshHomeScreenControlFrame = {
  opcode: OpenMeshOpcode.HOMESCREEN_CONTROL;
  flags: OpenMeshHomeControlFlags;
  power: boolean;
  intensity: number;
  hue: number;
  pwmFreqHz: number;
  rampSeconds: number;
  reserved: number;
};

export type OpenMeshErrorFrame = {
  opcode: OpenMeshOpcode.ERROR;
  configVersion: number;
  errorCode: OpenMeshErrorCode;
  reserved: number;
};

const ensureFrameSize = (frame: Uint8Array, context: string) => {
  if (frame.length !== OPEN_MESH_FRAME_SIZE) {
    throw new Error(`${context}: expected ${OPEN_MESH_FRAME_SIZE} bytes, got ${frame.length}.`);
  }
};

const ensureStatusFrameSize = (frame: Uint8Array, context: string) => {
  if (frame.length !== OPEN_MESH_FRAME_SIZE && frame.length < OPEN_MESH_STATUS_EXTENDED_FRAME_SIZE) {
    throw new Error(`${context}: expected legacy ${OPEN_MESH_FRAME_SIZE} bytes or extended ${OPEN_MESH_STATUS_EXTENDED_FRAME_SIZE} bytes, got ${frame.length}.`);
  }
};

const readChannelPercent = (frame: Uint8Array, offset: number) => readUint8(frame, offset) * 100 / 255;

const encodeInt16LE = (value: number) => {
  const clamped = Math.trunc(clampNumber(value, -32768, 32767));
  const view = new DataView(new ArrayBuffer(2));
  view.setInt16(0, clamped, true);
  return new Uint8Array([view.getUint8(0), view.getUint8(1)]);
};

const toTempX10 = (tempC: number) => Math.trunc(clampNumber(tempC * 10, -32768, 32767));

const fromTempX10 = (tempX10: number) => tempX10 / 10;

const toCurrentDiv10 = (currentMa: number) => Math.trunc(clampNumber(Math.round(currentMa / 10), -128, 127));

const fromCurrentDiv10 = (currentDiv10: number) => currentDiv10 * 10;

export const encodeOpenMeshFlags = (flags: OpenMeshStateFlags) => {
  const value =
    (flags.override ? 1 : 0) |
    ((flags.thermalShutdown ? 1 : 0) << 1) |
    ((flags.timeSynced ? 1 : 0) << 2) |
    ((flags.timeValid ? 1 : 0) << 3) |
    ((flags.thermalLimitReached ? 1 : 0) << 4) |
    ((flags.timerEnabled ? 1 : 0) << 5) |
    ((flags.lampOn ? 1 : 0) << 6);
  return value & 0x7f;
};

export const decodeOpenMeshFlags = (value: number): OpenMeshStateFlags => {
  return {
    override: (value & 0x01) !== 0,
    thermalShutdown: (value & 0x02) !== 0,
    timeSynced: (value & 0x04) !== 0,
    timeValid: (value & 0x08) !== 0,
    thermalLimitReached: (value & 0x10) !== 0,
    timerEnabled: (value & 0x20) !== 0,
    lampOn: (value & 0x40) !== 0,
  };
};

export const encodeOpenMeshHomeControlFlags = (flags: OpenMeshHomeControlFlags) => {
  const value =
    (flags.power ? 1 : 0) |
    ((flags.intensity ? 1 : 0) << 1) |
    ((flags.hue ? 1 : 0) << 2) |
    ((flags.pwmFreq ? 1 : 0) << 3);
  return value & 0x0f;
};

export const decodeOpenMeshHomeControlFlags = (value: number): Required<OpenMeshHomeControlFlags> => ({
  power: (value & 0x01) !== 0,
  intensity: (value & 0x02) !== 0,
  hue: (value & 0x04) !== 0,
  pwmFreq: (value & 0x08) !== 0,
});

export const encodeOpenMeshStatusFrame = (input: OpenMeshStatusFrame) => {
  const frame = new Uint8Array(OPEN_MESH_FRAME_SIZE);
  frame[0] = input.opcode;
  frame[1] = Math.trunc(clampNumber(input.configVersion, 0, 255));
  frame.set(encodeInt16LE(toTempX10(input.tempHeatsinkC)), 2);
  frame.set(encodeInt16LE(toTempX10(input.tempBoardC)), 4);
  frame.set(encodeInt16LE(toTempX10(input.tempMcuC)), 6);
  frame[8] = toCurrentDiv10(input.currentMa) & 0xff;
  frame[9] = encodeOpenMeshFlags(input.flags);
  frame[10] = Math.trunc(clampNumber(input.reserved, 0, 255));
  return frame;
};

export const decodeOpenMeshStatusFrame = (frame: Uint8Array): OpenMeshStatusFrame => {
  ensureStatusFrameSize(frame, 'decodeOpenMeshStatusFrame');
  const opcode = readUint8(frame, 0);
  if (opcode !== OpenMeshOpcode.SET_STATUS && opcode !== OpenMeshOpcode.STATUS) {
    throw new Error(`decodeOpenMeshStatusFrame: unsupported opcode 0x${opcode.toString(16)}.`);
  }

  const currentDiv10Raw = readUint8(frame, 8);
  const currentDiv10Signed = currentDiv10Raw > 127 ? currentDiv10Raw - 256 : currentDiv10Raw;

  const isExtended = frame.length >= OPEN_MESH_STATUS_EXTENDED_FRAME_SIZE;
  const telemetryValidityRaw = readUint8(frame, 10);
  const hasManualControl = frame.length >= OPEN_MESH_STATUS_MANUAL_FRAME_SIZE;
  const hasFan = frame.length >= OPEN_MESH_STATUS_FAN_FRAME_SIZE;
  const hasPwmFrequency = frame.length >= OPEN_MESH_STATUS_PWM_FREQUENCY_FRAME_SIZE;
  const hasDisplayPower = frame.length >= OPEN_MESH_STATUS_DISPLAY_POWER_FRAME_SIZE;
  const hasPowerTarget = frame.length >= OPEN_MESH_STATUS_POWER_TARGET_FRAME_SIZE;
  const hasHealth = frame.length >= OPEN_MESH_STATUS_HEALTH_FRAME_SIZE;
  const hasFanTach2 = frame.length >= OPEN_MESH_STATUS_FAN_TACH2_FRAME_SIZE;
  return {
    opcode,
    configVersion: readUint8(frame, 1),
    tempHeatsinkC: fromTempX10(readInt16LE(frame, 2)),
    tempBoardC: fromTempX10(readInt16LE(frame, 4)),
    tempMcuC: fromTempX10(readInt16LE(frame, 6)),
    currentMa: isExtended ? readUint16LE(frame, 13) : fromCurrentDiv10(currentDiv10Signed),
    powerWatts: isExtended && (telemetryValidityRaw & 0x04) !== 0 ? readUint16LE(frame, 11) / 10 : undefined,
    displayPowerWatts: hasDisplayPower && (telemetryValidityRaw & 0x04) !== 0 ? readUint16LE(frame, 37) / 10 : undefined,
    telemetryValidity: isExtended
      ? {
          coreTemp: (telemetryValidityRaw & 0x01) !== 0,
          boardTemp: (telemetryValidityRaw & 0x02) !== 0,
          power: (telemetryValidityRaw & 0x04) !== 0,
        }
      : { coreTemp: true, boardTemp: true, power: true },
    extendedStatus: isExtended,
    flagsRaw: readUint8(frame, 9),
    flags: decodeOpenMeshFlags(readUint8(frame, 9)),
    reserved: telemetryValidityRaw,
    manualControl: hasManualControl
      ? {
          active: (readUint8(frame, 15) & 0x01) !== 0,
          limiting: (readUint8(frame, 15) & 0x02) !== 0,
          requestedChannels: [readChannelPercent(frame, 16), readChannelPercent(frame, 17), readChannelPercent(frame, 18), readChannelPercent(frame, 19)],
          appliedChannels: [readChannelPercent(frame, 20), readChannelPercent(frame, 21), readChannelPercent(frame, 22), readChannelPercent(frame, 23)],
          temperatureLimitC: readUint8(frame, 24),
          powerLimitWatts: readUint8(frame, 25),
          powerTargetWatts: hasPowerTarget && (readUint8(frame, 41) & 0x01) !== 0 ? readUint16LE(frame, 39) / 10 : undefined,
          powerTargetActive: hasPowerTarget && (readUint8(frame, 41) & 0x01) !== 0,
        }
      : undefined,
    fan: hasFan
      ? {
          dutyPercent: readUint8(frame, 26),
          rpm: readUint16LE(frame, 27),
          tachPresent: (readUint8(frame, 29) & 0x01) !== 0,
          tach2Present: hasFanTach2 && (readUint8(frame, 29) & 0x08) !== 0,
          tach2Rpm: hasFanTach2 ? readUint16LE(frame, 44) : 0,
          automatic: (readUint8(frame, 29) & 0x02) !== 0,
          rpmControl: (readUint8(frame, 29) & 0x04) !== 0,
          targetRpm: readUint16LE(frame, 30),
        }
      : undefined,
    pwmFrequency: hasPwmFrequency
      ? { activeHz: readUint16LE(frame, 32), targetHz: readUint16LE(frame, 34), outputsEnabled: (readUint8(frame, 36) & 0x01) !== 0 }
      : undefined,
    health: hasHealth
      ? {
          severity: readUint8(frame, 42) === 2 ? 'error' : readUint8(frame, 42) === 1 ? 'warning' : 'nominal',
          code: readUint8(frame, 43),
        }
      : undefined,
  };
};

export const encodeOpenMeshManualChannelControlFrame = (input: OpenMeshManualChannelControl) => {
  const frame = new Uint8Array(10);
  frame[0] = OpenMeshOpcode.MANUAL_CHANNEL_CONTROL;
  frame[1] = input.enabled ? 0x01 : 0x00;
  input.channels.forEach((channel, index) => {
    frame[2 + index] = Math.round(clampNumber(channel, 0, 100) * 255 / 100);
  });
  frame[6] = Math.round(clampNumber(input.temperatureLimitC, 30, 55) * 10) & 0xff;
  frame[7] = Math.round(clampNumber(input.temperatureLimitC, 30, 55) * 10) >> 8;
  frame[8] = Math.round(clampNumber(input.powerLimitWatts, 20, 120) * 10) & 0xff;
  frame[9] = Math.round(clampNumber(input.powerLimitWatts, 20, 120) * 10) >> 8;
  return frame;
};

export const encodeOpenMeshManualFanControlFrame = (input: OpenMeshManualFanControl) => {
  // Keep the Loader control envelope at 10 bytes.  Older installed iOS
  // bridges admitted only the phase-control envelope by length, so this lets
  // the fan command reach WBA/G4 without requiring a native app reinstall.
  const frame = new Uint8Array(10);
  frame[0] = OpenMeshOpcode.MANUAL_FAN_CONTROL;
  if (!input.automatic) {
    const targetRpm = Math.round(clampNumber(input.targetRpm, 0, 4000));
    frame[1] = 0x02;
    frame[2] = targetRpm & 0xff;
    frame[3] = (targetRpm >> 8) & 0xff;
    return frame;
  }
  return frame;
};

export const encodeOpenMeshPreparePwmFrequencyFrame = (input: OpenMeshManualFrequencyControl) => {
  const targetHz = Math.round(clampNumber(input.targetHz, 0, 50000));
  const frame = new Uint8Array(10);
  frame[0] = OpenMeshOpcode.PREPARE_PWM_FREQUENCY;
  frame[1] = targetHz & 0xff;
  frame[2] = (targetHz >> 8) & 0xff;
  return frame;
};

export const encodeOpenMeshManualPowerControlFrame = (input: OpenMeshManualPowerControl) => {
  const frame = new Uint8Array(10);
  frame[0] = OpenMeshOpcode.MANUAL_POWER_OVERRIDE;
  frame[1] = input.power ? 1 : 0;
  return frame;
};

export const encodeOpenMeshManualPowerTargetFrame = (input: OpenMeshManualPowerTargetControl) => {
  const frame = new Uint8Array(10);
  frame[0] = OpenMeshOpcode.MANUAL_POWER_TARGET;
  frame[1] = input.enabled ? 1 : 0;
  input.channels.forEach((channel, index) => {
    frame[2 + index] = Math.round(clampNumber(channel, 0, 100) * 255 / 100);
  });
  const target = Math.round(clampNumber(input.targetWatts, 0, 120) * 10);
  frame[6] = target & 0xff;
  frame[7] = target >> 8;
  return frame;
};

export const encodeOpenMeshGetStatusFrame = (configVersion: number) => {
  const frame = new Uint8Array(OPEN_MESH_FRAME_SIZE);
  frame[0] = OpenMeshOpcode.GET_STATUS;
  frame[1] = Math.trunc(clampNumber(configVersion, 0, 255));
  frame[10] = OPEN_MESH_RESERVED_BYTE;
  return frame;
};

export const encodeOpenMeshSetTimeFrame = (input: OpenMeshSetTimeFrame) => {
  const frame = new Uint8Array(OPEN_MESH_FRAME_SIZE);
  frame[0] = input.opcode;
  frame[1] = Math.trunc(clampNumber(input.configVersion, 0, 255));

  const epoch = Math.trunc(clampNumber(input.epochSeconds, 0, 0xffffffff));
  frame[2] = epoch & 0xff;
  frame[3] = (epoch >> 8) & 0xff;
  frame[4] = (epoch >> 16) & 0xff;
  frame[5] = (epoch >> 24) & 0xff;

  frame[10] = OPEN_MESH_RESERVED_BYTE;
  return frame;
};

export const decodeOpenMeshSetTimeFrame = (frame: Uint8Array): OpenMeshSetTimeFrame => {
  ensureFrameSize(frame, 'decodeOpenMeshSetTimeFrame');
  const opcode = readUint8(frame, 0);
  if (opcode !== OpenMeshOpcode.SET_TIME) {
    throw new Error(`decodeOpenMeshSetTimeFrame: unsupported opcode 0x${opcode.toString(16)}.`);
  }

  return {
    opcode,
    configVersion: readUint8(frame, 1),
    epochSeconds: readUint32LE(frame, 2),
  };
};

export const encodeOpenMeshHomeScreenControlFrame = (input: OpenMeshHomeScreenControlFrame) => {
  const frame = new Uint8Array(OPEN_MESH_FRAME_SIZE);
  frame[0] = OpenMeshOpcode.HOMESCREEN_CONTROL;
  frame[1] = encodeOpenMeshHomeControlFlags(input.flags);
  frame[2] = input.power ? 1 : 0;
  frame[3] = Math.trunc(clampNumber(input.intensity, 0, 255));

  const hue = Math.trunc(clampNumber(input.hue, 0, 0xffff));
  frame[4] = hue & 0xff;
  frame[5] = (hue >> 8) & 0xff;

  const pwm = Math.trunc(clampNumber(input.pwmFreqHz, 0, 0xffff));
  frame[6] = pwm & 0xff;
  frame[7] = (pwm >> 8) & 0xff;

  const ramp = Math.trunc(clampNumber(input.rampSeconds, 0, 0xffff));
  frame[8] = ramp & 0xff;
  frame[9] = (ramp >> 8) & 0xff;

  frame[10] = Math.trunc(clampNumber(input.reserved, 0, 255));
  return frame;
};

export const decodeOpenMeshHomeScreenControlFrame = (frame: Uint8Array): OpenMeshHomeScreenControlFrame => {
  ensureFrameSize(frame, 'decodeOpenMeshHomeScreenControlFrame');
  const opcode = readUint8(frame, 0);
  if (opcode !== OpenMeshOpcode.HOMESCREEN_CONTROL) {
    throw new Error(`decodeOpenMeshHomeScreenControlFrame: unsupported opcode 0x${opcode.toString(16)}.`);
  }

  return {
    opcode,
    flags: decodeOpenMeshHomeControlFlags(readUint8(frame, 1)),
    power: readUint8(frame, 2) > 0,
    intensity: readUint8(frame, 3),
    hue: readUint16LE(frame, 4),
    pwmFreqHz: readUint16LE(frame, 6),
    rampSeconds: readUint16LE(frame, 8),
    reserved: readUint8(frame, 10),
  };
};

const writeUint16LE = (frame: Uint8Array, offset: number, value: number) => {
  const v = Math.trunc(value);
  frame[offset] = v & 0xff;
  frame[offset + 1] = (v >> 8) & 0xff;
};

const assertConfigIntegerInRange = (name: string, value: number, min: number, max: number) => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name}: expected integer ${min}..${max}, got ${value}.`);
  }
};

const validateOpenMeshLampConfig = (config: OpenMeshLampConfig) => {
  assertConfigIntegerInRange('onMinutes', config.onMinutes, 0, 1439);
  assertConfigIntegerInRange('sunriseFadeMinutes', config.sunriseFadeMinutes, 0, 720);
  assertConfigIntegerInRange('daylightStartMinutes', config.daylightStartMinutes, 0, 1439);
  assertConfigIntegerInRange('daylightFadeMinutes', config.daylightFadeMinutes, 0, 720);
  assertConfigIntegerInRange('eveningStartMinutes', config.eveningStartMinutes, 0, 1439);
  assertConfigIntegerInRange('eveningFadeMinutes', config.eveningFadeMinutes, 0, 720);
  assertConfigIntegerInRange('offMinutes', config.offMinutes, 0, 1439);
  assertConfigIntegerInRange('nightFadeMinutes', config.nightFadeMinutes, 0, 720);

  if (config.onMinutes + config.sunriseFadeMinutes > config.daylightStartMinutes) {
    throw new Error('Schedule ordering invalid: on + sunriseFade must be <= daylightStart.');
  }
  if (config.daylightStartMinutes + config.daylightFadeMinutes > config.eveningStartMinutes) {
    throw new Error('Schedule ordering invalid: daylightStart + daylightFade must be <= eveningStart.');
  }
  if (config.eveningStartMinutes + config.eveningFadeMinutes > config.offMinutes - config.nightFadeMinutes) {
    throw new Error('Schedule ordering invalid: eveningStart + eveningFade must be <= off - nightFade.');
  }

  ([
    ['sunriseTarget', config.sunriseTarget],
    ['daylightTarget', config.daylightTarget],
    ['eveningTarget', config.eveningTarget],
  ] as const).forEach(([name, values]) => {
    if (values.length !== 4) throw new Error(`${name}: expected four channel targets.`);
    values.forEach((value, index) => assertConfigIntegerInRange(`${name}[${index}]`, value, 0, 100));
  });
};

export const encodeOpenMeshSetLampConfigFrame = (configVersion: number, config: OpenMeshLampConfig) => {
  validateOpenMeshLampConfig(config);
  const frame = new Uint8Array(OPEN_MESH_SET_LAMP_CONFIG_FRAME_SIZE);
  frame[0] = OpenMeshOpcode.SET_LAMP_CONFIG;
  frame[1] = Math.trunc(clampNumber(configVersion, 0, 255));
  frame[2] = config.enabled ? 1 : 0;
  writeUint16LE(frame, 3, config.onMinutes);
  writeUint16LE(frame, 5, config.sunriseFadeMinutes);
  writeUint16LE(frame, 7, config.daylightStartMinutes);
  writeUint16LE(frame, 9, config.daylightFadeMinutes);
  writeUint16LE(frame, 11, config.eveningStartMinutes);
  writeUint16LE(frame, 13, config.eveningFadeMinutes);
  writeUint16LE(frame, 15, config.offMinutes);
  writeUint16LE(frame, 17, config.nightFadeMinutes);
  frame.set(config.sunriseTarget, 19);
  frame.set(config.daylightTarget, 23);
  frame.set(config.eveningTarget, 27);
  return frame;
};

export const encodeOpenMeshGetLampConfigFrame = () =>
  new Uint8Array([OpenMeshOpcode.GET_LAMP_CONFIG, OPEN_MESH_LAMP_CONFIG_SCHEMA]);

export const decodeOpenMeshLampConfigStatusFrame = (frame: Uint8Array): OpenMeshLampConfigReply => {
  if (frame.length !== OPEN_MESH_LAMP_CONFIG_STATUS_FRAME_SIZE) {
    throw new Error(`decodeOpenMeshLampConfigStatusFrame: expected ${OPEN_MESH_LAMP_CONFIG_STATUS_FRAME_SIZE} bytes, got ${frame.length}.`);
  }
  const opcode = readUint8(frame, 0);
  if (opcode !== OpenMeshOpcode.LAMP_CONFIG_STATUS) {
    throw new Error(`decodeOpenMeshLampConfigStatusFrame: unsupported opcode 0x${opcode.toString(16)}.`);
  }
  const config = {
    onMinutes: readUint16LE(frame, 3),
    sunriseFadeMinutes: readUint16LE(frame, 5),
    daylightStartMinutes: readUint16LE(frame, 7),
    daylightFadeMinutes: readUint16LE(frame, 9),
    eveningStartMinutes: readUint16LE(frame, 11),
    eveningFadeMinutes: readUint16LE(frame, 13),
    offMinutes: readUint16LE(frame, 15),
    nightFadeMinutes: readUint16LE(frame, 17),
    sunriseTarget: [readUint8(frame, 19), readUint8(frame, 20), readUint8(frame, 21), readUint8(frame, 22)] as [number, number, number, number],
    daylightTarget: [readUint8(frame, 23), readUint8(frame, 24), readUint8(frame, 25), readUint8(frame, 26)] as [number, number, number, number],
    eveningTarget: [readUint8(frame, 27), readUint8(frame, 28), readUint8(frame, 29), readUint8(frame, 30)] as [number, number, number, number],
  };
  validateOpenMeshLampConfig({ enabled: readUint8(frame, 2) !== 0, ...config });
  return {
    opcode: OpenMeshOpcode.LAMP_CONFIG_STATUS,
    configVersion: readUint8(frame, 1),
    enabled: readUint8(frame, 2) !== 0,
    config,
  };
};

export const encodeOpenMeshErrorFrame = (configVersion: number, errorCode: OpenMeshErrorCode) => {
  const frame = new Uint8Array(OPEN_MESH_FRAME_SIZE);
  frame[0] = OpenMeshOpcode.ERROR;
  frame[1] = Math.trunc(clampNumber(configVersion, 0, 255));
  frame[2] = errorCode;
  frame[10] = OPEN_MESH_RESERVED_BYTE;
  return frame;
};

export const decodeOpenMeshErrorFrame = (frame: Uint8Array): OpenMeshErrorFrame => {
  ensureFrameSize(frame, 'decodeOpenMeshErrorFrame');
  const opcode = readUint8(frame, 0);
  if (opcode !== OpenMeshOpcode.ERROR) {
    throw new Error(`decodeOpenMeshErrorFrame: unsupported opcode 0x${opcode.toString(16)}.`);
  }

  return {
    opcode,
    configVersion: readUint8(frame, 1),
    errorCode: readUint8(frame, 2) as OpenMeshErrorCode,
    reserved: readUint8(frame, 10),
  };
};

export const openMeshErrorCodeLabel = (code: OpenMeshErrorCode | number): string => {
  switch (code) {
    case OpenMeshErrorCode.SEGMENT_ERROR:
      return 'Segment error';
    case OpenMeshErrorCode.CHECKSUM_ERROR:
      return 'Checksum error';
    case OpenMeshErrorCode.VERSION_MISMATCH:
      return 'Version mismatch';
    case OpenMeshErrorCode.INVALID_LENGTH:
      return 'Invalid length';
    case OpenMeshErrorCode.UNSUPPORTED_OPCODE:
      return 'Unsupported opcode';
    default:
      return `Unknown error (${code})`;
  }
};
