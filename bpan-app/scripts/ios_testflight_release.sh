#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ARCHIVE_PATH="${IOS_ARCHIVE_PATH:-$ROOT_DIR/build/ios/App.xcarchive}"
EXPORT_DIR="${IOS_EXPORT_DIR:-$ROOT_DIR/build/ios/export}"
EXPORT_PLIST="${IOS_EXPORT_OPTIONS_PLIST:-$ROOT_DIR/build/ios/ExportOptions.plist}"

mkdir -p "$(dirname "$ARCHIVE_PATH")" "$EXPORT_DIR"

if [[ -z "${CAP_SERVER_URL:-}" ]]; then
  echo "Error: CAP_SERVER_URL is required."
  exit 1
fi

if [[ -z "${IOS_DEVELOPMENT_TEAM:-}" ]]; then
  echo "Error: IOS_DEVELOPMENT_TEAM is required for signed App Store archive."
  echo "Find it in Apple Developer account (10-char Team ID)."
  exit 1
fi

if [[ -z "${IOS_BUNDLE_ID:-}" ]]; then
  echo "Error: IOS_BUNDLE_ID is required."
  exit 1
fi

if [[ -z "${IOS_MARKETING_VERSION:-}" || -z "${IOS_BUILD_NUMBER:-}" ]]; then
  echo "Error: IOS_MARKETING_VERSION and IOS_BUILD_NUMBER are required."
  exit 1
fi

echo "Preparing release config..."
CAP_SERVER_URL="$CAP_SERVER_URL" \
IOS_MARKETING_VERSION="$IOS_MARKETING_VERSION" \
IOS_BUILD_NUMBER="$IOS_BUILD_NUMBER" \
IOS_BUNDLE_ID="$IOS_BUNDLE_ID" \
IOS_DISPLAY_NAME="${IOS_DISPLAY_NAME:-LabLynk}" \
npm run ios:prepare-release

echo "Running preflight checks..."
npm run ios:preflight

echo "Archiving signed iOS build..."
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$IOS_DEVELOPMENT_TEAM" \
  PRODUCT_BUNDLE_IDENTIFIER="$IOS_BUNDLE_ID" \
  MARKETING_VERSION="$IOS_MARKETING_VERSION" \
  CURRENT_PROJECT_VERSION="$IOS_BUILD_NUMBER" \
  clean archive > /tmp/bpan_ios_archive.log

cat > "$EXPORT_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>destination</key>
  <string>export</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>${IOS_DEVELOPMENT_TEAM}</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>uploadBitcode</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
PLIST

echo "Exporting IPA..."
rm -f "$EXPORT_DIR"/*.ipa
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST" > /tmp/bpan_ios_export.log

IPA_PATH="$(find "$EXPORT_DIR" -maxdepth 1 -name '*.ipa' | head -n 1 || true)"
if [[ -z "$IPA_PATH" ]]; then
  echo "Error: IPA export failed (no IPA found)."
  echo "See /tmp/bpan_ios_export.log"
  exit 1
fi

echo "IPA ready: $IPA_PATH"

if [[ -n "${ASC_API_KEY_ID:-}" && -n "${ASC_API_ISSUER_ID:-}" ]]; then
  if [[ -z "${ASC_API_PRIVATE_KEY_PATH:-}" ]]; then
    ASC_API_PRIVATE_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_API_KEY_ID}.p8"
  fi

  if [[ ! -f "$ASC_API_PRIVATE_KEY_PATH" ]]; then
    echo "Error: ASC API key file not found at $ASC_API_PRIVATE_KEY_PATH"
    exit 1
  fi

  echo "Uploading IPA to TestFlight with API key..."
  xcrun altool \
    --upload-app \
    -f "$IPA_PATH" \
    -t ios \
    --apiKey "$ASC_API_KEY_ID" \
    --apiIssuer "$ASC_API_ISSUER_ID" \
    --p8-file-path "$ASC_API_PRIVATE_KEY_PATH" \
    --output-format json > /tmp/bpan_ios_upload.log

  echo "Upload submitted."
  echo "Upload log: /tmp/bpan_ios_upload.log"
  exit 0
fi

if [[ -n "${APPLE_ID_USERNAME:-}" && -n "${APP_SPECIFIC_PASSWORD:-}" ]]; then
  echo "Uploading IPA to TestFlight with Apple ID credentials..."
  APP_SPECIFIC_PASSWORD="$APP_SPECIFIC_PASSWORD" xcrun altool \
    --upload-app \
    -f "$IPA_PATH" \
    -t ios \
    -u "$APPLE_ID_USERNAME" \
    -p "@env:APP_SPECIFIC_PASSWORD" \
    --output-format json > /tmp/bpan_ios_upload.log

  echo "Upload submitted."
  echo "Upload log: /tmp/bpan_ios_upload.log"
  exit 0
fi

echo "Archive/export completed, but upload was skipped because auth vars are missing."
echo "Provide either:"
echo "- ASC_API_KEY_ID + ASC_API_ISSUER_ID (+ optional ASC_API_PRIVATE_KEY_PATH)"
echo "or"
echo "- APPLE_ID_USERNAME + APP_SPECIFIC_PASSWORD"
