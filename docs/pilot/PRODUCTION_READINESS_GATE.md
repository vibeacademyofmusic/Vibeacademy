# Production Readiness Gate — NO-GO

2026-09-17. **NO-GO. Owner approval required before any Production action.**
This is the gate at the current blocked checkpoint, not completion of all phases.
No product feature was added during this readiness task.

## Current verified checkpoint — staging 94

Owner explicitly authorized the ten IDs in the 84→94 batch. Applied only to
`owpfqwdrmyzcmjahehek` with the normal CLI runner capped at94; exact live ledger
94, latest `20260917020000`. No skipped or extra migration. Production HOLD.
Actual ledgers: **LOCAL95 / STAGING94 / PRODUCTION28**; missing1 on staging and67
on Production, with no remote-only versions. The only staging gap is
`20260917100000`, expressly excluded from this authorization.

Immediate and final reconciliation: tuition **5,500,000 VND**, five students/five
enrollments, one tuition row, zero invoices/payments/refunds/payrolls/payroll
corrections/customer credits. All91 pre-existing non-ledger table fingerprints
match the pre-apply baseline; after tests all92 baseline tables including ledger
remain unchanged. **Unexplained VND difference0**. Expected new metadata:87
Theory references, MT5.15 SOURCE_MISSING. Learning versions0: no published content.

**Full schema94-compatible pgTAP:59 files /1,533 assertions PASS**, exact repository
revision `f5a20f7` (94 migrations). Temporary fixture setup uses postgres and
public/extensions search path, while preserving authenticated/anon/JWT switches
and every original assertion. All tests rollback. No failures or retries this run.
Focused learning foundation, assessment, regrade, shadow mapping, Theory,
analytics and security catalogue: **7 files /224 assertions**, included in1533.
Live catalogue:15 learning tables all RLS, no anon SELECT;24 learning/assessment
SECURITY DEFINER functions have no anon execution. Historical non-definer trigger
`stamp_learning_journal` retains EXECUTE but is a trigger-only routine, not a
callable business RPC; no grants weakened. Full catalogue regression PASS.

Current application/bootstrap **295 PASS**; Webpack build, whole-repo ESLint and
`git diff --check` PASS. Local pgTAP59/1563 is the previously verified schema95
result, not rerun here. The30-assertion difference is schema/revision-specific;
no assertions were removed to manufacture a pass. Default Turbopack not rerun.
Fresh schema plus92-table/461-row business backup captured before apply, Auth data
excluded; fresh COPY export structurally checked, not independently restored this
run. Previous checkpoint84 restore verification remains historical evidence.
Temporary backup/harness material removed after reconciliation; no new credential,
Auth login or external notification delivery. No product code or migration edited.

**Batch84→94 PASS. FULL STAGING NOT READY. PILOT NOT READY. Production NO-GO.**
Full current-schema browser/role/E2E and Migration Pilot are not claimed complete.
Next action: separately authorize20260917100000 using the linked94→95 plan.
No push/deploy/Production mutation. No commit created in this continuation.

## Blocking conditions

1. Staging is94 of95. Batch84→94 passed full compatible regression and reconciliation.
   Only `20260917100000` requires separate approval; see
   [exact94→95 request](../staging-batch-94-95-approval-20260917.md).
2. Current-schema staging role tests, populated E2E and browser checks remain open.
3. Approved 20–30-row representative de-identified source/control totals and named
   pilot unit/users are absent. No real-source import or fabricated pilot claimed.
4. Full Auth restore (credentials/provider/MFA/session recovery) is not certified by
   synthetic FK placeholders. Production recovery requires a separate plan/test.
5. CRM policy/implementation, full Theory/Aural content and Report Card remain
   incomplete. Owner must explicitly approve narrower pilot scope or await their
   completion; this task is not permission to build new features.
6. Whole-system security and realistic performance gates are incomplete. The
   catalogue audit and small synthetic latency baseline are bounded evidence only.

## Production backup/restore plan (not executed)

Under a future separate Owner authorization, name the backup owner and restoration
operator, define recovery point/time targets, freeze affected writes, and capture
schema, business data, ledger, managed Auth recovery, Storage object/metadata and
configuration inventories. Keep secrets outside Git with access controls and a
retention deadline. Record checksums/counts without publishing personal rows.

Restore to an isolated approved environment first. Verify ownership/extensions,
FKs, exact per-currency control totals, user status/roles/scopes, Auth provider/MFA
and login behavior, file access and audit continuity. Do not enable recovered users
or send external messages as an incidental side effect. No production restore is
implied by a successful local synthetic rehearsal.

## Proposed cutover sequence (requires later approval)

1. Owner signs scope, exact migration manifest/hashes, maintenance window, backup
   and rollback owner, approved release commit, contacts and acceptance criteria.
2. Re-read production ledger and compare schema contracts; halt on drift. Rehearse
   **all 67 production gaps** against a fresh authorized isolated recovery image;
   the prior local 35-migration rehearsal alone does not cover this path.
3. Capture a verified recovery point, financial control totals and activity boundary.
   Freeze affected writers and external workers through an approved operational
   mechanism; do not invent a maintenance flag that the app does not implement.
4. Apply approved dependency batches with the normal migration runner. No ledger
   repair, timestamp rewrite, skipped file or implicit `include-all` remediation.
   Reconcile after each batch; unexpected VND difference must be zero.
5. Deploy only the explicitly approved compatible application release after schema
   checks. Production deployment is not authorized now.
6. Execute approved smoke checks with dedicated least-privilege identities. Any
   real financial test requires separate authorization and existing audited reversal;
   do not create fake money on Production merely for smoke testing.
7. Owner accepts evidence, then progressively resumes approved one-unit activity.
   Observe incidents and financial totals before expansion. No unattended rollout.

## Smoke matrix

- Login/logout and active/inactive/expired role behavior; cross-branch denial.
- Attendance today/Vietnam time, actual/substitute teacher; no full-history fetch.
- Own/linked-child portal data and former-teacher historical limits.
- Tuition, invoice, cash, opening debt and credit read totals agree by currency.
- Maker cannot self-approve refund/void/payroll; finalized rows immutable.
- Implemented assessment delivery/manual review/regrade and private answer boundary.
- Notifications do not claim external SENT without delivery evidence.
- Desktop/tablet/mobile navigation and error monitoring.

Read-only smoke is the default on Production. Mutation paths must be proven on
staging first and separately authorized if needed on Production.

## Rollback checkpoints

- Before apply: cancel window without database mutation.
- Between batches: freeze affected operations and inspect ledger/reconciliation;
  no automatic destructive down migration. Prefer reviewed forward correction.
- After application deployment: code rollback only if compatible with new schema;
  reverting Git does not roll back financial state.
- After business activity: preserve audit; use canonical correction/reversal, never
  rewrite finalized history. Whole restore risks losing post-backup activity and
  requires Owner-approved reconciliation/recovery, not an automatic retry.

## Owner actions

First, authorize the single final staging migration20260917100000. Supply the approved representative source and nominate
pilot participants/unit when ready. Production stays HOLD until a later refreshed
GO/CONDITIONAL GO gate and explicit Owner release authorization; this NO-GO report
cannot be used as a deployment instruction.

## Closure addendum — monitoring and import controls

The refreshed closure report records another full local run: 59/1,533 pgTAP and
273 application/bootstrap PASS, ESLint PASS; default Turbopack build FAIL on port
permission, Webpack PASS. Cloud ledgers remain 94 local / 59 staging / 28 production.
The exact ordered Production sequence is every PRODUCTION-marked row, top-to-bottom,
in the [66-gap register](../migration-gap-register-20260917.md). Before release,
pin those hashes to the approved commit and rehearse the entire sequence. Suggested
prefix checkpoints: 28→42 Academic/Finance/reports; 42→49 teaching/payroll/security;
49→59 security/maker-checker; then 62,69,77,81,84,94 per staging dependency batches.
Verify exact file membership before executing; counts alone do not establish identity.

At each checkpoint compare all existing record counts, ledger versions, FK integrity,
profile/role states and per-currency financial control totals. Intentionally seeded
metadata must match the reviewed manifest; existing financial data must not change
without an approved transformation. Permission seeds require role-boundary retests.

Monitoring owner and on-call contact must be nominated before release. Observe
application errors and denied/failed actions, login failures, job delivery/retry state,
request latency and database saturation against an approved measured baseline.
Review source failures and cross-branch access with redacted references, never tokens
or student payloads in public logs. No SLA or capacity is asserted from small local
fixtures. During the first approved unit window, reconcile at start/end of each day
and after imports/financial batches. SEV-1 stops affected writes immediately; SEV-2
pauses the blocked workflow; SEV-3 is tracked. Define the next review time and person,
not an unattended promise to monitor after this task ends.

Legacy dry-run is read-only to business tables: source hash, versioned mappings,
valid/review/reject/duplicate outcomes and signed per-currency totals. Future import
waves require separate Production authorization and staged acceptance: first the
approved single-unit minimal cohort, then a reviewed larger same-unit wave, then
additional units only after signed reconciliation. Do not copy the synthetic staging
row count into a Production import instruction. Opening settlement must remain
historical, not new cash/revenue; no debt loss into negative balances or untracked
credit. After activity begins, reversal/correction replaces destructive rollback.
