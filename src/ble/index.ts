import { Platform } from 'react-native';
import type { LampBle } from './bleTypes';
import { createNativeLampBle } from './nativeBle';
import { createWebLampBle } from './webBle';

export const createLampBle = (): LampBle => {
  if (Platform.OS === 'web') {
    return createWebLampBle();
  }
  return createNativeLampBle();
};
