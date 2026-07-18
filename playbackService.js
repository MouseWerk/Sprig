// react-native-track-player background service: translates lock-screen /
// notification / headset button events into player actions. Registered in
// index.js; runs even while the app UI is backgrounded.
const TrackPlayer = require('react-native-track-player').default;
const { Event } = require('react-native-track-player');

module.exports = async function () {
    TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
    TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
    TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.reset());
    TrackPlayer.addEventListener(Event.RemoteSeek, (e) => TrackPlayer.seekTo(e.position));
    TrackPlayer.addEventListener(Event.RemoteJumpForward, async (e) => {
        const progress = await TrackPlayer.getProgress();
        TrackPlayer.seekTo(progress.position + (e.interval || 15));
    });
    TrackPlayer.addEventListener(Event.RemoteJumpBackward, async (e) => {
        const progress = await TrackPlayer.getProgress();
        TrackPlayer.seekTo(Math.max(0, progress.position - (e.interval || 15)));
    });
    TrackPlayer.addEventListener(Event.RemoteDuck, (e) => {
        if (e.paused) TrackPlayer.pause();
    });
};
