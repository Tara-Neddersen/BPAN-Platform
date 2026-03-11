#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT_FILE="ios/App/App.xcodeproj/project.pbxproj"
INFO_PLIST="ios/App/App/Info.plist"
ICON_FILE="ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"

echo "Running iOS release preflight..."

if [[ ! -f "$PROJECT_FILE" ]]; then
  echo "Error: Missing $PROJECT_FILE"
  exit 1
fi

if [[ ! -f "$INFO_PLIST" ]]; then
  echo "Error: Missing $INFO_PLIST"
  exit 1
fi

if [[ ! -f "$ICON_FILE" ]]; then
  echo "Error: Missing app icon $ICON_FILE"
  exit 1
fi

if command -v sips >/dev/null 2>&1; then
  ICON_W="$(sips -g pixelWidth "$ICON_FILE" 2>/dev/null | awk '/pixelWidth/ {print $2}')"
  ICON_H="$(sips -g pixelHeight "$ICON_FILE" 2>/dev/null | awk '/pixelHeight/ {print $2}')"
  if [[ "$ICON_W" != "1024" || "$ICON_H" != "1024" ]]; then
    echo "Error: App icon must be 1024x1024, got ${ICON_W}x${ICON_H}"
    exit 1
  fi
fi

BUNDLE_ID="$(rg -N "PRODUCT_BUNDLE_IDENTIFIER =" "$PROJECT_FILE" | head -n 1 | sed -E 's/.*= ([^;]+);/\1/')"
VERSION="$(rg -N "MARKETING_VERSION =" "$PROJECT_FILE" | head -n 1 | sed -E 's/.*= ([^;]+);/\1/')"
BUILD="$(rg -N "CURRENT_PROJECT_VERSION =" "$PROJECT_FILE" | head -n 1 | sed -E 's/.*= ([^;]+);/\1/')"
DISPLAY_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$INFO_PLIST" 2>/dev/null || true)"

if [[ -z "$BUNDLE_ID" || "$BUNDLE_ID" == "com.lablynk.app" ]]; then
  echo "Warning: Bundle ID appears default ($BUNDLE_ID). Set final value before App Store upload."
fi

if [[ -z "$DISPLAY_NAME" ]]; then
  echo "Warning: CFBundleDisplayName is empty."
fi

if [[ -z "$VERSION" || -z "$BUILD" ]]; then
  echo "Error: Missing version/build numbers."
  exit 1
fi

echo "Bundle ID: $BUNDLE_ID"
echo "Display Name: ${DISPLAY_NAME:-<empty>}"
echo "Marketing Version: $VERSION"
echo "Build Number: $BUILD"

echo "Running unsigned Release build for iOS Simulator..."
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -sdk iphonesimulator \
  -destination "generic/platform=iOS Simulator" \
  CODE_SIGNING_ALLOWED=NO \
  build >/tmp/bpan_ios_preflight_build.log

echo "Preflight passed."
echo "Build log: /tmp/bpan_ios_preflight_build.log"
