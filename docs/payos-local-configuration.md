# payOS local MAIN configuration — 2026-09-28

## Authoritative environment

Repository: `/Users/macbookair/vibe-academy-system`.
Runtime: `http://localhost:3000`.
Supabase: API `http://127.0.0.1:54321`, PostgreSQL 54322.
Branch: `feature/learning-report-v2`; HEAD `45822a4d9dd56317324f9c554df76b42f55c1199` (existing uncommitted consolidation work preserved).

Only `.env.local` holds credentials; Git ignores it. Values must never be copied into documentation or output.

```dotenv
PAYOS_CLIENT_ID=<configured in .env.local>
PAYOS_API_KEY=<configured in .env.local>
PAYOS_CHECKSUM_KEY=<configured in .env.local>
SUPABASE_SERVICE_ROLE_KEY=<from MAIN local Supabase status only>
NEXT_PUBLIC_APP_URL=http://localhost:3000
PAYOS_PUBLIC_ORIGIN=https://invision-mistress-connect-mean.trycloudflare.com
```

The three payOS credentials came from the owner-designated former working local environment. This does not establish that payOS provides a sandbox: the existing client uses the provider merchant API. Only a TEST payment link was created; no money was transferred. MAIN service-role matches MAIN CLI status; public Supabase URL and publishable key stayed unchanged. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is absent because this application uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Browser URLs versus provider ingress

`lib/integrations/payos/client.ts` reads the three payOS secrets on the server through registration server actions and webhook/sync modules. `PAYOS_PUBLIC_ORIGIN` must be HTTPS according to `payosConfigurationGaps`; it must not be changed to localhost to bypass this contract.

`payosReturnUrls` uses `NEXT_PUBLIC_APP_URL` first, so both browser destinations use MAIN:

- Return: `http://localhost:3000/admin/business/registrations/c5fbae4f-d710-4cb2-97c9-b642e9b0892c`
- Cancel: the same URL with `?payos=cancel`.

Service-role is read by registration server actions, payOS webhook and server-only sync. No payOS credential variable has a NEXT_PUBLIC prefix. No business logic changed in this repair.

The previous public origin is preserved as historical configuration, NOT a working ingress. DNS currently returns ENOTFOUND and no cloudflared/proxy process is running. Expected webhook URL is that public origin plus `/api/integrations/payos/webhook`. Status: **REQUIRES PUBLIC TUNNEL**. An owner-approved live ingress must route to MAIN port 3000 (optionally through the existing callback-only proxy on 3099 with an explicit approved host allowlist). No tunnel/provider configuration was created or changed. A quick-tunnel hostname cannot simply be recovered by restarting a tunnel; do not invent a replacement or claim this hostname is live.

The env variable does not register the webhook with payOS. Browser return is not proof of payment.

## Configuration reconciliation and order collision

Initial MAIN was missing all three payOS credentials, public origin and service-role. Browser origin was an old LAN IP; it is now localhost:3000.

First UAT reservation `260925110` collided with an already PAID order belonging to the reference environment. Provider read-only lookup and reference DB both confirmed this. No old payment/link was attached to MAIN. The MAIN TEST reservation had no link or financial posting; it was cancelled via `cancel_registration_payos_order`. MAIN's order sequence was advanced to an epoch-millisecond range (`1790532932665`) using setval; no schema migration/reset occurred and no provider/reference order was cancelled.

Successful MAIN order: `1790532932666`, amount 2,750,000 VND, PENDING; registration `c5fbae4f-d710-4cb2-97c9-b642e9b0892c` / `DK-20260928-B642E9B0892C`. It uses the authoritative 50% deposit of the 5,500,000 VND quote. The old cancelled local reservation remains for audit. Do not run the archived environment against the same merchant or reset the sequence to its original starting value.

Two retries through the existing authenticated reservation RPC, including stale version input, returned the same active order. One active PENDING order, one CANCELLED failed reservation, zero posted payments for this TEST. The payOS checkout rendered the correct amount. Return/cancel construction is verified in code/tests; a paid provider redirect was not performed.

## Webhook and Zalo audit

MAIN route: `app/api/integrations/payos/webhook/route.ts`.
- HMAC signature verification before business processing; malformed/unverified requests rejected.
- Local live invalid-signature probe returned HTTP 401 after configuration restoration.
- Signed sample is acknowledged without posting.
- Verified order, link, amount, currency and provider reference enter `record_verified_payos_webhook`.
- SQL locks the order and enforces unique references/events for idempotency before authoritative finance posting.
- Notification dispatch follows successful verified RPC; existing consent/readiness and durable job protections remain.

Live verified incoming payment and authoritative UAT posting: NOT TESTED. No fake payment and no real Zalo message was sent. Safe automated payment/notification and durable recovery fixtures roll back.

## Previous notes and stale references

No identifiable standalone TXT/setup note was found in either project. Found:

| Path | Purpose | Old references | Secrets |
| --- | --- | --- | --- |
| `/Users/macbookair/vibe-academy-crm-preview/.env.local` | Former local provider configuration | API 55321; previous public tunnel | Yes; never reproduced |
| `/Users/macbookair/vibe-academy-crm-preview/docs/zalo-registration-recovery-20260927.md` | Historical Zalo recovery notes | Archived repository path, 55321 | No payOS credential assignments |
| `docs/crm-consolidation-inventory.md` | Provenance inventory | Archived repository name | None |
| `docs/local-development-workflow.md` | Current MAIN instructions plus dated performance measurements | Explicit archive reference | None |

Every remaining MAIN documentation occurrence of the archived repo/55321/55322 is an **EXPECTED ARCHIVE REFERENCE**, including this audit table. No 3010 references were found in operational MAIN source/config. A mocked URL in `tests/payos-sync.test.cjs` was aligned from the former API port to 54321; it never connected to that port. Active stale runtime references remaining: **0**.

## Validation

- payOS/Zalo application tests: 60/60 PASS, including local PostgreSQL rollback fixtures.
- payOS SQL regression: 18/18 PASS, rollback.
- Browser: authenticated MAIN detail, missing-config warning absent, successful PENDING checkout; provider page rendered 2,750,000 VND. Existing VIBE layout visually inspected, no UI code modified.
- Invalid-signature webhook: HTTP 401; previous public tunnel: ENOTFOUND.
- TypeScript: PASS (`npx tsc --noEmit --pretty false`). Build: PASS (`npm run build`), verified local build recorded.
- Focused sync tests rerun after mock URL update: 4/4 PASS.

Production, staging, provider secrets, reference source/data and MAIN authentication were not changed. No commit, push, deployment, DB reset or migration.
