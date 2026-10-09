import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';
import { LAMP_CHAR_UUIDS, LAMP_SERVICE_UUID } from '../protocol/lampUuids';
import {
  encodeUint16LE,
  encodePasskeyUpdate,
  encodeUint32LE,
  encodeUint8,
  fromBase64,
  readInt16LE,
  readUint16LE,
  readUint32LE,
  readUint8,
  toBase64,
} from '../protocol/valueCodec';
import type { LampBle, LampBleDevice, LampStatus } from './bleTypes';
import { clampLampIntensity } from '../lamp/lampLimits';

const manager = new BleManager();
const log = (...args: any[]) => console.log('[BLE]', ...args);
const logError = (label: string, err: unknown) => console.log(`[BLE] ${label}`, err);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ENABLE_MTU_REQUEST = false;
const ENABLE_CONN_PRIORITY = false;
const bondingModule = NativeModules?.BleBonding as
  | { createBond?: (deviceId: string) => Promise<boolean> }
  | undefined;

const ensureBluetoothConnectPermission = async () => {
  if (Platform.OS !== 'android') return true;
  if (typeof Platform.Version === 'number' && Platform.Version >= 31) {
    try {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      logError('permission request failed', err);
      return false;
    }
  }
  return true;
};

const writeChar = async (device: Device, characteristicUuid: string, value: Uint8Array) => {
  const payload = toBase64(value);
  await device.writeCharacteristicWithResponseForService(
    LAMP_SERVICE_UUID,
    characteristicUuid,
    payload
  );
};

const readChar = async (device: Device, characteristicUuid: string) => {
  const characteristic = await device.readCharacteristicForService(LAMP_SERVICE_UUID, characteristicUuid);
  if (!characteristic.value) return new Uint8Array();
  return fromBase64(characteristic.value);
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
    lampTimeEpoch,
    lampTimeSynced,
    tempMcu,
    tempBoard,
    tempHeatsink,
    currentDraw,
  };
};

export const createNativeLampBle = (): LampBle => {
  let device: Device | null = null;
  let disconnectSub: { remove: () => void } | null = null;
  let lastScan = new Map<string, Device>();
  let reconnectInFlight = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY_MS = 1200;

  const toLampDevice = (scanned: Device): LampBleDevice => ({
    id: scanned.id,
    name: scanned.name,
    localName: scanned.localName,
  });

  const scan = async () => {
    lastScan = new Map();

    log('scan start');

    const devices = await new Promise<LampBleDevice[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        manager.stopDeviceScan();
        resolve(Array.from(lastScan.values()).map(toLampDevice));
      }, 8000);

      manager.startDeviceScan([LAMP_SERVICE_UUID], null, (error, scannedDevice) => {
        if (error) {
          clearTimeout(timeout);
          manager.stopDeviceScan();
          logError('scan error', error);
          reject(error);
          return;
        }

        if (scannedDevice) {
          lastScan.set(scannedDevice.id, scannedDevice);
        }
      });
    });
    log('scan done', { count: devices.length });

    return devices.sort((a, b) => (a.name || a.localName || a.id).localeCompare(b.name || b.localName || b.id));
  };

  const connect = async () => {
    if (device) return;

    const devices = await scan();
    if (!devices.length) throw new Error('No devices found');
    await connectTo(devices[0].id);
  };

  const connectTo = async (deviceId: string) => {
    if (device) return;

    manager.stopDeviceScan();
    const scanned = lastScan.get(deviceId);
    const connectOptions = Platform.OS === 'android' ? { autoConnect: false, timeout: 15000 } : { timeout: 15000 };
    const connectDevice = async () => await manager.connectToDevice(deviceId, connectOptions);
    const isConnected = async (candidate: Device) => {
      try {
        return await candidate.isConnected();
      } catch (err) {
        logError('isConnected failed', err);
        return true;
      }
    };
    log('connect start', {
      deviceId,
      scanned: scanned
        ? { id: scanned.id, name: scanned.name, localName: scanned.localName }
        : null,
    });
    let connected = await connectDevice();
    log('connect ok', { id: connected.id, name: connected.name, localName: connected.localName });
    if (Platform.OS === 'android' && ENABLE_CONN_PRIORITY) {
      const priorityFn = (connected as Device & {
        requestConnectionPriority?: (priority: 'balanced' | 'high' | 'lowPower') => Promise<void>;
      }).requestConnectionPriority;
      if (priorityFn) {
        try {
          log('requestConnectionPriority start');
          await priorityFn.call(connected, 'high');
          log('requestConnectionPriority ok');
        } catch (err) {
          logError('requestConnectionPriority failed', err);
        }
      } else {
        log('requestConnectionPriority unavailable');
      }
    }
    if (Platform.OS === 'android') {
      const bondFn = (connected as Device & { createBond?: () => Promise<void> }).createBond;
      if (bondingModule?.createBond) {
        try {
          const permitted = await ensureBluetoothConnectPermission();
          if (!permitted) {
            log('createBond(native) skipped due to missing permission');
          } else {
          log('createBond(native) start');
          await bondingModule.createBond(connected.id);
          log('createBond(native) ok');
          }
        } catch (err) {
          logError('createBond(native) failed', err);
        }
      } else if (bondFn) {
        try {
          log('createBond start');
          await bondFn.call(connected);
          log('createBond ok');
        } catch (err) {
          logError('createBond failed', err);
        }
      } else {
        log('createBond unavailable in this build');
      }
    }
    log('discover start');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const delayMs = 800 + attempt * 700;
      log('discover attempt', { attempt, delayMs });
      await wait(delayMs);
      if (ENABLE_MTU_REQUEST && Platform.OS === 'android') {
        try {
          log('requestMTU start');
          await connected.requestMTU(185);
          log('requestMTU ok');
        } catch (err) {
          logError('requestMTU failed', err);
        }
      } else if (Platform.OS === 'android') {
        log('requestMTU skipped');
      }

      const stillConnected = await isConnected(connected);
      log('isConnected', { attempt, stillConnected });
      if (!stillConnected) {
        log('reconnect before discover');
        connected = await connectDevice();
      }

      try {
        connected = await connected.discoverAllServicesAndCharacteristics();
        break;
      } catch (err) {
        logError('discover failed', err);
        if (attempt === 3) throw err;
        log('retry connect after discover failure');
        connected = await connectDevice();
      }
    }
    log('discover done');
    const services = await connected.services();
    const serviceUuids = services.map((service) => service.uuid.toLowerCase());
    log('services', serviceUuids);
    if (!serviceUuids.includes(LAMP_SERVICE_UUID)) {
      log('service missing, retrying discovery', { target: LAMP_SERVICE_UUID });
      await wait(600);
      await connected.discoverAllServicesAndCharacteristics();
      const retryServices = await connected.services();
      const retryUuids = retryServices.map((service) => service.uuid.toLowerCase());
      log('services retry', retryUuids);
      if (!retryUuids.includes(LAMP_SERVICE_UUID)) {
        throw new Error(`Service ${LAMP_SERVICE_UUID} not found. Clear Android GATT cache and retry.`);
      }
    }
    disconnectSub?.remove();
    disconnectSub = connected.onDisconnected((error, disconnected) => {
      if (error) {
        logError('disconnected', error);
      } else {
        log('disconnected', { id: disconnected?.id });
      }
      device = null;
      disconnectSub?.remove();
      disconnectSub = null;

      if (!disconnected?.id) return;
      if (reconnectInFlight || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
      reconnectInFlight = true;
      reconnectAttempts += 1;
      log('reconnect scheduled', { attempt: reconnectAttempts, delayMs: RECONNECT_DELAY_MS });
      setTimeout(async () => {
        try {
          await connectTo(disconnected.id);
          reconnectAttempts = 0;
          log('reconnect ok');
        } catch (err) {
          logError('reconnect failed', err);
        } finally {
          reconnectInFlight = false;
        }
      }, RECONNECT_DELAY_MS);
    });
    device = connected;
  };

  const disconnect = async () => {
    if (!device) return;
    await device.cancelConnection();
    device = null;
    disconnectSub?.remove();
    disconnectSub = null;
  };

  const setPower = async (value: boolean) => {
    if (!device) throw new Error('Not connected');
    await writeChar(device, LAMP_CHAR_UUIDS.power, encodeUint8(value ? 1 : 0));
  };

  const setIntensity = async (value: number) => {
    if (!device) throw new Error('Not connected');
    await writeChar(device, LAMP_CHAR_UUIDS.intensity, encodeUint8(clampLampIntensity(value)));
  };

  const setHue = async (value: number) => {
    if (!device) throw new Error('Not connected');
    await writeChar(device, LAMP_CHAR_UUIDS.hue, encodeUint16LE(value));
  };

  const setPwmFreq = async (value: number) => {
    if (!device) throw new Error('Not connected');
    await writeChar(device, LAMP_CHAR_UUIDS.pwmFreq, encodeUint32LE(value));
  };

  const setTimerOn = async (minutes: number) => {
    if (!device) throw new Error('Not connected');
    await writeChar(device, LAMP_CHAR_UUIDS.timerOn, encodeUint16LE(minutes));
  };

  const setTimerOff = async (minutes: number) => {
    if (!device) throw new Error('Not connected');
    await writeChar(device, LAMP_CHAR_UUIDS.timerOff, encodeUint16LE(minutes));
  };

  const setTimerEnable = async (enabled: boolean) => {
    if (!device) throw new Error('Not connected');
    await writeChar(device, LAMP_CHAR_UUIDS.timerEnable, encodeUint8(enabled ? 1 : 0));
  };

  const setHueTime = async (minutes: number) => {
    if (!device) throw new Error('Not connected');
    await writeChar(device, LAMP_CHAR_UUIDS.hueTime, encodeUint16LE(minutes));
  };

  const setHueFade = async (minutes: number) => {
    if (!device) throw new Error('Not connected');
    await writeChar(device, LAMP_CHAR_UUIDS.hueFade, encodeUint16LE(minutes));
  };

  const setTimeEpoch = async (epochSeconds: number) => {
    if (!device) throw new Error('Not connected');
    await writeChar(device, LAMP_CHAR_UUIDS.lampTime, encodeUint32LE(epochSeconds));
  };

  const readStatus = async (): Promise<LampStatus | null> => {
    if (!device) return null;
    try {
      const heartbeat = await readChar(device, LAMP_CHAR_UUIDS.heartbeat);
      if (heartbeat.length) {
        return decodeHeartbeat(heartbeat);
      }
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
      readChar(device, LAMP_CHAR_UUIDS.power),
      readChar(device, LAMP_CHAR_UUIDS.intensity),
      readChar(device, LAMP_CHAR_UUIDS.hue),
      readChar(device, LAMP_CHAR_UUIDS.pwmFreq),
      readChar(device, LAMP_CHAR_UUIDS.timerOn),
      readChar(device, LAMP_CHAR_UUIDS.timerOff),
      readChar(device, LAMP_CHAR_UUIDS.hueTime),
      readChar(device, LAMP_CHAR_UUIDS.hueFade),
      readChar(device, LAMP_CHAR_UUIDS.timerEnable),
      readChar(device, LAMP_CHAR_UUIDS.tempMcu),
      readChar(device, LAMP_CHAR_UUIDS.tempBoard),
      readChar(device, LAMP_CHAR_UUIDS.tempHeatsink),
      readChar(device, LAMP_CHAR_UUIDS.current),
      readChar(device, LAMP_CHAR_UUIDS.lampTime),
      readChar(device, LAMP_CHAR_UUIDS.lampTimeSynced),
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

  const readSecurityStatus = async () => {
    if (!device) return null;
    try {
      const payload = await readChar(device, LAMP_CHAR_UUIDS.securityStatus);
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
    if (!device) throw new Error('Not connected');
    const payload = encodePasskeyUpdate(oldPasskey, newPasskey);
    await writeChar(device, LAMP_CHAR_UUIDS.passkeyUpdate, payload);
  };

  const subscribeStatus = async (onStatus: (status: LampStatus) => void) => {
    if (!device) throw new Error('Not connected');
    const subscription = device.monitorCharacteristicForService(
      LAMP_SERVICE_UUID,
      LAMP_CHAR_UUIDS.heartbeat,
      (error, characteristic) => {
        if (error) {
          logError('notify error', error);
          return;
        }
        if (!characteristic?.value) {
          log('notify empty');
          return;
        }
        const data = fromBase64(characteristic.value);
        if (!data.length) return;
        onStatus(decodeHeartbeat(data));
      }
    );

    return () => subscription.remove();
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
