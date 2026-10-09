import { LAMP_CHAR_UUIDS, LAMP_SERVICE_UUID } from '../protocol/lampUuids';
import {
  encodeUint16LE,
  encodePasskeyUpdate,
  encodeUint32LE,
  encodeUint8,
  readInt16LE,
  readUint16LE,
  readUint32LE,
  readUint8,
} from '../protocol/valueCodec';
import type { LampBle, LampStatus } from './bleTypes';
import { clampLampIntensity } from '../lamp/lampLimits';

type WebBluetoothGattCharacteristic = {
  value?: DataView | null;
  writeValue(value: Uint8Array): Promise<void>;
  readValue(): Promise<DataView>;
  startNotifications(): Promise<void>;
  stopNotifications(): Promise<void>;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
};

type WebBluetoothGattService = {
  getCharacteristic(uuid: string): Promise<WebBluetoothGattCharacteristic>;
};

type WebBluetoothGattServer = {
  getPrimaryService(uuid: string): Promise<WebBluetoothGattService>;
};

type WebBluetoothDevice = {
  gatt?: {
    connected?: boolean;
    connect(): Promise<WebBluetoothGattServer>;
    disconnect(): void;
  };
};

type WebBluetoothNavigator = Navigator & {
  bluetooth?: {
    requestDevice(options: { filters: Array<{ services: string[] }> }): Promise<WebBluetoothDevice>;
  };
};

type WebContext = {
  device?: WebBluetoothDevice;
  server?: WebBluetoothGattServer;
  service?: WebBluetoothGattService;
};

export const createWebLampBle = (): LampBle => {
  const ctx: WebContext = {};

  const getService = async () => {
    if (!ctx.device) throw new Error('No device');
    if (!ctx.server) ctx.server = await ctx.device.gatt?.connect();
    if (!ctx.server) throw new Error('No GATT server');
    if (!ctx.service) ctx.service = await ctx.server.getPrimaryService(LAMP_SERVICE_UUID);
    return ctx.service;
  };

  const writeChar = async (uuid: string, value: Uint8Array) => {
    const service = await getService();
    const characteristic = await service.getCharacteristic(uuid);
    await characteristic.writeValue(value);
  };

  const readChar = async (uuid: string) => {
    const service = await getService();
    const characteristic = await service.getCharacteristic(uuid);
    const value = await characteristic.readValue();
    return new Uint8Array(value.buffer.slice(0));
  };

  const decodeHeartbeat = (data: Uint8Array): LampStatus => {
    const power = readUint8(data, 0) > 0;
    const intensity = readUint8(data, 1);
    const hue = readUint16LE(data, 2);
    const pwmFreq = readUint32LE(data, 4);
    const timerOn = readUint16LE(data, 8);
    const timerOff = readUint16LE(data, 10);
    const hueTime = readUint16LE(data, 12);
    const hueFade = readUint16LE(data, 14);
    const timerEnabled = readUint8(data, 16) > 0;
    const lampTimeEpoch = data.length >= 21 ? readUint32LE(data, 17) : 0;
    const lampTimeSynced = data.length >= 22 ? readUint8(data, 21) > 0 : lampTimeEpoch > 0;
    const tempMcu = readInt16LE(data, 22) / 10;
    const tempBoard = readInt16LE(data, 24) / 10;
    const tempHeatsink = readInt16LE(data, 26) / 10;
    const currentDraw = readUint16LE(data, 28);

    return {
      power,
      intensity,
      hue,
      pwmFreq,
      timerOn,
      timerOff,
      hueTime,
      hueFade,
      timerEnabled,
      tempMcu,
      tempBoard,
      tempHeatsink,
      currentDraw,
      lampTimeEpoch,
      lampTimeSynced,
    };
  };

  const connect = async () => {
    const webNavigator = navigator as WebBluetoothNavigator;
    if (!webNavigator.bluetooth) throw new Error('Web Bluetooth not supported');
    ctx.device = await webNavigator.bluetooth.requestDevice({
      filters: [{ services: [LAMP_SERVICE_UUID] }],
    });
    await getService();
  };

  const scan = async () => {
    return [];
  };

  const connectTo = async (_deviceId: string) => {
    await connect();
  };

  const disconnect = async () => {
    if (ctx.device?.gatt?.connected) {
      ctx.device.gatt.disconnect();
    }
    ctx.device = undefined;
    ctx.server = undefined;
    ctx.service = undefined;
  };

  const setPower = async (value: boolean) => writeChar(LAMP_CHAR_UUIDS.power, encodeUint8(value ? 1 : 0));
  const setIntensity = async (value: number) =>
    writeChar(LAMP_CHAR_UUIDS.intensity, encodeUint8(clampLampIntensity(value)));
  const setHue = async (value: number) => writeChar(LAMP_CHAR_UUIDS.hue, encodeUint16LE(value));
  const setPwmFreq = async (value: number) => writeChar(LAMP_CHAR_UUIDS.pwmFreq, encodeUint32LE(value));

  const setTimerOn = async (minutes: number) => writeChar(LAMP_CHAR_UUIDS.timerOn, encodeUint16LE(minutes));
  const setTimerOff = async (minutes: number) => writeChar(LAMP_CHAR_UUIDS.timerOff, encodeUint16LE(minutes));
  const setTimerEnable = async (enabled: boolean) => writeChar(LAMP_CHAR_UUIDS.timerEnable, encodeUint8(enabled ? 1 : 0));
  const setHueTime = async (minutes: number) => writeChar(LAMP_CHAR_UUIDS.hueTime, encodeUint16LE(minutes));
  const setHueFade = async (minutes: number) => writeChar(LAMP_CHAR_UUIDS.hueFade, encodeUint16LE(minutes));
  const setTimeEpoch = async (epochSeconds: number) => writeChar(LAMP_CHAR_UUIDS.lampTime, encodeUint32LE(epochSeconds));

  const readSecurityStatus = async () => {
    try {
      const payload = await readChar(LAMP_CHAR_UUIDS.securityStatus);
      if (!payload.length) return null;
      return {
        bonded: readUint8(payload, 0) > 0,
        authenticated: readUint8(payload, 1) > 0,
        encrypted: readUint8(payload, 2) > 0,
      };
    } catch (err) {
      return null;
    }
  };

  const updatePasskey = async (oldPasskey: number, newPasskey: number) => {
    const payload = encodePasskeyUpdate(oldPasskey, newPasskey);
    await writeChar(LAMP_CHAR_UUIDS.passkeyUpdate, payload);
  };

  const readStatus = async (): Promise<LampStatus | null> => {
    try {
      const payload = await readChar(LAMP_CHAR_UUIDS.heartbeat);
      if (payload.length) return decodeHeartbeat(payload);
    } catch (err) {
      // ignore and fall back to individual reads
    }

    const [
      powerRaw,
      intensityRaw,
      hueRaw,
      pwmRaw,
      timerOnRaw,
      timerOffRaw,
      hueTimeRaw,
      hueFadeRaw,
      timerEnableRaw,
      tempMcuRaw,
      tempBoardRaw,
      tempHeatsinkRaw,
      currentRaw,
      lampTimeRaw,
      lampTimeSyncedRaw,
    ] = await Promise.all([
      readChar(LAMP_CHAR_UUIDS.power),
      readChar(LAMP_CHAR_UUIDS.intensity),
      readChar(LAMP_CHAR_UUIDS.hue),
      readChar(LAMP_CHAR_UUIDS.pwmFreq),
      readChar(LAMP_CHAR_UUIDS.timerOn),
      readChar(LAMP_CHAR_UUIDS.timerOff),
      readChar(LAMP_CHAR_UUIDS.hueTime),
      readChar(LAMP_CHAR_UUIDS.hueFade),
      readChar(LAMP_CHAR_UUIDS.timerEnable),
      readChar(LAMP_CHAR_UUIDS.tempMcu),
      readChar(LAMP_CHAR_UUIDS.tempBoard),
      readChar(LAMP_CHAR_UUIDS.tempHeatsink),
      readChar(LAMP_CHAR_UUIDS.current),
      readChar(LAMP_CHAR_UUIDS.lampTime),
      readChar(LAMP_CHAR_UUIDS.lampTimeSynced),
    ]);

    return {
      power: readUint8(powerRaw, 0) > 0,
      intensity: readUint8(intensityRaw, 0),
      hue: readUint16LE(hueRaw, 0),
      pwmFreq: readUint32LE(pwmRaw, 0),
      timerOn: readUint16LE(timerOnRaw, 0),
      timerOff: readUint16LE(timerOffRaw, 0),
      hueTime: readUint16LE(hueTimeRaw, 0),
      hueFade: readUint16LE(hueFadeRaw, 0),
      timerEnabled: readUint8(timerEnableRaw, 0) > 0,
      tempMcu: readInt16LE(tempMcuRaw, 0) / 10,
      tempBoard: readInt16LE(tempBoardRaw, 0) / 10,
      tempHeatsink: readInt16LE(tempHeatsinkRaw, 0) / 10,
      currentDraw: readUint16LE(currentRaw, 0),
      lampTimeEpoch: readUint32LE(lampTimeRaw, 0),
      lampTimeSynced: readUint8(lampTimeSyncedRaw, 0) > 0,
    };
  };

  const subscribeStatus = async (onStatus: (status: LampStatus) => void) => {
    const service = await getService();
    const characteristic = await service.getCharacteristic(LAMP_CHAR_UUIDS.heartbeat);
    await characteristic.startNotifications();

    const handler = (event: Event) => {
      const target = event.target as WebBluetoothGattCharacteristic | null;
      if (!target?.value) return;
      const data = new Uint8Array(target.value.buffer.slice(0));
      if (!data.length) return;
      onStatus(decodeHeartbeat(data));
    };

    characteristic.addEventListener('characteristicvaluechanged', handler);

    return () => {
      characteristic.removeEventListener('characteristicvaluechanged', handler);
      characteristic.stopNotifications().catch(() => undefined);
    };
  };

  return {
    scan,
    connect,
    connectTo,
    disconnect,
    setPower,
    setIntensity,
    setHue,
    setPwmFreq,
    setTimerOn,
    setTimerOff,
    setTimerEnable,
    setHueTime,
    setHueFade,
    setTimeEpoch,
    readSecurityStatus,
    updatePasskey,
    readStatus,
    subscribeStatus,
  };
};
