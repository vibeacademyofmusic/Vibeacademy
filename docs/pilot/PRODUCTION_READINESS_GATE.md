# Production Readiness Gate — NO-GO

2026-09-17. **NO-GO. Owner approval required before any Production action.**
This is the gate at the current blocked checkpoint, not completion of all phases.
No product feature was added during this readiness task.

## Fresh evidence

| Gate | Status / evidence |
|---|---|
| Local ledger | 94 |
| Staging ledger | 59, fresh read-only audit; 35 migrations missing |
| Production ledger | 28, fresh read-only audit; 66 migrations missing |
| Unexpected remote versions | 0 |
| Local business recovery | PASS: 57 tables, 407 exact rows, all FKs checked |
| Local restored-snapshot upgrade | PASS: 59→94; 54 unchanged source tables; only expected metadata/ledger additions |
| Locked restore identities | 22/22 remain indefinitely banned; no passwords, email, phone or sessions |
| Local pgTAP on recovered database | 59 files / 1,533 PASS |
| Application/bootstrap | 273 PASS |
| Build | Webpack PASS; default Turbopack not certified in this environment |
| ESLint | Whole repository PASS |
| Finance recovery comparison | Tuition 5,500,000 VND; unexplained difference 0 |
| Full current staging role/browser/E2E suite | NOT RUN; historical Phase 3 evidence is not current full certification |
| Migration pilot | PENDING; representative source missing |
| Production Auth/backup restore | NOT VERIFIED |

Exact missing IDs, file hashes and domain/mutation classifications are in
[migration gap register](../migration-gap-register-20260917.md). Staging batch
order and 35-file manifest are in [preflight](../staging-upgrade-preflight-20260917.md).

## Blocking conditions

1. Automatic approval review rejected applying staging batch `20260916130000`,
   `20260916140000`, `20260916150000`, requiring explicit per-ID confirmation.
   Command did not execute; no bypass or alternate mutation mechanism used.
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
   **all 66 production gaps** against a fresh authorized isolated recovery image;
   the staging 35-gap rehearsal alone does not cover this path.
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

First, confirm the three exact staging IDs above. Later groups require their own
review/authorization outcome. Supply the approved representative source and nominate
pilot participants/unit when ready. Production stays HOLD until a later refreshed
GO/CONDITIONAL GO gate and explicit Owner release authorization; this NO-GO report
cannot be used as a deployment instruction.
