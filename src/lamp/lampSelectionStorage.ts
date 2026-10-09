import AsyncStorage from '@react-native-async-storage/async-storage';

const SELECTED_LAMP_ID_KEY = '@arc/selected-lamp-id/v1';

export const loadSelectedLampId = async (): Promise<string | null> => {
  try {
    const value = await AsyncStorage.getItem(SELECTED_LAMP_ID_KEY);
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
};

export const saveSelectedLampId = async (lampId: string | null): Promise<void> => {
  if (lampId) {
    await AsyncStorage.setItem(SELECTED_LAMP_ID_KEY, lampId);
    return;
  }
  await AsyncStorage.removeItem(SELECTED_LAMP_ID_KEY);
};
