import { Redirect } from 'expo-router';

// Expo Router's default for any URL that doesn't match a route — most often
// hit for a split second when a file is opened "with Sprig" before the
// content://\file:// launch URL is recognized and steered back into the app
// (see useIncomingFiles in app/_layout.tsx). Redirecting straight to the
// decks tab means that race never surfaces as a visible error screen.
export default function NotFoundScreen() {
  return <Redirect href="/decks" />;
}
