<div align="center">

<img src="docs/assets/icon.png" alt="Sprig logo" width="96" height="96">

# Sprig

**Turn any CSV into flashcards.**

A calm, offline-first study app for Android. Import a `question,answer` file and it becomes a
spaced-repetition deck — swipe through cards, quiz yourself, and grow a plant while you focus.

![Expo](https://img.shields.io/badge/Expo_SDK_54-000020?logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-0f172a?logo=react&logoColor=61dafb)
![Android](https://img.shields.io/badge/Android-white?logo=android&logoColor=3ddc84)
![Offline first](https://img.shields.io/badge/100%25_offline-no_account_needed-0f172a)

<br>

<a href="https://buymeacoffee.com/mousewerk">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy me a coffee" height="48">
</a>

<br>

<img src="docs/assets/screens/deck-details.png" alt="Deck overview with mastery, review and quiz modes" width="30%">&nbsp;&nbsp;&nbsp;
<img src="docs/assets/screens/study-swipe.png" alt="Spaced-repetition study card with Again / Hard / Good grading" width="30%">

</div>

## Why Sprig?

Your notes are already flashcards — they're just trapped in a spreadsheet. Sprig's whole
import format is one row per card:

```csv
question,answer
What is the powerhouse of the cell?,The mitochondria
photosynthesis,light → glucose + oxygen
le chien,the dog
```

Export it from Excel or Google Sheets, or let any AI generate one. Pick the file in Sprig
and start studying. The CSV stays the source of truth.

## Features

- **Swipe to learn** — SM-2 spaced repetition schedules each card so the hard ones come back sooner and the easy ones stay out of your way.
- **Quiz mode** — multiple-choice questions generated from your own deck.
- **Feed mode** — scroll cards like a social feed; study during the scrolling you were going to do anyway.
- **Focus garden** — start a focus session and a plant grows while you stay in the app. Leave too long and it wilts.
- **Ambient sounds** — mix rain, campfire, forest, ocean and more while you study.
- **Audio & PDF library** — keep lecture recordings and textbooks next to your decks.
- **Stats & streaks** — daily streaks, XP levels, achievements and an activity heatmap.
- **Private by design** — no servers, no account, no analytics. Everything lives in a local SQLite database on your device.

## Getting started (development)

Sprig is an [Expo](https://expo.dev) app (SDK 54, expo-router, React Compiler).

```bash
npm install
npx expo start
```

Then open it on a device with [Expo Go](https://expo.dev/go) or press `a` for an Android
emulator. Production builds are made with [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
npx eas-cli build --platform android --profile production
```

The landing page lives in [`docs/`](docs/) and is served with GitHub Pages.

## Support

If Sprig helps you study, you can support development here:

<a href="https://buymeacoffee.com/mousewerk">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy me a coffee" height="48">
</a>

## Credits

Ambient sound loops come from the open-source [Moodist](https://github.com/remvze/moodist)
project (Pixabay Content License / CC0). Icons are [Lucide](https://lucide.dev). Full
credits are listed in the app under **Settings → Credits & Licenses**.

---

<div align="center">

© 2026 [Mousewerk](https://buymeacoffee.com/mousewerk) · Sprig logo and name are © Mousewerk

</div>
