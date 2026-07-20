import AsyncStorage from '@react-native-async-storage/async-storage';

// The app's AsyncStorage keys used to be prefixed with the old project slug
// "csvtudyapp"; they're now "sprig_*" to match the shipped branding. Reading
// through this helper instead of AsyncStorage.getItem directly carries an
// existing value across on first read after the upgrade, then cleans up the
// old key so this only ever runs once per install.
export async function migrateKey(oldKey: string, newKey: string): Promise<string | null> {
    try {
        const current = await AsyncStorage.getItem(newKey);
        if (current != null) return current;
        const legacy = await AsyncStorage.getItem(oldKey);
        if (legacy == null) return null;
        await AsyncStorage.setItem(newKey, legacy);
        await AsyncStorage.removeItem(oldKey);
        return legacy;
    } catch {
        return null;
    }
}
