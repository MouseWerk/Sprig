#!/usr/bin/env bash
# Archive Sprig for iOS and upload the build to App Store Connect.
#
# Every credential comes from .env (gitignored — see .env.example); nothing
# identifying lives in the repository. The App Store Connect .p8 is only ever
# referenced by path: xcodebuild and altool read it themselves.
#
#   ./scripts/ios-release.sh            archive, export, upload
#   ./scripts/ios-release.sh --no-upload   stop after the .ipa
set -euo pipefail

cd "$(dirname "$0")/.."

# CocoaPods (Ruby 4.x) aborts with Encoding::CompatibilityError under LANG="".
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

if [ ! -f .env ]; then
  echo "error: .env not found — copy .env.example and fill it in." >&2
  exit 1
fi
set -a; . ./.env; set +a

for var in EXPO_ASC_API_KEY_PATH EXPO_ASC_KEY_ID EXPO_ASC_ISSUER_ID EXPO_APPLE_TEAM_ID; do
  if [ -z "${!var:-}" ]; then echo "error: $var is not set in .env" >&2; exit 1; fi
done
# The path may legitimately contain $HOME; expand it before use.
KEY_PATH=$(eval echo "$EXPO_ASC_API_KEY_PATH")
if [ ! -f "$KEY_PATH" ]; then echo "error: API key not found at $KEY_PATH" >&2; exit 1; fi

BUILD_DIR=${BUILD_DIR:-build-output/ios}
ARCHIVE="$BUILD_DIR/Sprig.xcarchive"
EXPORT_DIR="$BUILD_DIR/export"
mkdir -p "$BUILD_DIR"

cat > "$BUILD_DIR/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key><string>app-store-connect</string>
	<key>teamID</key><string>${EXPO_APPLE_TEAM_ID}</string>
	<key>signingStyle</key><string>automatic</string>
	<key>uploadSymbols</key><true/>
	<key>destination</key><string>export</string>
</dict>
</plist>
PLIST

AUTH=(-allowProvisioningUpdates
      -authenticationKeyPath "$KEY_PATH"
      -authenticationKeyID "$EXPO_ASC_KEY_ID"
      -authenticationKeyIssuerID "$EXPO_ASC_ISSUER_ID")

echo "==> Archiving (this takes a while)"
rm -rf "$ARCHIVE"
xcodebuild archive \
  -workspace ios/Sprig.xcworkspace -scheme Sprig -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" "${AUTH[@]}"

echo "==> Exporting .ipa"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$BUILD_DIR/ExportOptions.plist" "${AUTH[@]}"

if [ "${1:-}" = "--no-upload" ]; then
  echo "==> Done: $EXPORT_DIR/Sprig.ipa (not uploaded)"
  exit 0
fi

echo "==> Validating against App Store Connect"
xcrun altool --validate-app -f "$EXPORT_DIR/Sprig.ipa" -t ios \
  --apiKey "$EXPO_ASC_KEY_ID" --apiIssuer "$EXPO_ASC_ISSUER_ID"

echo "==> Uploading"
xcrun altool --upload-app -f "$EXPORT_DIR/Sprig.ipa" -t ios \
  --apiKey "$EXPO_ASC_KEY_ID" --apiIssuer "$EXPO_ASC_ISSUER_ID"

echo "==> Uploaded. Processing takes a few minutes; App Store Connect will email you."
