# Financial authorization — Phase 1 V3

2026-09-16. Local validation PASS. Production HOLD; staging replay pending.

## Workflow

Migrations `20260916110000_financial_approval_workflows.sql` and
`20260916111000_invoice_cancellation_approval.sql` follow payroll maker-checker
`20260916100000`. No historical migration was edited.

Refund, payment void, refund void/allocation, issued-invoice cancellation and
post-finalization payroll correction now require a request and independent
checker. Requesting does not post a transaction. Approval validates the source
again under locks, then approval, posting and audit occur in one transaction.
A changed source requires cancellation and a new request. Retry keys are scoped
to the maker; a posted request is not executed twice. Legacy sensitive RPCs reject
direct posting; their unchanged ledger engines are private and not executable by
application roles. Draft invoice cancellation remains the existing admin action.

FINANCE permissions must match the same active role assignment and branch.
BRANCH_ADMIN cannot approve. Emergency self-approval requires global SUPER_ADMIN,
explicit type and reason, with its own event and before/after snapshots.

The owner-approved correction workflow stores original payroll/line, original
amount, corrected amount, remaining delta, reason, maker/checker and timestamps.
Normal correction posts an append-only adjustment into the earliest existing
next open payroll period (generate a DRAFT destination first). Off-cycle uses a
separate finalized correction record/view. Neither reopens the original payroll.
Repeated corrections subtract prior posted deltas. Correct the original source,
not a correction line. No bank payout or automatic cash transaction is added.

`/finance` is a scoped FINANCE workspace, separate from the full Admin area.
Admin forms also submit requests. Payroll review includes paginated earnings and
adjustments; finalized records have no editing or reopening form.

## Verification

- pgTAP: 42 files / 828 assertions PASS.
- Application/bootstrap: 118 tests PASS.
- Build, relevant ESLint, TypeScript and git diff whitespace checks PASS.
- Local browser: refund request, self-approval denied, different FINANCE approval;
  payment void with different requester/checker; next-period correction; separate
  off-cycle correction; payroll review, maker approval denied, independent
  approval/finalization; finalized UI locked; cross-branch request and direct
  payroll reads denied. Desktop 1440×1000 and mobile 390×844 inspected. Mobile
  overflow fixed; document width equals viewport. No browser error logs.
- Fake `PH1-BROWSER` reconciliation: two original payments each 1,000,000 VND,
  one stays POSTED with 100,000 refunded, the other VOIDED; original finalized
  payroll stays 1,000,000; next payroll finalized at 1,100,000; separate correction
  50,000. Four posted requests, twelve audit events, different maker/checker for
  every request. No financial difference remains unexplained.
- Existing ledger tests retain amount/receivable assertions, now submitting via
  temporary test-only approval helpers rather than bypassing the new workflow.

## Limits / deployment

Local fake finalized history is retained. Test credentials are temporary and are
not committed. No staging/production writes, payout, real notification or push.
No manual debt adjustment engine exists yet; this phase does not invent one.
Payroll preparation remains admin-only; FINANCE can review/approve in scope.
Source selectors are bounded (25 payrolls/payments, 100 source lines per type);
large historical source selection needs further pagination. Review detail is
paginated. The off-cycle record is not a bank disbursement.

Deploy only after staging replay and explicit production migration approval.
The production migration ledger/backfilled Cần Thơ prerequisite remains HOLD.
Application-only deployment is insufficient for the new RPC/schema contract.
