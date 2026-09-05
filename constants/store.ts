// Fill this in with the numeric App Store ID once the App Store Connect
// listing exists (Settings screen "Rate" / "Share" links need it to deep-link
// straight to the listing instead of falling back to the web page).
export const IOS_APP_STORE_ID = '';

const IOS_WEB_FALLBACK = 'https://mousewerk.de/sprig';
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.mousewerk.sprig';

export const STORE_URLS = {
  ios: IOS_APP_STORE_ID ? `https://apps.apple.com/app/id${IOS_APP_STORE_ID}` : IOS_WEB_FALLBACK,
  iosReview: IOS_APP_STORE_ID
    ? `itms-apps://itunes.apple.com/app/id${IOS_APP_STORE_ID}?action=write-review`
    : IOS_WEB_FALLBACK,
  android: ANDROID_STORE_URL,
  androidMarket: 'market://details?id=com.mousewerk.sprig',
};
