# SMS Notification Setup (Disabled by Default)

SMS delivery is optional and is off unless `FEATURE_SMS_NOTIFICATIONS=true`.

## Required environment variables

- `FEATURE_SMS_NOTIFICATIONS=true`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_PHONE`

## User requirements

- User must enable SMS in notification preferences.
- User must provide a phone number.
- User must mark phone as verified.
- User must enable SMS for the specific channel (`Direct messages`, `Group threads`, `All-lab messages`).

## Guardrails in this scaffold

- Quiet hours are enforced from user preferences (`start`, `end`, `time zone`).
- Rate limiting is enforced before send:
  - max sends per hour (env `SMS_NOTIFICATIONS_PER_HOUR`, default `6`)
  - minimum 60 seconds between sends
- Message includes sender name and short snippet.

## Notes

- If any required provider secret is missing, SMS controls stay disabled-ready and no SMS is sent.
- In-app and email delivery continue to work independently.
