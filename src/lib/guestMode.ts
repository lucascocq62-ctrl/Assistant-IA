import AsyncStorage from '@react-native-async-storage/async-storage';

const guestModeStorageKey = 'vethelp_guest_mode';

export const getGuestMode = async () => (await AsyncStorage.getItem(guestModeStorageKey)) === 'true';

export const setGuestMode = async (enabled: boolean) => {
  if (enabled) {
    await AsyncStorage.setItem(guestModeStorageKey, 'true');
    return;
  }

  await AsyncStorage.removeItem(guestModeStorageKey);
};
