# Phase 9 — Notification infrastructure checkpoint

2026-09-16. **Phase 9 local PASS.** Browser and final automated rerun completed.
Production HOLD. No staging/production connection, push, deploy or external send.

## Implemented

Protected queue with EMAIL/ZALO/IN_APP channels, PENDING/PROCESSING/SENT/FAILED/
CANCELLED states, recipient/source identity, generic template payload, unique
idempotency key, lease, attempt count, receipt, sanitized error code and audit.

Admin can explicitly generate jobs from onboarding, canonical tuition reminder,
approved monthly/end-of-course report, schedule revision, attendance revision or
resolved feedback. No arbitrary recipient/body accepted. Tuition windows remain
canonical: first week of package month 2 for 3-month terms; month 10 for 12-month.
No reminder-engine SENT transition or financial writes are added.

Worker claim/confirmation RPCs are service-role-only; direct table writes are
revoked including service_role. IN_APP delivery/inbox creation is transactional.
Retries reuse the same job/provider idempotency key; stale acknowledgement is
rejected. Mock adapter refuses LIVE jobs and never populates the real inbox.

Queue UI: filters, bounded pagination, source identity, error inspection, retry,
cancel and explicit IN_APP delivery. Own inbox uses current account/role/link
validity; protected report/finance payload is not copied into notifications.

## Validation

- Full local pgTAP: **50 files / 1254 PASS**.
- Full application/bootstrap: **184 PASS** (7 new adapter + 6 new UI/action).
- Build: PASS. Relevant ESLint: PASS. `git diff --check`: PASS.
- Tests cover duplicate queue/claim/ack, absent provider/receipt, mock success,
  failure, retry, no live mock, inactive/expired recipient, cross-account inbox,
  wrong parent branch, revoked relationship, parent finance flag, multiple
  children deduplication, approved vs draft reports and canceled reminder source.
- Browser desktop/mobile: **PASS** at 1440×900 and 390×844; no horizontal overflow; console errors absent.
- Browser verified: create PENDING, duplicate creation retains one job, IN_APP SENT matches inbox, EMAIL missing-provider FAILED, retry retains job, cancel, channel/status filters. EMAIL failure was injected through worker RPC with no outbound network send.

## Delivery limitations

EMAIL/ZALO production delivery is **DEFERRED**: provider credentials, verified
recipient-address resolution, durable provider idempotency and operational worker
configuration are not installed. Adapter contract and mock exist; no real provider
success is claimed. No unattended scheduler has been deployed. Admin generation
is explicit, not an automatic policy for which operational events should send.

An expired PROCESSING lease can be recovered with the protected RETRY RPC; stale
acknowledgement cannot overwrite the new attempt. An invalidated tuition source
is rejected at delivery and must be canceled by the operator.

## Authorized local rehearsal credential

Owner explicitly authorized reuse of one synthetic localhost SUPER_ADMIN for
Phase 9–26. Its random credential is in a restricted 0600 file outside the
repository. No production identity is used. The account/credential remains
available only for the continuing authorized browser rehearsal and must be
disabled/deleted when these validations finish or reach an external approval gate.
No credential is included in code, docs or repository logs.

Local migrations: 20260916210000, 20260916211000, 20260916212000,
20260916213000. Phase 8 was separately committed as `34d003d`.

Local migration ledger verified: **81**, latest `20260916213000`.
