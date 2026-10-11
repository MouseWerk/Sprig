<div align="center">

<img src="docs/assets/icon.png" alt="Sprig logo" width="104" height="104">

# Sprig

**Turn any CSV into flashcards.**

A calm, offline-first study app for Android. Import a `question,answer` file and it
becomes a spaced-repetition deck — swipe through cards, quiz yourself, and grow a
plant while you focus.

![Version](https://img.shields.io/badge/v2.1.0-2E5C4E)
![Expo](https://img.shields.io/badge/Expo_SDK_54-000020?logo=expo&logoColor=white)
![Android](https://img.shields.io/badge/Android-white?logo=android&logoColor=3ddc84)
![Offline first](https://img.shields.io/badge/100%25_offline-no_account_needed-0f172a)

<br>

<img src="docs/assets/screens/deck-details.png" alt="Deck overview" width="31%">&nbsp;&nbsp;&nbsp;&nbsp;
<img src="docs/assets/screens/study-swipe.png" alt="Swipe study with focus plant" width="31%">

</div>

<br>

## Features

- **Swipe, quiz, type or scroll** — four study modes, scheduled by SM-2 spaced repetition
- **Focus garden** — a plant grows while you study and wilts if you leave; ambient sounds included
- **PDFs & audio** — your textbooks and lectures next to your decks, with WiFi drop from your computer
- **Anki import & images** — bring .apkg decks along, attach images to any card
- **Streaks, XP & achievements** — progress that keeps you coming back
- **Private by design** — no account, no servers, everything stays on your device

## Development

```bash
npm install
npx expo start
```

Built with [Expo](https://expo.dev) SDK 54.

## Release

Releases are built on GitHub Actions without a cloud build service: bump
`version` and `android.versionCode` in `app.json` on `master`, and
`.github/workflows/release.yml` builds the signed APK and App Bundle and
publishes them as the GitHub release `v<version>`.

Signing uses the Play upload key from four repository secrets:
`ANDROID_KEYSTORE` (the `.jks`, base64), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Without them the build is
debug-signed (with a notice in the run).

Local release build, with the keystore in `keystore.properties` (gitignored):

```bash
npx expo prebuild --platform android --clean
cd android && ./gradlew bundleRelease
cd .. && node scripts/android-release.mjs --track internal
```

**Important:** the upload key used to be managed by EAS. Download it once
(`eas credentials -p android` → "Download existing keystore") while the Expo
account still exists, or request an upload key reset in Play Console. All
steps: [docs/release.md](docs/release.md).

## Support

<a href="https://buymeacoffee.com/mousewerk">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy me a coffee" height="44">
</a>

---

<div align="center">

**[Landing page](https://mousewerk.github.io/Sprig/)** · **[Privacy policy](https://mousewerk.de/sprig/privacy)**

Sounds by [Moodist](https://github.com/remvze/moodist) (CC0) · Icons by [Lucide](https://lucide.dev)

© 2026 Mousewerk

</div>
