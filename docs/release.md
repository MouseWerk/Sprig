# Releasing Sprig for Android

Sprig is built with Expo's tools but without Expo Application Services (EAS):
`expo prebuild` generates the native `android/` project (gitignored), Gradle
builds and signs it, and `scripts/android-release.mjs` uploads the App Bundle
to Google Play. No Expo account is involved.

## Versions

`app.json` is the only source: `expo.version` is the version name,
`expo.android.versionCode` the version code. Bump both for a release. Play
rejects a versionCode it has seen before, so it must be higher than the last
one uploaded (Play Console → Test and release → Latest releases and bundles →
App bundle explorer). EAS used to count the versionCode on its servers
(`appVersionSource: remote`); check once that `app.json` is above the last EAS
build before the first release without it.

## The upload key

Google Play signs the app for users with the app signing key it keeps (Play
App Signing). We sign each upload with the **upload key**; Play checks it
against the upload certificate it has on file.

Until now EAS held the upload key. Get it once, before the Expo account goes
away, or replace it.

### Option A: download it from EAS (while the Expo account still exists)

The current `master` no longer has the EAS configuration, so use the last
commit that had it in a separate worktree:

```bash
git worktree add ../sprig-eas dc433fa
cd ../sprig-eas
npm ci
npx eas-cli@latest login
npx eas-cli@latest credentials -p android
```

The last release run failed because the EAS project's slug is `csvtudyapp`
while `app.json` says `sprig`. If `eas credentials` stops with the same slug
error, set `"slug": "csvtudyapp"` in this worktree's `app.json` (only there,
never commit it) and run it again.

In the menu choose the `production` profile → "Keystore: Manage everything
needed to build your project" → "Download existing keystore". It saves a
`.jks` file and prints the keystore password, key alias and key password.
Move the `.jks` out of the worktree to a safe place (for example
`~/keys/sprig-upload.jks`), store the passwords in your password manager or
the OS credential store, then remove the worktree:

```bash
cd ../sprig
git worktree remove --force ../sprig-eas
```

Check that it is the right key: the SHA-256 fingerprint of

```bash
keytool -list -v -keystore ~/keys/sprig-upload.jks -alias <key alias>
```

must equal Play Console → Test and release → App integrity → App signing →
"Upload key certificate" → SHA-256.

### Option B: reset the upload key (if the download is not possible)

This works because the app uses Play App Signing (the app signing key stays
with Google; only the upload key changes).

1. Create a new upload key (keep the file outside the repository):

   ```bash
   keytool -genkeypair -v -keystore ~/keys/sprig-upload.jks -alias upload \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Export its certificate:

   ```bash
   keytool -export -rfc -keystore ~/keys/sprig-upload.jks -alias upload \
     -file upload_certificate.pem
   ```

3. Play Console → Sprig → Test and release → App integrity → App signing →
   "Request upload key reset". Pick the reason (lost the upload key / the
   build service held it), upload `upload_certificate.pem` and send the request.
4. Google answers by email. The new key is accepted from the date given there
   (usually about two days later); until then uploads with either key fail.
5. Delete `upload_certificate.pem` (it is public, but has no place in the repo).

## Repository secrets for the release workflow

`.github/workflows/release.yml` signs with the upload key when these four
repository secrets exist (GitHub → Settings → Secrets and variables →
Actions → New repository secret):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE` | the `.jks` file, base64: `base64 -w0 ~/keys/sprig-upload.jks` (macOS: `base64 -i ~/keys/sprig-upload.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore (store) password |
| `ANDROID_KEY_ALIAS` | the key alias |
| `ANDROID_KEY_PASSWORD` | the key password |

Without them the workflow still runs, signs with a debug key and says so in a
notice: the APK installs for a test, but not over a Play install, and Play
does not accept the AAB.

## The release workflow

A push to `master` that changes the version in `app.json` (or "Run workflow"
on the Actions tab) runs `npm ci`, `expo prebuild`, then Gradle
`assembleRelease` and `bundleRelease`. It publishes the GitHub release
`v<version>` with `Sprig-v<version>.apk` and `Sprig-v<version>.aab`, and the
English block of `versionshinweis.txt` as release notes. The log of the
"Name the outputs" step shows the SHA-256 of the signing certificate; it must
match the upload key certificate in Play Console.

To publish on Play, download the `.aab` from the release and upload it:

```bash
node scripts/android-release.mjs --track internal --aab Sprig-v<version>.aab
```

## Building locally

`plugins/withAndroidSigning.js` adds the release signing config every time
`expo prebuild` generates `android/`. It reads `keystore.properties` at the
project root (gitignored):

```properties
storeFile=/Users/you/keys/sprig-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

`storeFile` may be absolute or relative to the project root. Each value can
come from the environment instead (`ANDROID_KEYSTORE_PATH`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`), so
the passwords can stay in the credential store; on macOS, for example:

```bash
export ANDROID_KEYSTORE_PASSWORD=$(security find-generic-password -s sprig-upload -w)
export ANDROID_KEY_PASSWORD=$ANDROID_KEYSTORE_PASSWORD
```

with only `storeFile` and `keyAlias` in `keystore.properties`. With nothing
set, release builds are debug-signed and Gradle prints a warning; with only
part of it set, a release build stops with the missing names.

Requirements: Node 20 or newer, JDK 17, the Android SDK (`ANDROID_HOME`).

```bash
npm ci
npx expo prebuild --platform android --clean
cd android
./gradlew bundleRelease     # app/build/outputs/bundle/release/app-release.aab
./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk
cd ..
node scripts/android-release.mjs --track internal
```

`scripts/android-release.mjs` takes the `.aab` from the default Gradle path
above; `--dry-run` validates the upload without publishing it.

Dev builds are unaffected: `npx expo start` and `npx expo run:android` need no
keystore.
