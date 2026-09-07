import AsyncStorage from '@react-native-async-storage/async-storage';

// Each test needs the module's private cache back at its initial state, so the
// module is re-required rather than imported once at the top.
const loadModule = () => {
    let mod!: typeof import('@/utils/Preferences');
    jest.isolateModules(() => { mod = require('@/utils/Preferences'); });
    return mod;
};

beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
});

describe('stored preferences', () => {
    it('falls back to the defaults when nothing is stored', async () => {
        const prefs = loadModule();
        expect((await prefs.getPrefs()).dailyGoal).toBe(prefs.DEFAULT_PREFS.dailyGoal);
    });

    it('reads a stored value back', async () => {
        await AsyncStorage.setItem('sprig_prefs', JSON.stringify({ dailyGoal: 50 }));
        const prefs = loadModule();
        expect((await prefs.getPrefs()).dailyGoal).toBe(50);
    });

    it('fills in defaults for keys a stored blob does not have', async () => {
        await AsyncStorage.setItem('sprig_prefs', JSON.stringify({ dailyGoal: 30 }));
        const prefs = loadModule();
        const all = await prefs.getPrefs();
        expect(all.dailyGoal).toBe(30);
        expect(all.defaultFocusMinutes).toBe(prefs.DEFAULT_PREFS.defaultFocusMinutes);
    });

    it('survives a corrupt blob instead of throwing', async () => {
        await AsyncStorage.setItem('sprig_prefs', 'not json at all');
        const prefs = loadModule();
        expect((await prefs.getPrefs()).dailyGoal).toBe(prefs.DEFAULT_PREFS.dailyGoal);
    });
});

describe('the startup race', () => {
    it('does not let a setPref during startup be overwritten by the stored value', async () => {
        // The old guard set a "loaded" flag before awaiting, so a second caller
        // walked past while the read was still in flight: setPref wrote on top
        // of the defaults and the stored values then clobbered it.
        await AsyncStorage.setItem('sprig_prefs', JSON.stringify({ dailyGoal: 50, hapticsEnabled: true }));
        const prefs = loadModule();

        const [, after] = await Promise.all([
            prefs.getPrefs(),                          // kicks off the read
            prefs.setPref('hapticsEnabled', false),    // races it
        ]);

        expect(after.hapticsEnabled).toBe(false);      // the change survives
        expect(after.dailyGoal).toBe(50);              // and the stored value is still there
        expect(JSON.parse((await AsyncStorage.getItem('sprig_prefs'))!)).toMatchObject({
            dailyGoal: 50, hapticsEnabled: false,
        });
    });

    it('reads the store only once no matter how many callers arrive', async () => {
        await AsyncStorage.setItem('sprig_prefs', JSON.stringify({ dailyGoal: 30 }));
        const spy = jest.spyOn(AsyncStorage, 'getItem');
        const prefs = loadModule();

        await Promise.all([prefs.getPrefs(), prefs.getPrefs(), prefs.getPrefs()]);

        const prefReads = spy.mock.calls.filter(([key]) => key === 'sprig_prefs');
        expect(prefReads.length).toBe(1);
    });
});

describe('resetPrefsCache', () => {
    it('puts the in-memory mirror back to defaults after a full wipe', async () => {
        await AsyncStorage.setItem('sprig_prefs', JSON.stringify({ dailyGoal: 50 }));
        const prefs = loadModule();
        expect((await prefs.getPrefs()).dailyGoal).toBe(50);

        await AsyncStorage.clear();     // what "Delete all data" does
        prefs.resetPrefsCache();

        expect(prefs.getPrefsSync().dailyGoal).toBe(prefs.DEFAULT_PREFS.dailyGoal);
    });

    it('stops the next setPref from writing the pre-wipe values back', async () => {
        await AsyncStorage.setItem('sprig_prefs', JSON.stringify({ dailyGoal: 50 }));
        const prefs = loadModule();
        await prefs.getPrefs();

        await AsyncStorage.clear();
        prefs.resetPrefsCache();
        await prefs.setPref('hapticsEnabled', false);

        const written = JSON.parse((await AsyncStorage.getItem('sprig_prefs'))!);
        expect(written.dailyGoal).toBe(prefs.DEFAULT_PREFS.dailyGoal);   // not 50
        expect(written.hapticsEnabled).toBe(false);
    });

    it('notifies subscribers so open screens redraw with the defaults', async () => {
        await AsyncStorage.setItem('sprig_prefs', JSON.stringify({ dailyGoal: 50 }));
        const prefs = loadModule();
        await prefs.getPrefs();

        const seen: number[] = [];
        const unsubscribe = prefs.subscribePrefs(p => seen.push(p.dailyGoal));
        await Promise.resolve();

        prefs.resetPrefsCache();
        unsubscribe();
        expect(seen[seen.length - 1]).toBe(prefs.DEFAULT_PREFS.dailyGoal);
    });
});
