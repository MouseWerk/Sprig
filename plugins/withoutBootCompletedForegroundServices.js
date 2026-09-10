const { withAndroidManifest } = require('@expo/config-plugins');

// Play Console flags the app under "Restricted foreground service types":
// apps targeting Android 15+ may not start restricted service types
// (mediaPlayback, microphone, dataSync, …) from a BOOT_COMPLETED receiver.
// The check is static — it only looks at the merged manifest — and Sprig
// trips it by combining two libraries' declarations:
//
//   - expo-notifications registers its NotificationsService receiver for
//     BOOT_COMPLETED (to re-arm scheduled alarms after a reboot). It never
//     starts a foreground service, but the receiver is what Play matches on.
//   - expo-audio declares two foreground services: AudioControlsService
//     (mediaPlayback — genuinely used, the audio tab plays in the background)
//     and AudioRecordingService (microphone — dead weight here: nothing in
//     the app records, and RECORD_AUDIO is already in blockedPermissions).
//
// Both live in library manifests, so this plugin uses manifest-merger
// directives from the app manifest: the notifications receiver is replaced
// wholesale with a copy that keeps NOTIFICATION_EVENT (how scheduled
// notifications are delivered) and MY_PACKAGE_REPLACED (re-arm after an
// update) but drops the boot actions; the recording service is removed.
// RECEIVE_BOOT_COMPLETED itself goes via android.blockedPermissions in
// app.json. The one real cost — the daily reminder no longer survives a
// reboot on its own — is covered by rearmStreakReminderOnLaunch() in
// utils/Notifications.ts, which re-schedules it whenever the app opens.

const NOTIFICATIONS_RECEIVER = 'expo.modules.notifications.service.NotificationsService';
const RECORDING_SERVICE = 'expo.modules.audio.service.AudioRecordingService';

module.exports = function withoutBootCompletedForegroundServices(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';
    const app = manifest.application?.[0];
    if (!app) throw new Error('[withoutBootCompletedForegroundServices] no <application> in AndroidManifest.xml');

    app.receiver = (app.receiver || []).filter(r => r.$['android:name'] !== NOTIFICATIONS_RECEIVER);
    app.receiver.push({
      $: {
        'android:name': NOTIFICATIONS_RECEIVER,
        'android:enabled': 'true',
        'android:exported': 'false',
        'tools:node': 'replace',
      },
      'intent-filter': [{
        $: { 'android:priority': '-1' },
        action: [
          { $: { 'android:name': 'expo.modules.notifications.NOTIFICATION_EVENT' } },
          { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
        ],
      }],
    });

    app.service = (app.service || []).filter(s => s.$['android:name'] !== RECORDING_SERVICE);
    app.service.push({
      $: { 'android:name': RECORDING_SERVICE, 'tools:node': 'remove' },
    });

    return config;
  });
};
