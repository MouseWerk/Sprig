import { NativeModules } from 'react-native';

// Thin guard layer around react-native-track-player. The native module only
// exists in dev/EAS builds — in Expo Go every access must be avoided, so the
// library is require()d lazily and callers check availability first.

export function isNativePlayerAvailable(): boolean {
    return NativeModules.TrackPlayerModule != null;
}

export function tp() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('react-native-track-player');
    return {
        TrackPlayer: m.default as typeof import('react-native-track-player').default,
        Event: m.Event as typeof import('react-native-track-player').Event,
        State: m.State as typeof import('react-native-track-player').State,
        Capability: m.Capability as typeof import('react-native-track-player').Capability,
        AppKilledPlaybackBehavior: m.AppKilledPlaybackBehavior as typeof import('react-native-track-player').AppKilledPlaybackBehavior,
    };
}

let setupPromise: Promise<void> | null = null;

// Idempotent player setup: media-session capabilities drive which buttons the
// Android notification / lock screen shows.
export function ensurePlayerSetup(): Promise<void> {
    if (!setupPromise) {
        setupPromise = (async () => {
            const { TrackPlayer, Capability, AppKilledPlaybackBehavior } = tp();
            try {
                await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
            } catch {
                // Already initialized (hot reload / re-entry) — fine.
            }
            await TrackPlayer.updateOptions({
                android: {
                    appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
                },
                capabilities: [
                    Capability.Play,
                    Capability.Pause,
                    Capability.SeekTo,
                    Capability.JumpForward,
                    Capability.JumpBackward,
                    Capability.Stop,
                ],
                compactCapabilities: [
                    Capability.Play,
                    Capability.Pause,
                    Capability.JumpForward,
                    Capability.JumpBackward,
                ],
                forwardJumpInterval: 15,
                backwardJumpInterval: 15,
            });
        })();
    }
    return setupPromise;
}
