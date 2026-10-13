import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {createOfflineAccessStore} from './offlineHardwareAccess';
async function available(){if(Platform.OS==='web'||!await SecureStore.isAvailableAsync())throw new Error('Native protected permission storage unavailable; no plaintext authorization fallback');}
export const nativeOfflineAccess=createOfflineAccessStore({
 async get(key){await available();return SecureStore.getItemAsync(key);},
 async set(key,value){await available();await SecureStore.setItemAsync(key,value,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});},
 async remove(key){await available();await SecureStore.deleteItemAsync(key);},
});
