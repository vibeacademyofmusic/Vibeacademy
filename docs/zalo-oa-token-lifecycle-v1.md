# Zalo OA token lifecycle

This is a future server-only design. No token is populated by the outbound foundation.

The sender will later read these server environment variables:

- `ZALO_OA_ACCESS_TOKEN`
- `ZALO_OA_REFRESH_TOKEN`
- `ZALO_APP_SECRET`

They stay out of Git, database business tables, client bundles, and logs. They are not `NEXT_PUBLIC_` values.

When a real sender is approved, the server refreshes the access token with the app secret and the refresh token, then replaces both tokens in the secret store. A refresh failure stops sending and records `ZALO_OUTBOUND_NOT_CONFIGURED` or `PROVIDER_NOT_CONFIGURED` on the notification job. It does not roll back the payment, registration, placement, or published report.

The current adapter does not read these variables and does not call Zalo.
