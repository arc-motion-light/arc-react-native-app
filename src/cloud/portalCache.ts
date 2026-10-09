import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PortalDeviceSummary } from './portalTypes';

const CACHE_KEY = 'arc.portal.devices.presentation.v2';

type PortalDeviceCache = {
  userId: string;
  cachedAt: number;
  devices: PortalDeviceSummary[];
};

/**
 * Presentation cache only. Cached DeviceAccess must never be used as durable
 * local authorization for commands; it exists so previously known canonical
 * devices remain visible during a temporary Portal outage.
 */
export const loadPortalDevicePresentationCache = async (
  userId: string
): Promise<PortalDeviceCache | null> => {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PortalDeviceCache>;
    if (parsed.userId !== userId || !Array.isArray(parsed.devices) || typeof parsed.cachedAt !== 'number') {
      return null;
    }
    // Old operational records remain useful offline. This cache never authorizes writes.
    return parsed as PortalDeviceCache;
  } catch {
    return null;
  }
};

export const savePortalDevicePresentationCache = async (
  userId: string,
  devices: PortalDeviceSummary[]
): Promise<void> => {
  const payload: PortalDeviceCache = { userId, cachedAt: Date.now(), devices };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
};

export const clearPortalDevicePresentationCache = async (): Promise<void> => {
  await AsyncStorage.removeItem(CACHE_KEY);
};
