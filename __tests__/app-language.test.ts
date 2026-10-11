import AsyncStorage from '@react-native-async-storage/async-storage';
import { detectDefaultLanguage, getAppLanguage, LANGUAGE_STORAGE_KEY, plural, translate } from '@/utils/AppLanguage';
import { translations } from '@/constants/translations';

describe('getAppLanguage', () => {
    beforeEach(() => AsyncStorage.clear());

    it('uses the language saved in Settings', async () => {
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
        await expect(getAppLanguage()).resolves.toBe('de');
    });

    it('falls back to the device language, like the app does on launch', async () => {
        // Notifications and the widget used to fall back to English here,
        // while the app itself showed German on a German phone.
        await expect(getAppLanguage()).resolves.toBe(detectDefaultLanguage());
    });

    it('ignores a stored value it does not know', async () => {
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
        await expect(getAppLanguage()).resolves.toBe(detectDefaultLanguage());
    });
});

describe('plural', () => {
    const t = (key: keyof typeof translations.en) => translate('de', key);

    it('uses the singular for exactly one', () => {
        expect(plural(t, 1, 'cardsCountOne', 'deckDetailsCardsCount')).toBe('1 Karte');
        expect(plural(t, 0, 'cardsCountOne', 'deckDetailsCardsCount')).toBe('0 Karten');
        expect(plural(t, 12, 'imagesCountOne', 'imagesCountMany')).toBe('12 Bilder');
    });
});
