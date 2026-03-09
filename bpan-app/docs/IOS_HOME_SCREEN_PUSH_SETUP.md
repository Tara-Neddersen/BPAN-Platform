# iPhone Home Screen + Web Push Setup (No Apple Developer fee)

This setup enables lock-screen notifications from BPAN when users install the app to iPhone Home Screen.

## 1) Database migration

Apply migration:

- `supabase/migrations/061_web_push_subscriptions.sql`

This creates `public.web_push_subscriptions` for per-device push subscriptions.

## 2) Generate VAPID keys

```bash
npm run push:generate-vapid
```

Set environment variables in your deployment:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (example: `mailto:lab-admin@yourlab.org`)

## 3) Deploy app

Push/deploy this build so these are live:

- `public/sw.js` (service worker)
- `public/manifest.webmanifest`
- `src/app/api/push/*` endpoints
- Notifications page push settings card

## 4) User flow on iPhone (Safari)

1. Open BPAN in Safari.
2. Share -> Add to Home Screen.
3. Open BPAN from Home Screen.
4. Go to `Notifications` page.
5. Tap `Enable Push` and allow notifications.
6. Tap `Send Test Notification` to verify lock-screen delivery.

## 5) What currently triggers push

- New lab chat messages (when in-app chat notifications are enabled for that channel).

## 6) Notes

- Push requires HTTPS in production.
- If VAPID variables are missing, push controls show a configuration warning.
- iPhone users can always mute/disable app notifications in iOS Settings.
