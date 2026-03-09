# BPAN iOS App Store Readiness

This Capacitor wrapper is set up for App Store submission with production-safe defaults.

## Already configured in this repo

- iOS wrapper project exists at `ios/App`.
- Web app URL is configurable via `CAP_SERVER_URL` in `capacitor.config.ts`.
- `allowNavigation` is restricted to the configured host (not wildcard).
- `PrivacyInfo.xcprivacy` is added to the iOS target.

## Pre-submit checklist (required)

1. Prepare release config and sync:

```bash
CAP_SERVER_URL="https://YOUR_PRODUCTION_DOMAIN" \
IOS_MARKETING_VERSION="1.0.0" \
IOS_BUILD_NUMBER="1" \
IOS_BUNDLE_ID="com.yourcompany.bpan" \
IOS_DISPLAY_NAME="BPAN" \
npm run ios:prepare-release
```

2. In Xcode (`ios/App/App.xcworkspace`), set:
- Bundle Identifier (unique, final) if you did not set `IOS_BUNDLE_ID`
- Team (Signing)
- Version (`CFBundleShortVersionString`, e.g. `1.0.0`) if you did not set `IOS_MARKETING_VERSION`
- Build (`CFBundleVersion`, increment every upload) if you did not set `IOS_BUILD_NUMBER`

3. Replace branding assets:
- App icon (1024x1024, no alpha/transparency)
- Launch/splash artwork in `Assets.xcassets`

4. Privacy/legal in App Store Connect:
- Privacy Policy URL
- App Privacy questionnaire
- Age rating and content rights
- Export compliance/encryption questionnaire

5. Verify auth/compliance behavior:
- If you add third-party login providers, follow Apple sign-in policy requirements.
- If you add native plugins that touch camera/photos/mic/location, add matching `Info.plist` usage strings.

## Build and upload

1. Fully automated terminal pipeline (archive/export/upload):

```bash
CAP_SERVER_URL="https://YOUR_PROD_DOMAIN" \
IOS_DEVELOPMENT_TEAM="YOURTEAMID" \
IOS_BUNDLE_ID="com.yourcompany.bpan" \
IOS_DISPLAY_NAME="BPAN" \
IOS_MARKETING_VERSION="1.0.0" \
IOS_BUILD_NUMBER="1" \
ASC_API_KEY_ID="YOUR_ASC_API_KEY_ID" \
ASC_API_ISSUER_ID="YOUR_ASC_ISSUER_ID" \
ASC_API_PRIVATE_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_YOUR_ASC_API_KEY_ID.p8" \
npm run ios:testflight
```

2. Run local preflight:

```bash
npm run ios:preflight
```

3. Open workspace:

```bash
npm run ios:open
```

4. In Xcode:
- Select target `App` and a generic iOS device
- Product -> Archive
- Distribute App -> App Store Connect -> Upload

5. In App Store Connect:
- Create TestFlight build
- Run internal/external testing
- Submit for review

## Release workflow recommendation

- Keep web deployments backward-compatible with your currently approved binary.
- Before each release upload:
  - increment build number
  - run `CAP_SERVER_URL="..." IOS_MARKETING_VERSION="..." IOS_BUILD_NUMBER="..." IOS_BUNDLE_ID="..." IOS_DISPLAY_NAME="..." npm run ios:prepare-release`
  - archive a clean release from Xcode
