# Local business backup/restore validation — 2026-09-17

## Fresh84→94 checkpoint

A new restricted schema/business export was captured before the authorized84→94
apply:92 COPY tables/461 rows, Auth data excluded, complete COPY terminators.
This fresh export was structurally checked but not independently restored during
this run. The earlier successful84 restore below remains separately dated evidence.
After apply and59-file/1533-assertion staging regression, all91 original business
table fingerprints are unchanged; only the ledger gained the approved10 rows.
Temporary export/harness artifacts were removed after final reconciliation.
No usable Auth test identity/credential was created this run.


## Fresh authorized staging continuation — 2026-09-17

The following new restore checks were executed before/while applying the staged
schema batches. They supersede the older statement that no recovery snapshot is
available during the active rehearsal. All exports exclude staging Auth data;
only local Auth schema definitions and locked synthetic IDs support FK restoration.

| Checkpoint restored | Tables | Rows | Result |
|---|---:|---:|---|
| Staging 59 fresh backup | 57 | 407 | Exact original-column COPY fingerprints; every FK valid |
| Staging 62 fresh backup | 68 | 426 | Exact COPY fingerprints; every FK valid |
| Staging 84 fresh backup | 92 | 461 | Exact COPY fingerprints; every FK valid |

Each restored database contained the same 22 synthetic Auth IDs, banned indefinitely,
with no email, phone or password hash. No staging/production Auth rows were copied.
The local application database was neither reset nor overwritten. Restores commit
only after explicit FK orphan checks; temporary replica mode was confined to the
disposable local restore session and reset before verification/commit.

Across staging 59→84, all 54 original non-metadata source tables remain exact,
including original profiles, role assignments, branch/relationship references and
financial rows. Expected metadata changes: permissions 38→55, role permissions 40→49,
ledger 59→84. Three organization units seeded; employee, financial, notification,
stock and instrument operational tables remain empty. Tuition 5,500,000 VND and
unexplained difference 0. Backup captures69/77/81 are recovery checkpoints but were
not independently restored, and are not reported as restored PASS.

Current local quality gates: 59 pgTAP files / 1,563 PASS; application/bootstrap 295 PASS;
Webpack build and whole ESLint PASS. Staging 84 full regression is recorded separately
in [staging report](staging-rehearsal-report.md). Production remains HOLD. Real Auth
credentials/provider/MFA/session restoration remains unverified.

Cleanup complete: all three disposable recovery databases were dropped after
verifying their 22 synthetic identities remained locked and credential-free. The
authorized temporary recovery folder, exports, harnesses, logs and unused isolated
app copy were removed. No staging application-login credential was retrieved/generated in this
continuation; no test account was persistently activated. Git changes are reports
only and pass credential-pattern scanning. A fresh recovery point must be captured
before resuming the 84→94 batch; the removed exports are not available backups.

## Historical prior rehearsal

## Scope and result

**PASS for the stated local business-data restore and upgrade rehearsal.**
Production remains HOLD. No production mutation, deployment or push. This report
is not a claim of complete Auth recovery or full staging validation.

Owner authorized a restricted business/ledger export from staging
`owpfqwdrmyzcmjahehek`, excluding Auth data, and separately authorized locked fake
Auth identities on LOCALHOST. The destination is the disposable local database
`vibe_staging_restore_20260917` in the existing local Supabase container. The
application database was not reset or overwritten.

## Restore evidence

- Schema restored transactionally with its original ownership, using the existing
  local administrative role and required `btree_gist` extension.
- No Auth data exported. Twenty-two placeholders were generated from business FK
  references: ID plus infinite ban only; email, phone and password hash are null.
- Business restore committed only after explicit orphan checks for every FK.
- All 57 exported business/ledger tables, totaling 407 rows, matched exactly by
  order-independent hashes of PostgreSQL COPY output using original columns.
- This includes profile, role, branch, parent/student and teacher relationship
  records present in the snapshot, including their stored states and history.
- Profiles without Auth identity: 0. Role assignments without Auth identity: 0.
- All 22 identities remained banned; no operational login credentials created.

## Upgrade and financial reconciliation

The normal migration runner applied the 35 pending repository migrations to the
isolated clone: ledger **59 → 94**. No manual ledger repair or timestamp change.
After full database tests, comparisons were repeated:

| Source table category | Result |
|---|---|
| 54 unchanged source tables | Exact original-column row match |
| Permissions | 38 → 55; 17 added, 0 removed |
| Role permissions | 40 → 49; 9 added, 0 removed |
| Migration ledger | 59 → 94; 35 added, 0 removed |

These permission additions are intentional migration metadata, not new user-role
assignments. Original user-role rows and branch scopes remained identical. New
catalogue seeds: three organization units and 87 Theory contents rows. Employees:
zero; the source snapshot predates the employee module.

Tuition remains **5,500,000 VND** (the original tuition row matches exactly).
Invoices, payments, refunds, payroll periods, teacher payrolls, payroll corrections,
opening receivables and customer credits remain zero. Unexplained VND difference:
**0**. No financial generation routines were invoked by the upgrade.

## Quality gates

- Restored/upgraded database pgTAP: **59 files / 1,533 tests PASS**.
- Application/bootstrap: **273 tests PASS**, zero failures/skips.
- Build: **PASS with `npm run build -- --webpack`**. The earlier environment-specific
  Turbopack port restriction is not represented as a passing default build.
- Whole-repository ESLint: **PASS**.
- Diff check: **PASS**. See cleanup below.

## Limits

This rehearsal does not verify real Auth passwords, provider identities, sessions,
MFA, recovery email, token rotation, Auth service restoration or production recovery.
The fake banned rows preserve references; they do not prove users can log in after
an actual disaster. Restored business states are preserved rather than changed to
match the Auth ban. Authorization regression tests exercise synthetic role/JWT
fixtures and do not establish that a banned user's fabricated JWT is rejected by
PostgREST; no usable sessions were created for restore placeholders.

The source had no employee records. Employee relationships are exercised by the
existing regression suite, not a populated employee backup. Exact record equality
and the security suite support scope preservation for this fixture; they are not
a replacement for complete staging role/browser rehearsal or a production restore.

## Temporary material

Backup and verification artifacts were outside Git under the explicitly authorized
temporary directory, with files restricted to 0600. After recording evidence, the
isolated clone was dropped (including all 22 placeholders), and the backup, scripts,
logs and temporary migration workspace were deleted. The application database was
not dropped/reset. No raw business rows, Auth rows, credentials or row hashes are
included in this report. No usable Auth credential was generated during recovery.

Staging apply was blocked by approval review before execution. A fresh authorized
backup/recovery point must be captured before a later staging upgrade; do not assume
the deleted snapshot is still available. Repository changes contain only reports,
no credentials or test data.
