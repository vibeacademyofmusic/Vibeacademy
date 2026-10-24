# Phase 11 — local validation

2026-09-16. Inventory / book warehouse V1 local PASS. Production HOLD; no push,
deployment, staging or production mutation. CRM conversion remains deferred
for its previously documented owner decision; independent work is authorized.

## Implemented

- Catalogue code/name/category/unit; stock derives exclusively from entries.
- Receipt, outbound, paired transfer and signed reasoned adjustment through one
  transactional RPC. Posted history cannot be edited/deleted.
- Request UUID idempotency compares actor and all payload fields. Per-item locks
  prevent concurrent overspending; transfer entries commit together.
- Explicit inventory permissions, no new non-admin role assignments. Existing
  ACTIVE/expiry helpers; branch permission at both transfer endpoints.
- Admin catalogue, paginated monthly branch reconciliation, item movement history
  and posting forms. Vietnam month boundaries. Preserves item/branch on posting.
- No inventory movement posts cash, receivables, revenue or payroll.

## Evidence

- Full pgTAP: **51 files / 1,283 PASS**. Inventory: **29 PASS**.
- Full application/bootstrap: **191 PASS**, including 7 inventory action tests.
- Build, relevant ESLint, diff check: PASS.
- Two concurrent local withdrawals for one unit: exactly one committed; the
  other rejected with insufficient inventory. Separate connections, same item.
- Browser: synthetic catalogue created; receipt 10, outbound 2, transfer 3.
  Origin closing 5; destination 3. Destination adjustment -1 produced closing 2.
  Attempted outbound 3 from that destination was rejected, preserving closing 2
  and history. Local SQL independently confirmed source 5 / destination 2.
- Desktop 1440×900 and mobile 390×844 inspected; document width equals viewport;
  no console errors. No external delivery or financial transaction.
- Local migration ledger: **83**, latest `20260916221000`.

## Fixes found during validation

Initial catalogue RLS accidentally depended on branch-directory visibility.
A subsequent migration evaluates only explicit inventory permission, with a
regression test for a scoped role without directory permission.
Fixture profile-status changes now use a valid admin actor. The existing menu
test now recognizes the real inventory route rather than assuming it absent.
Browser testing found post-redirect selection drift; redirects now preserve the
posted branch/item and forms remount when the selected branch changes.

## Limits / recovery

- Admin UI remains SUPER_ADMIN; scoped database permission contracts are tested,
  but no additional staff role is silently granted access.
- Quantity precision is three decimals; maximum single movement one billion.
- Catalogue is create/read V1; changing historical catalogue metadata is not
  exposed. No monetary costing, sales checkout, tax or serialized instruments
  yet; serialized instruments belong to Phase 12.
- Branch selector is bounded to 500 branches; reports/history use 25-row pages.
- Corrections use compensating adjustments, never deleting original entries.
  Rollback of application rollout means hiding the route and retaining ledger;
  do not drop populated tables or reverse quantities without reviewed evidence.
- Synthetic local movements remain as audit evidence. Test-account credentials
  stay outside Git with restrictive permissions and are disabled/deleted when
  browser work completes. No production/staging readiness is asserted here.
