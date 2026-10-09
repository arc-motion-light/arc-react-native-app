import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppThemePreference } from './theme';

const APP_THEME_PREFERENCE_KEY = '@arc/app-theme-preference/v1';

const isAppThemePreference = (value: unknown): value is AppThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

export const loadAppThemePreference = async (): Promise<AppThemePreference> => {
  try {
    const value = await AsyncStorage.getItem(APP_THEME_PREFERENCE_KEY);
    return isAppThemePreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
};

export const saveAppThemePreference = async (preference: AppThemePreference): Promise<void> => {
  await AsyncStorage.setItem(APP_THEME_PREFERENCE_KEY, preference);
};
