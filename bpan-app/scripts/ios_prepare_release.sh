#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${CAP_SERVER_URL:-}" ]]; then
  echo "Error: CAP_SERVER_URL is required."
  echo "Example: CAP_SERVER_URL=https://bpan-platform.vercel.app npm run ios:prepare-release"
  exit 1
fi

if [[ ! "$CAP_SERVER_URL" =~ ^https:// ]]; then
  echo "Error: CAP_SERVER_URL must start with https://"
  exit 1
fi

PROJECT_FILE="ios/App/App.xcodeproj/project.pbxproj"

if [[ -n "${IOS_MARKETING_VERSION:-}" ]]; then
  perl -0pi -e "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = ${IOS_MARKETING_VERSION};/g" "$PROJECT_FILE"
  echo "Set MARKETING_VERSION=${IOS_MARKETING_VERSION}"
fi

if [[ -n "${IOS_BUILD_NUMBER:-}" ]]; then
  perl -0pi -e "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = ${IOS_BUILD_NUMBER};/g" "$PROJECT_FILE"
  echo "Set CURRENT_PROJECT_VERSION=${IOS_BUILD_NUMBER}"
fi

if [[ -n "${IOS_BUNDLE_ID:-}" ]]; then
  perl -0pi -e "s/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/PRODUCT_BUNDLE_IDENTIFIER = ${IOS_BUNDLE_ID};/g" "$PROJECT_FILE"
  echo "Set PRODUCT_BUNDLE_IDENTIFIER=${IOS_BUNDLE_ID}"
fi

if [[ -n "${IOS_DISPLAY_NAME:-}" ]]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${IOS_DISPLAY_NAME}" "ios/App/App/Info.plist"
  echo "Set CFBundleDisplayName=${IOS_DISPLAY_NAME}"
fi

npm run ios:sync

echo "iOS release prep complete."
echo "URL: ${CAP_SERVER_URL}"
if [[ -n "${IOS_MARKETING_VERSION:-}" ]]; then
  echo "Marketing version: ${IOS_MARKETING_VERSION}"
fi
if [[ -n "${IOS_BUILD_NUMBER:-}" ]]; then
  echo "Build number: ${IOS_BUILD_NUMBER}"
fi
if [[ -n "${IOS_BUNDLE_ID:-}" ]]; then
  echo "Bundle ID: ${IOS_BUNDLE_ID}"
fi
if [[ -n "${IOS_DISPLAY_NAME:-}" ]]; then
  echo "Display name: ${IOS_DISPLAY_NAME}"
fi

echo "Next: npm run ios:open (then Archive in Xcode)"
