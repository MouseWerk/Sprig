// Numeric App Store ID of the "Sprig - Study Companion" listing. The Settings
// screen's "Rate" / "Share" links need it to deep-link straight to the App
// Store; without it they fall back to the website.
export const IOS_APP_STORE_ID = '6809030673';

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
