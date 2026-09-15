# Payroll maker-checker V3 checkpoint

Date: 2026-09-16. Status: LOCAL VALIDATION PASS; staging replay pending.

## Implemented boundary

Migration `20260916100000_payroll_maker_checker.sql` enforces separation in
both the existing transition RPC and the explicit emergency RPC. The generator
and any adjustment author cannot ordinarily approve/finalize that period.
A different FINANCE actor needs the matching active permission and branch scope.
BRANCH_ADMIN is denied. Read access alone does not authorize approval.

The period is locked after scope authorization and checked against its expected
version. State changes and audit insertion share one transaction. Existing
approved/finalized history triggers remain unchanged. Emergency override never
reopens a finalized period or permits rewriting its financial lines.

The existing append-only `payroll_events` stores the dedicated emergency event,
override type/reason and before/after period, payroll totals and adjustments.
`actor_id` and `created_at` identify who performed it and when. The snapshot
helper is not executable by application roles. UI adds an explicit optional
emergency form and displays its reason in history; it does not silently upgrade
ordinary self-approval into an override.

## Verification

- Full local pgTAP: 40 files / 757 assertions PASS (22 new boundary assertions).
- Application/bootstrap: 106 tests PASS (3 new payroll UI/action tests).
- Build, relevant ESLint and diff whitespace check PASS.
- Browser, fake local account: create August period, generate MONTHLY 10,000,000
  VND, enter REVIEW, ordinary self-approval denied without changing status,
  explicit emergency approval/finalization succeed and display audit reasons.
- Mobile 390×844 and desktop 1440×1000 inspected; no browser error logs.
- Finalized UI hides generation/transitions; database tests reject source edits
  and audit deletion even through privileged SQL.

Local fixture is clearly labeled `V3-PAYROLL` / `V3-PAYROLL-TEACHER`; its finalized
period is retained as test history. No payout occurred. Browser session logged
out and closed. No production or staging mutation occurred for this checkpoint.

## Remaining Phase 1 work

This is the payroll approval portion, not completion of all financial
authorization. Refund/payment-void maker-checker, general correction/reversal
workflows, FINANCE UI/login rollout and staging identity rehearsal remain.
The current payroll preparation RPCs and Admin UI still require SUPER_ADMIN;
FINANCE approval has been exercised at the database boundary.

Production remains HOLD. The changed UI requires this migration, so it must not
be shipped to a database lacking the new audit columns/RPC.
