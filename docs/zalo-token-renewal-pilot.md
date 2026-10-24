# Zalo OA automatic renewal pilot — MAIN local

## Status and ownership gate (2026-09-28)

Implementation and simulated lifecycle verification are complete; **live automatic rotation is NOT yet accepted**. Owner confirmation that this app/OA authorization is isolated from production, staging and other refresh managers is outstanding. Do not infer exclusivity from the absence of a local process.

Actual preview: `/Users/macbookair/vibe-academy-system`, `http://localhost:3000`, branch `feature/learning-report-v2`, HEAD `45822a4d9dd56317324f9c554df76b42f55c1199` plus existing uncommitted work. Supabase API 54321 / PostgreSQL 54322. No production/staging changes or deployment.

Reference environment: `/Users/macbookair/vibe-academy-crm-preview`, API 55321 / DB 55322. No reference Next/refresh process found in local inventory. Its durable connection is version 4; BOTH stored tokens differ from its older `.env.local` pair. MAIN initially had neither tokens nor a credential row. Never import that obsolete environment pair.

Only static app/OA identity and app secret were reconciled into MAIN `.env.local`; no refresh/access token was imported and no OA webhook secret was substituted. `ZALO_CREDENTIAL_OWNER` is deliberately not asserted. Scheduler and API preflight refuse real renewal until it is `main` following confirmed ownership transfer. Existing remote consumers cannot be discovered conclusively from this Mac.

Read-only live evidence: latest reference stored token passed OA identity and template-access checks (`getoa` and template sample-data), version 4, result READY. No refresh request, authorization-code exchange, customer send, callback change or production token rotation was performed.

After owner confirmation, transfer the *current durable pair and expiry*, with source version rechecked and competing consumers stopped/coordinated, into MAIN through the explicit protected import operation. Do not bootstrap from the obsolete env values. Then perform one controlled refresh, verify OA identity, restart preview and check durable version unchanged. This remaining live acceptance has NOT been claimed.

## Single credential lifecycle

The existing `lib/integrations/zalo/oauth.ts` manager and `notification_private.zalo_credentials` table remain authoritative. There is no second token manager.

- Access/refresh tokens are encrypted with AES-256 via pgcrypto. The encryption key is stored in Supabase Vault, not application source or docs. Private tables have RLS and no direct anon/authenticated/service-role table grants. Only narrowly granted server RPCs expose decrypted values to the server.
- Pair, provider expiry, refresh expiry, version, refresh operation and state commit in one local DB update. Env bootstrap is insert-only. An explicit admin import is version-checked; startup never replaces a stored pair with env tokens.
- Default renewal check: every 600 seconds; renew within 900 seconds of expiry; subtract 60 seconds clock allowance from provider expiry. Configure once using `ZALO_RENEWAL_CHECK_SECONDS`, `ZALO_RENEWAL_WINDOW_SECONDS`, `ZALO_RENEWAL_CLOCK_SKEW_SECONDS`.
- Eligible notification operations preflight through the same manager. Low-level transports require explicitly supplied credentials, and appsecret_proof uses the same access token as the request. Application secret remains distinct from the inbound OA secret.
- Shared PostgreSQL row lock and version/operation checks choose one refresher. Concurrent callers wait a bounded interval for the winning pair. Late results cannot replace a newer version.
- A 15-second provider timeout or expired in-flight operation is UNKNOWN/UNCERTAIN, never permission to consume the old refresh token again. Retry only the exact DB persistence acknowledgement (two bounded attempts with a delay). A verified pair persisted as VERIFYING can recover identity verification after restart.
- Provider refresh and local persistence are NOT globally atomic. If a process dies after the provider consumes a token but before persistence, explicit reconciliation/reauthorization is required. Lock expiry does not retry the refresh.

## Scheduler and operation

Start credential automation, idempotently:

```sh
cd /Users/macbookair/vibe-academy-system
npm run zalo:pilot:start
```

Health/status:

```sh
npm run zalo:pilot:status
```

The existing application continues under `npm run dev` on 3000. The scheduler is independent of that process and any browser. macOS launchd label `vn.vibeacademy.local.zalo-maintenance` runs the one-shot `scripts/zalo-maintenance.cjs`, using the SAME TypeScript manager as the application. It runs at load/login and every 600 seconds; launchd does not overlap the same job. Multiple other callers share the DB lock. Next instrumentation also performs startup recovery.

Agent plist: `~/Library/LaunchAgents/vn.vibeacademy.local.zalo-maintenance.plist`. Logs: `~/Library/Logs/VibeAcademy/zalo-maintenance*.log`; metadata only. A one-shot scheduler normally reports `not running` between ticks: check installed/runs/last exit and DB heartbeat, not a continuously running PID.

Observed launchd runs: initial check 01:29:16 and scheduled check 01:39:16 (Vietnam time, 2026-09-28), exit 0; no browser/customer action triggers them. Result remains OWNERSHIP_UNCONFIRMED. This verifies actual scheduling, NOT live token rotation.

The Mac must be powered on, awake, logged in and able to reach local Supabase/network. Work cannot execute while asleep/shut down. A continuous pilot needs an always-on worker/scheduler and the same central credential DB. Vault encryption material must be included in the protected database backup/restore plan.

## Hosted preparation, not deployed

`ops/vercel-zalo-cron.example.json` prepares a 10-minute schedule for `/api/internal/zalo/maintenance`; it is intentionally not the root deployment configuration. Before hosted activation, choose one ownership domain and one central credential store, provision CRON_SECRET securely, restrict scheduled endpoint access, redact callback query strings in host access logs and confirm the hosting plan supports this frequency. Do not activate a competing hosted manager against a separately copied token store.

The maintenance endpoint requires constant-time Bearer secret validation and returns no token data. Local launchd runs directly and does not need a public endpoint or CRON_SECRET.

## Connection/reconnection UI

Open `http://localhost:3000/admin/system/integrations/zalo` as SUPER_ADMIN. Current health, OA identity, expiry, last rotation and scheduler heartbeat are shown in Vietnamese/Vietnam time, without token values. Authentication/ownership failures produce an in-app warning independent of Zalo delivery.

“Kết nối Zalo” / “Kết nối lại Zalo” uses OAuth v4, random PKCE verifier/challenge, random state bound to the initiating administrator, an HttpOnly SameSite cookie, a ten-minute encrypted state record, atomic one-use consumption, fixed configured callback and OA identity verification. Initiation and callback both require administrator access. Reauthorization claims the same credential row BEFORE consuming the code; it cannot race a refresh into a stale overwrite. Pair persistence precedes read-only verification and is quarantined until verified.

Prepared MAIN callback route: `http://localhost:3000/api/integrations/zalo/oauth/callback`. Handler/auth guards are verified locally; registration/acceptance of this URI in Zalo Developers is NOT verified. No production callback was changed. If reauthorization later becomes necessary, confirm provider-approved callback configuration without replacing shared production settings. The current reference pair is valid, so reauthorization is not required merely to demonstrate the UI.

## Notification safety

Automation never claims/drains customer notification jobs and never sends diagnostics to recipients. The PHONE registration path retains existing consent, template, completed-registration and authoritative-payment checks. Durable REQUESTING attempts precede sends; accepted/delivered and ambiguous outcomes cannot automatically be resent. Manual retry retains atomic claims. Auth failures block recoverably without reversing payment, receipt, student or placement.

The legacy UID pilot lacked a durable REQUESTING claim. That unsafe application dispatch branch now fails closed with ZALO_UID_DURABLE_CLAIM_REQUIRED; it is not enabled by token renewal. The already disabled generic notification Zalo adapter remains disabled. No send gate was widened.

Error mapping preserves token (-124), proof (-1241), permissions, balance (-115), quota, recipient and template failures separately; unrelated failures do not trigger refresh. OA and OAuth error contracts remain separate from ZBS.

Official contracts reviewed:
- https://docs.zaloplatforms.com/docs/OA/bat-dau/xac-thuc-va-uy-quyen-cho-ung-dung-new
- https://docs.zaloplatforms.com/docs/ZBS/bang-ma-loi

## Verification and files

Simulated tests use mock provider responses and a controllable clock. Real PostgreSQL tests fork independent Node processes against an isolated synthetic credential, prove one refresh, ciphertext storage, fresh-process readback and a second cycle using the replacement refresh token; synthetic rows are removed afterwards. SQL permission/OAuth fixtures roll back. This is not a 25-hour live observation.

Coverage includes missing/revoked/consumed refresh, timeout, stale in-flight operation, persistence failure/lost acknowledgement, reauthorization races, invalid/replayed/wrong-user/wrong-OA/expired callbacks, and notification duplicate prevention. Desktop and 390px narrow view were rendered and visually checked using existing VIBE cards, typography, buttons and notices; no horizontal overflow.

Changed implementation files:
- `lib/integrations/zalo/{oauth,authorization,maintenance,renewal-settings,service,phone,readiness,preview-dispatch,recovery-labels}.ts`
- `app/admin/system/integrations/zalo/{actions.ts,page.tsx,RegistrationRecovery.tsx}`
- `app/api/integrations/zalo/oauth/callback/route.ts`, `app/api/internal/zalo/maintenance/route.ts`
- `instrumentation.ts`, `next.config.ts`, `package.json`, ignored `.env.local`
- `scripts/zalo-{maintenance,scheduler}.cjs`, `ops/vercel-zalo-cron.example.json`
- `supabase/migrations/20260928060000_zalo_automatic_renewal.sql` (MAIN only, no reset)
- focused test/helper files and `supabase/tests/database/zalo_automatic_renewal_test.sql`
- this runbook.

Final test/build results are recorded below after the final gate. Integration readiness is separate from readiness of the entire VIBE system.

Final gate: 74/74 Zalo/notification tests PASS; final authorization subset rerun 9/9 PASS; TypeScript PASS; changed runtime TypeScript/TSX lint PASS; optimized build PASS. Startup restarted after build. All synthetic credential rows cleaned, no real customer sends. Live rotation/restart of the real pair remain BLOCKED on confirmed exclusive credential ownership.

Ownership update: owner explicitly confirmed this OA is shared with another system. Do NOT proceed with the earlier conditional exclusive-owner transfer procedure. Identify the existing credential authority and coordinate a single shared manager first; MAIN must not independently rotate a copied refresh token. Local ownership flag remains unset.
