# BPAN iOS Wrapper (Capacitor)

This project now includes a Capacitor iOS wrapper that loads the deployed BPAN web app inside a native iOS shell.

## What was added

- Capacitor packages: `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`
- Config file: `capacitor.config.ts`
- Native iOS project: `ios/App`
- NPM scripts:
  - `npm run ios:add`
  - `npm run ios:sync`
  - `npm run ios:open`
  - `npm run ios:run`

## Configure app URL

By default, the wrapper points to:

- `https://bpan-platform.vercel.app`

To override at sync/open time:

```bash
CAP_SERVER_URL="https://your-deployed-domain.com" npm run ios:sync
```

## Open in Xcode

```bash
npm run ios:run
```

This syncs Capacitor and opens the iOS project in Xcode.

## Run on simulator/device

1. In Xcode, select target `App`.
2. Set your Apple Team in Signing & Capabilities.
3. Choose a simulator or connected iPhone.
4. Press Run.

## Notes

- This is a web wrapper, so your backend/auth stays on the existing deployed BPAN app.
- For production, set a stable domain in `CAP_SERVER_URL`.
- If you add Capacitor plugins later, rerun:

```bash
npm run ios:sync
```
