const { withEntitlementsPlist } = require('@expo/config-plugins');

// expo-notifications is auto-applied by Expo's prebuild config for any
// project with the package installed, regardless of app.json's plugins list,
// and it unconditionally adds the aps-environment (Push Notifications)
// entitlement. Sprig only ever schedules local notifications, never remote
// push, and that entitlement blocks free Personal Team code signing — so
// this plugin (listed last in app.json) removes it again after the fact.
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
