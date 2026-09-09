import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage's native module isn't always available inside Expo Go for
// every SDK/client combination ("Native module is null" errors). This
// wrapper keeps every read/write working regardless — falling back to an
// in-memory cache so the app never crashes — while still persisting to disk
// whenever the real native module IS available (any custom/dev/production
// build made via `expo prebuild` + Android Studio, or EAS build).
const memoryStore = new Map<string, string>();
let nativeStorageAvailable = true;

export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (nativeStorageAvailable) {
      try {
        return await AsyncStorage.getItem(key);
      } catch {
        nativeStorageAvailable = false;
      }
    }
    return memoryStore.has(key) ? (memoryStore.get(key) as string) : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    memoryStore.set(key, value);
    if (nativeStorageAvailable) {
      try {
        await AsyncStorage.setItem(key, value);
      } catch {
        nativeStorageAvailable = false;
      }
    }
  },

  async removeItem(key: string): Promise<void> {
    memoryStore.delete(key);
    if (nativeStorageAvailable) {
      try {
        await AsyncStorage.removeItem(key);
      } catch {
        nativeStorageAvailable = false;
      }
    }
  },
};
