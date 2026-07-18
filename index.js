import 'expo-router/entry';

// Register the playback service that powers lock-screen and notification
// media controls. In Expo Go the native module is absent — skip silently.
try {
    const TrackPlayer = require('react-native-track-player').default;
    TrackPlayer.registerPlaybackService(() => require('./playbackService'));
} catch {
    // Expo Go — audio playback is handled by the guard in the Audio tab.
}
