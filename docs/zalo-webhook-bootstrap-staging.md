# Zalo staging webhook bootstrap

Temporary URL setup acknowledgment only. Set the server-side variable
`ZALO_WEBHOOK_BOOTSTRAP_MODE=true` on the Vercel project `vibeacademy-staging`.
The handler additionally requires Vercel's system variable
`VERCEL_PROJECT_PRODUCTION_URL=vibeacademy-staging.vercel.app`. If either
condition is absent, verification remains strict. Enable automatic system
variables on that staging project if they are not already exposed.

Unsigned or invalidly signed setup probes return HTTP 200 with
`{"ok":true,"bootstrap":true,"processed":false}` before persistence. No database
client is created for the probe, no jobs are queued, and no outbound Zalo call
is made. Only event name, timestamp, signature presence and HTTP status are
logged. A valid signature follows the original validation and idempotent
recording path, including rejection of secret material in the payload.

Keep `ZALO_OA_SECRET_KEY` as an OA secret; never substitute `ZALO_APP_SECRET`.
After initial setup and provisioning the real OA secret, disable/remove the
bootstrap flag and redeploy staging to restore strict rejection of probes.
Do not enable this flag on the production project `vibeacademy`.

Tests: `node --test tests/zalo-webhook-foundation.test.cjs`.
