# Staging migration rehearsal

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

## Historical checkpoints through staging84

## Earlier continuation checkpoint

Owner authorized the first three IDs and safe continuation. The normal capped
runner applied the reviewed dependency batches below only to `owpfqwdrmyzcmjahehek`:

| Ledger | Scope | Focused staging regression |
|---|---|---|
| 59→62 | Legacy review, opening collections, customer credit | 3 files / 158 assertions PASS; included in full62 below |
| 62→69 | Employee/attendance/payroll | 8 files / 307 assertions PASS |
| 69→77 | Family/teacher portal boundaries | 8 files / 356 assertions PASS |
| 77→81 | Notifications, source/idempotency guards | 4 files / 151 assertions PASS |
| 81→84 | Inventory and serialized instruments | 3 files / 85 assertions PASS |

All before/after batch checks retained tuition **5,500,000 VND**, one tuition row,
zero invoices/payments/refunds/payrolls/corrections/customer credits/opening postings,
and zero employees. Exactly three organization units were seeded. Notification
jobs/events/inbox and stock/instrument rows remain zero after rolled-back tests.
Unexplained VND difference **0**. Each ledger is the exact corresponding local
prefix; no repair, timestamp change or CLI upgrade. The 77 and 81 test runs each
had one DNS failure before a test connected; isolated retries passed, with no
assertion changes. Totals exclude duplicate runs.

Before further batches, restricted business/schema checkpoints were captured with
Auth excluded at62,69,77,81,84. Local restoration independently verified the62
snapshot: **68 tables / 426 exact rows**, all FKs checked, 22 banned synthetic
Auth identifiers without email/phone/password. The original 59 snapshot also passed
as detailed below. Later captured snapshots are not labelled independently restored.

Automatic approval review rejected the **84→94** command before execution,
requiring exact per-ID approval. None of those ten migrations applied; no alternate
execution was attempted. Exact IDs, hashes, dependencies, risk classification and
approval wording: [84→94 approval plan](staging-batch-84-94-approval-20260917.md).
`20260917100000` is a separate later migration, not included in that approval.

Fresh local gates already PASS: 59 pgTAP files /1,563 assertions; application/
bootstrap 295; Webpack build; whole-repository ESLint. Full schema 84-compatible
staging regression is **PASS: 52 files / 1,309 assertions**, using exact checkpoint
`c82bb1c`. One file failed DNS before executing; its automatic retry passed.
This is separate from the current local schema 95 suite and not a claim of
current-schema 95 browser/E2E certification. No staging application-login
credential or usable Auth account has been created/reactivated in this continuation;
no email/Zalo send, production mutation, push or deployment occurred.

## Final reconciliation and cleanup at the approval hold

Fresh read-only ledgers: **LOCAL 95 / STAGING 84 / PRODUCTION 28**; missing 11 staging
and 67 production, no remote-only versions. The gap register verifies every missing
file hash. After the full 52-file staging regression, all 54 original non-metadata
tables still match the original 59 backup directly on staging. Expected changes:
permissions 38→55, role permissions 40→49, ledger 59→84. Tuition remains 5,500,000 VND;
financial, opening, employee, notification and stock/instrument counts remain zero.
Unexplained VND difference 0. No new Auth login credential was extracted or issued.

Three disposable local restore databases were removed after locked-identity checks.
All task-owned restricted backup/export/test artifacts and the unused isolated app
copy were deleted. No browser server was started. Recreate and verify a fresh
recovery point before resuming the blocked batch. The existing application database
and its accounts were untouched. No code/migration source was edited; Git changes
are documentation only, with credential-pattern and diff checks PASS.

## Authorized batch 59→62

Owner explicitly authorized `20260916130000`, `20260916140000`,
`20260916150000` on `owpfqwdrmyzcmjahehek`. The normal migration runner applied
exactly those files from an isolated 62-file prefix. Ledger is **62**, latest
`20260916150000`; no repair, timestamp change, CLI update, production mutation,
push or deployment. This resolves the earlier approval block for these three IDs.

A fresh business/ledger backup excluded all Auth data. It restored to an isolated
localhost database: **57 tables / 407 rows exact**, every FK checked, 22 synthetic
identities banned indefinitely with no email/phone/password. This is business
recovery evidence, not production Auth recovery.

### Reconciliation and focused security

Tuition remains **5,500,000 VND**. Invoice, payment, refund, payroll period,
teacher payroll, payroll correction and customer-credit counts are zero after
apply. Unexplained VND difference: **0**. After rollback-only regression, all
**54 non-metadata source tables match the fresh backup exactly**, including
original user-role/relationship and financial rows. Expected metadata changes:
permissions 38→50, role permissions 40→44, migration ledger 59→62.

Catalogue inspection: all **11 new public tables** have RLS and policies, no
anonymous SELECT and no direct authenticated INSERT/UPDATE/DELETE; all **15
created/replaced views** use `security_invoker=true`. All affected SECURITY
DEFINER routines pin `search_path=public, pg_temp`, deny anonymous execution;
private finance routines deny authenticated execution. The pre-existing
non-definer trigger function `prepare_enrollment_tuition()` still has anonymous
EXECUTE metadata; trigger functions cannot be called as ordinary RPCs, and the
later reviewed anonymous-grant cleanup remains pending. No bypass was added.

Focused workflow tests cover reviewed atomic import, missing-class NEEDS_REVIEW,
no premature enrollment/finance posting, idempotency, opening collections,
correction below collected cash, traceable customer credit, maker-checker,
refund/reversal, branch denial, exact reconciliation and immutable originals.
Five extra rollback-only assertions verify INACTIVE SUPER_ADMIN cannot stage or
read migration/credit data. Existing role/relationship regressions remain intact.

### Validation evidence

- Staging checkpoint `f288ead` (exact 62 migrations): **46 files / 1,016 assertions
  PASS**, plus **1 temporary ACTIVE-account test / 5 assertions PASS**; total
  **47 files / 1,021 assertions PASS**. Focused 3-file / 158 assertions are included,
  not added again to that total.
- Current local schema 95: **59 pgTAP files / 1,563 assertions PASS**.
- Current application/bootstrap: **295 PASS**, no failures/skips.
- Webpack build: **PASS**; whole-repository ESLint: **PASS**.
- The existing transaction-local staging harness was used; no assertion, JWT role
  switch, RLS or grant was weakened. Helpers were expanded only in temporary files.
  One DNS connection failure occurred before a test ran; its retry passed. One
  harness search_path insertion landed in a historical comment; only the temporary
  runner setup was corrected, and the previously unexecuted test passed. Neither
  failed attempt is counted as passing evidence.
- Current-schema full browser/role/E2E certification is still pending schema
  alignment; historical browser results below do not certify the new batch.

Fresh ledger comparison: **LOCAL 95 / STAGING 84 / PRODUCTION 28**; gaps **11 / 67**,
with no remote-only versions. Production inspection was ledger SELECT in a
read-only transaction only. Next batch: [84→94 plan](staging-batch-84-94-approval-20260917.md).
See [gap register](migration-gap-register-20260917.md) and
[NO-GO gate](pilot/PRODUCTION_READINESS_GATE.md).

The V3 Phase 3 PASS below is historical and limited to its then-implemented scope.

## Master Plan V3 — Phase 3 completed (2026-09-16)

**PASS for the current implemented security/financial surface. Production HOLD.** The owner explicitly authorized only staging project `owpfqwdrmyzcmjahehek`; production `qhznfywwrhmcwbkujclm` received no migration, data, environment or deployment change. The earlier sections below are historical checkpoints.

### Applied migrations and exact reconciliation

Applied, in order: `20260916100000`, `20260916110000`, `20260916111000`, `20260916120000`. The staging ledger changed **55 → 59** and contains exactly these four additional versions. No ledger repair, skipped migration, timestamp change or CLI upgrade was used.

| Metric | Before migration | After migration | After full rehearsal |
|---|---:|---:|---:|
| Migrations | 55 | 59 | 59 |
| Students | 5 | 5 | 5 |
| Class enrollments | 5 | 5 | 5 |
| Tuition rows | 1 | 1 | 1 |
| Representative tuition (VND) | 5,500,000 | 5,500,000 | 5,500,000 |
| Invoices | 0 | 0 | 0 |
| Payments | 0 | 0 | 0 |
| Refunds | 0 | 0 | 0 |
| Payroll periods / teacher payrolls | 0 / 0 | 0 / 0 | 0 / 0 |
| Payroll corrections | Table not yet present | 0 | 0 |

Tuition difference **0 VND**. No unintended financial records survived rehearsal. Eleven additional synthetic auth identities/profiles and their role assignments were intentionally provisioned for authentication checks; all eleven profiles were set INACTIVE afterward. Their identity/audit rows remain, without active application access. Existing business fixtures were not deleted.

### Security evidence

All **43 pgTAP files / 858 assertions PASS on staging** and independently **43 / 858 PASS on local**. Populated transactional fixtures exercise real authenticated database roles, positive access and negative boundaries; financial fixture changes roll back. Coverage includes:

| Required scenario | Evidence |
|---|---|
| SUPER_ADMIN and scoped/expired/inactive role behavior | Authorization, relationship, finance-read and security-consistency suites |
| FINANCE_MAKER cannot approve own refund/payment void | Financial approval workflow suite; pending requests leave ledgers unchanged |
| FINANCE_CHECKER approval, retries and audit | Financial approval workflow and invoice-cancellation suites |
| Payroll maker-checker and finalized immutability | Payroll maker-checker, financial approval and payroll foundation suites |
| Next-open-period and off-cycle payroll correction | Financial approval suite asserts exact delta, original line linkage, maker/checker and unchanged original finalized row |
| SUPER_ADMIN emergency override | Explicit type/reason required; branch-scoped SUPER_ADMIN cannot borrow global authority; audit asserted |
| BRANCH_ADMIN_A / BRANCH_ADMIN_B | Branch/relationship and financial scope suites; positive same-branch and denied cross-branch |
| TEACHER_ACTIVE / SUBSTITUTE_TEACHER | Session assignment, feedback actual-teacher and relationship suites |
| TEACHER_FORMER | Historical teacher suite: actual taught sessions/authored journals retained; current profile/other authors denied |
| PARENT_ACTIVE / PARENT_INACTIVE / STUDENT | Student-parent history, relationship and feedback authorization suites: own/linked-child only, invalid links/inactive identities denied |

Additionally **38 real-JWT assertions PASS across all 11 named rehearsal identities**: account/role checks, finance and branch scope, inactive existing-session denial, expired role denial and inactive-parent RPC denial. These newly created JWT actors were not linked to business teacher/parent/student records. Populated pgTAP fixtures, rather than empty reads by those actors, supply the positive/negative business-relationship evidence. Dedicated parent/student portal UI is not implemented and is not certified by this rehearsal.

### Runner corrections and reproducibility

The linked CLI's temporary login does not inherit fixture-setup privileges. For staging replay only, temporary copies add transaction-local `SET ROLE postgres` and `search_path=public,extensions` at transaction start, and restore the same fixture role where the source uses `RESET ROLE`. Original `SET ROLE authenticated`, JWT identities and every assertion remain unchanged. Referenced test helpers are expanded into the temporary file because individual-file Docker mounts do not include sibling helper paths. No grants or RLS are weakened on staging.

Run sorted test files in batches of at most ten, obtaining a fresh linked CLI login per batch, and do not run another linked DB CLI command concurrently. Batch results were **10/193, 10/263, 10/168, 10/191, 3/43** (files/assertions), totaling **43/858**. Earlier full-run failures were test-runner setup/credential expiry, not passing evidence. One genuine test-fixture assumption was corrected: `session_occurrences_test.sql` now temporarily inactivates existing schedules inside its rollback-only transaction, so its global generator assertion is isolated on populated databases. Its eight assertions pass locally and on staging. No engine change was needed.

### Browser and application validation

An isolated local app at `127.0.0.1:3001` used staging-only public credentials; the repository environment was untouched. SUPER_ADMIN Dashboard, Attendance, Finance and Payroll loaded without source errors. Finance maker/checker each reached `/finance`; maker access to the SUPER_ADMIN Finance route was denied. Branch A/B Operations showed distinct populated student/class sets; a direct cross-branch student URL returned not-found. INACTIVE parent login was denied. Desktop 1440×1000 and mobile 390×844 checked; Payroll, Finance and Operations had document width equal to the mobile viewport. No browser error logs observed. Empty financial lists are a UI smoke check, not a substitute for populated financial assertions above.

- Application/action/bootstrap tests: **118/118 PASS**, zero skipped.
- Build: **PASS**.
- Repository-wide ESLint: **PASS**, zero warnings after scoped CommonJS configuration and a test-loader local-variable rename. No business logic changed.
- `git diff --check`: **PASS**.

Browser signed out; temporary tab closed and viewport restored. Isolated app stopped. Temporary staging credentials, generated passwords, test copies, scripts and app artifacts were removed after recording this report. No secret is stored in Git or project env files. Production remains behind this schema and **requires separate explicit approval**; no push/deploy was performed. Phase 4 may now proceed locally under the approved migration specification.


Historical report (2026-09-15 onward):

## Master Plan V2 update

Phase 1 Feedback correction: **PASS**, commit `0afe670`. New migration `20260916091000_harden_feedback_respondent_authorization.sql` enforces ACTIVE account/identity, same-role scoped feedback.submit permission and active date-valid parent link. Legitimate student/parent submission, admin resolution and actual-teacher behavior remain intact. Staging replay passed **20 authorization + 28 workflow + 14 actual-teacher assertions (62 total)** with rollback-only synthetic fixtures. Local baseline rose to **35 files / 597 tests**, all PASS; build, ESLint and 103 app/bootstrap tests PASS. SEC-LOCAL-002 is resolved on local/staging, not production.

Phase 2 relationship consistency: migration `20260916092000_align_relationship_read_authorization.sql` is applied on local and staging. New narrow related_student_profiles projection prevents raw staff-note exposure to students; expired parent links and cross-role scope borrowing are denied. Local **36 files / 613 tests PASS**; new staging relationship assertions **16/16 PASS**. Existing branch suite replay **39/39 PASS**; isolated commit `88e8c67` reviewed and created. The staging ledger is now **52**; the original 28→49 reconciliation below remains historical evidence.

Owner approved historical learner/parent access and limited former-teacher access in `decisions/HISTORICAL_ACCESS_OWNER_DECISIONS_V1.md`. Historical portal UI rollout is still pending; Phase 3 current-role rehearsal is recorded below. Earlier stop descriptions below record the original findings, not the current remediation status. Production remains HOLD; no production data/database/env changes.

## Phase 3 — real identities and browser replay

PASS for the existing exposed authorization surface at ledger **52**. Seven additional fake staging identities were provisioned: SUPER_ADMIN, BRANCH_ADMIN A/B, primary teacher, substitute, parent and student. No production keys or identities were used. **59 real authenticated-session assertions PASS**: branch isolation, action permissions, actual-teacher/substitute exclusivity, own/linked-child projections, unrelated/raw student denial, INACTIVE/SUSPENDED account denial with existing JWTs, expired role denial and expired parent-link denial. All temporarily changed statuses/validity dates were restored in finally blocks; sessions were signed out. Populated rollback suites above supply the Payroll/Feedback evidence; empty Finance reads alone are not privacy proof.

Browser replay used an isolated app on port 3001 and staging public credentials. SUPER_ADMIN Dashboard/Attendance/Finance/Payroll PASS; populated Attendance showed correct actual teachers and substitute badge, and class filtering returned exactly two fixture sessions. Mobile 390x844 menu/Attendance and desktop layout checked. Branch A/B each saw their own fixture class/student; branch A was denied the admin Finance route. Primary and substitute teachers each saw one assigned session and only the related learner. No browser error logs observed after correcting the temporary runner's public-key environment variable and replacing a stale tab after restart. The repository application required no fix. Browser accounts were logged out, the active test tab closed and viewport restored. Parent/student have real-JWT data-layer validation; dedicated portal UI is not implemented at this phase.

Post-rehearsal exact reconciliation: **52 migrations; 5 students; 4 classes; 5 enrollments; 4 sessions; 4 teachers; 1 tuition row / 5,500,000 VND; zero invoices, payments, refunds, payroll periods and teacher payrolls**. Compared with the earlier fixture checkpoint, the increases are exactly two fake students/classes/enrollments/sessions/teachers. No financial generation occurred; difference **0 VND**.

Temporary credentials, fixture scripts/results and isolated app were deleted after testing; no secrets were placed in Git or project env files. Synthetic staging accounts/business fixtures remain for reproducible rehearsal. Historical access decisions are approved but require the next incremental migration/tests before broader portal certification. No full Master Plan completion claim.

## Phase 4 — historical access increments

Teacher history migration `20260916093000` (commit `9091339`) passed **14/14 staging assertions**: previous teachers retain actual taught sessions and authored journals, without current learner profiles or other authors' journals once assignment ends. Student/parent migration `20260916094000` passed **57/57 staging assertions**: historical attendance, approved allowlisted snapshots and issued receivables remain visible to their owner/linked parent after pause/completion; inactive accounts, invalid links, unrelated identities, expired roles and missing permissions are denied. All replay fixtures rolled back; no direct Finance DML opened. Staging ledger **54**.

Local validation: **38 files / 684 pgTAP PASS**, **103 app/bootstrap PASS**, relevant ESLint and diff check PASS. Default build PASS after removing generated Turbopack cache from an earlier sandbox port-binding failure; Webpack build also PASS. Historical portal UI and broader FINANCE/academic staff delegation remain pending. This does not certify the full Phase 4 rollout or production readiness.

## Phase 4 — Finance/Payroll read increment

Migration `20260916095000` applied to staging after explicit Phase 4 authorization was rechecked. Automatic review initially interpreted authorization as only identity/browser setup; the same command was approved after presenting the Master Plan's Finance read operations/Payroll scope. No workaround, user-role assignment, production mutation or expanded financial mutation RPC was used.

Read-policy replay: **49 Finance + 31 Payroll assertions PASS**, all fixture transactions rolled back. FINANCE branch/global assignments work only with matching active permissions; inactive/expired/missing-permission cases return no rows. Teacher self-read requires payroll.view_own. Local **39 files / 735 pgTAP**, **103 app/bootstrap**, default build, relevant ESLint and diff check PASS. These tests do not certify a FINANCE UI/login rollout or all tuition/forecast/report staff paths. Owner maker-checker thresholds and emergency-override decisions remain pending before expanding financial approval workflows.

Final read-only reconciliation after all Phase 4 replays: **55 migrations; 5 students; 4 classes; 5 enrollments; 4 sessions; one tuition / 5,500,000 VND; zero invoices, payments, refunds, payroll periods and payrolls**. Difference remains **0 VND**. Temporary replay SQL/results/build logs were removed.

## Historical Payroll remediation checkpoint

Owner authorized continuing the Payroll correction. Commit `bda734d` adds `20260916090000_harden_payroll_self_read.sql`; no historical migration changed. `can_read_own_payroll` requires ACTIVE profile/teacher and an active, date-valid TEACHER assignment matching the payroll branch (or a global assignment). Both period and payroll-row RLS use this check. Approved/finalized state and SUPER_ADMIN compatibility remain intact.

Local and staging migration application PASS. Staging ledger at this earlier checkpoint was **50** (the historical upgrade reconciliation below remains 28→49). Direct authenticated-role staging tests: **29/29 PASS**, including INACTIVE/SUSPENDED profile, revoked/expired/future role, wrong branch, inactive teacher, unrelated payroll exclusion and valid finalized self-read. All staging fixtures ran inside ROLLBACK. Post-fix reconciliation: 3 staging students, tuition 5,500,000 VND, zero payroll periods/payrolls/invoices/payments. No production changes.

Validation: build PASS; relevant ESLint PASS; application/bootstrap 103/103 PASS; local pgTAP **34 files / 577 tests PASS**. Existing teacher-payroll fixture gained an ACTIVE profile and scoped TEACHER role; its original assertions remain unchanged. No UI changed; the post-fix check exercised database RLS directly, not a new browser login/workflow.

**SEC-LOCAL-002 — Feedback authorization blocker:** continuing the documented residual audit, a rollback-only local copy of `lesson_feedback_test.sql` provisioned the parent profile as INACTIVE and changed the valid-parent assertion to expect `P0001 / Unauthorized`. Result: **27/28 PASS, 1 FAIL**, test 10 “INACTIVE parent must not submit feedback”; actual “caught: no exception”. The parent submitted successfully. This diagnostic failure is separate from the 577-test baseline and must not be counted as PASS.

Cause: final `submit_lesson_feedback` from `20260915170000_session_teacher_assignment_v1.sql` checks auth.uid and parent relationship/status, but not ACTIVE account (nor active parent-child link). Later migrations do not replace that authorization body. The reproduction confirms inactive-account mutation; inactive-link behavior remains a separate unverified residual. No production or staging feedback was submitted. Under the Master Plan security stop, no Feedback remediation or later module rollout was started. Next bounded task requires resolving this authorization boundary with tests for active account, valid roles and active relationships while preserving legitimate respondents.

The rest of this report preserves the original rehearsal and first Payroll finding as historical evidence; SEC-STG-001 is now resolved on local/staging, not production.

## Scope and isolation

Production `qhznfywwrhmcwbkujclm` was read only. Staging `owpfqwdrmyzcmjahehek` received the representative baseline and all 21 upgrades. No production migration, data write, Vercel environment change or deployment occurred. The isolated local app on port 3001 uses staging-only public credentials; production auth, passwords, tokens and keys were not copied. No application or migration source was edited.

Both databases report PostgreSQL 17.6.1.166. Regions differ (production Tokyo, staging Seoul); observed latency is not a production capacity estimate.

## Representative baseline and de-identification

Production had only two students. Imported the small relational business dataset: 2 students, 2 class enrollments, 1 tuition term, 3 branches, 1 class/course, 2 teachers, 1 class-teacher assignment, 2 schedules, 3 rooms, 3 curricula, 9 levels, 49 subjects, 56 components, 2 academic enrollments, 10 level-progress rows, 15 subject-progress rows, 18 component-progress rows, 2 tuition plans and 4 branch prices.

Names/contact information, addresses, birth dates, personal free text and auth links were removed/replaced in the production SELECT before staging transfer. IDs and required relational, date/status and monetary fields were retained. No auth tables were exported. Temporary local data/credentials were held outside Git in a restricted directory. Four synthetic staging accounts were created: SUPER_ADMIN, BRANCH_ADMIN A/B and TEACHER. The Master Plan subsequently authorized the scoped fixtures; their roles were assigned only on staging.

Import at ledger 28 succeeded in one transaction, in dependency order. Foreign keys remained enabled. User triggers were temporarily disabled for the historical import to preserve progress rather than regenerate it; all were re-enabled before commit. Zero disabled user triggers afterward. Baseline public-column definitions and all public-function hashes matched production.

Fresh seed adds one extra branch and two prices (V01 differs from source CT01). They were retained, not silently deleted. This explains staging 4 versus source 3 branches; both pre/post upgrade snapshots include the extra seed rows. Automatic review denied deleting these seed records; no deletion occurred.

## Exact migration reconciliation (before security fixtures)

| Metric | Pre-upgrade | Post-upgrade |
|---|---:|---:|
| Migration ledger | 28 | 49 |
| Branches | 4 | 4 |
| Students | 2 | 2 |
| Class enrollments | 2 | 2 |
| Tuition terms | 1 | 1 |
| Classes | 1 | 1 |
| Sessions | 0 | 0 |
| Attendance | 0 | 0 |
| Synthetic auth users / profiles | 4 / 4 | 4 / 4 |
| Tuition VND | 5,500,000 | 5,500,000 |

Exact count reconciliation PASS; tuition difference 0 VND. New invoices, payments, refunds, payrolls, reports and feedback all zero. Post-upgrade cash received, net cash and invoice debt are zero. The old baseline had no payment engine/data; zero new-engine debt is not proof that the pre-existing tuition was paid. Paid/part-paid and historical attendance cases were unavailable in production and were not invented as migrated evidence. Forecast views are derived; no underlying financial generation occurred.

## 21 upgrades in timestamp order

Each file was applied sequentially with an explicit staging target in an isolated migration runner. No cherry-pick, skipped file, ledger repair or migration failure. Durations include CLI/network overhead, not measured database lock time.

| Migration | Result | Seconds |
|---|---|---:|
| `20260914201223_future_academic_start_scheduling.sql` | PASS | 7.17 |
| `20260915050000_edit_academic_program_start_date.sql` | PASS | 5.00 |
| `20260915060000_pause_tuition_effective_end.sql` | PASS | 5.28 |
| `20260915070000_invoice_engine_v1.sql` | PASS | 5.27 |
| `20260915080000_payment_engine_v1.sql` | PASS | 5.47 |
| `20260915090000_debt_engine_v1.sql` | PASS | 5.20 |
| `20260915100000_lock_tuition_discount_after_invoice.sql` | PASS | 5.13 |
| `20260915110000_refund_engine_v1.sql` | PASS | 5.43 |
| `20260915120000_finance_engine_v1.sql` | PASS | 5.41 |
| `20260915130000_revenue_forecast_v1.sql` | PASS | 4.99 |
| `20260915140000_tuition_operations_rpc.sql` | PASS | 5.20 |
| `20260915141000_tuition_reminder_engine_v1.sql` | PASS | 5.33 |
| `20260915150000_learning_reports_v1.sql` | PASS | 4.96 |
| `20260915160000_lesson_feedback_v1.sql` | PASS | 5.03 |
| `20260915170000_session_teacher_assignment_v1.sql` | PASS | 6.33 |
| `20260915180000_teacher_payroll_v1.sql` | PASS | 5.48 |
| `20260915181000_payroll_history_guards.sql` | PASS | 5.16 |
| `20260915190000_security_rpc_surface.sql` | PASS | 7.54 |
| `20260915191000_authorization_foundation.sql` | PASS | 5.91 |
| `20260915192000_security_unused_grants.sql` | PASS | 7.62 |
| `20260915200000_branch_relationship_scope.sql` | PASS | 5.43 |

## Post-upgrade contracts

PASS: session_actual_teachers, Payroll, Feedback, Reports and authorization objects exist. All public views have security_invoker enabled; all public SECURITY DEFINER functions have the hardened search path. RLS enabled on students, sessions, feedback, reports and payroll. Nine expected session/payroll/authorization indexes exist, and there are no invalid public indexes. Sampled authenticated direct Finance DML privileges are absent (invoice INSERT, payment UPDATE, refund DELETE).

## Browser checks against staging

SUPER_ADMIN password login and authenticated has_role RPC PASS, before and after upgrade. Browser login PASS. Dashboard, students, student Academic Journey/read-only record, Academic curriculum list, classes, Attendance, Finance, Payroll, Learning Reports, Feedback and Operations loaded without source-loading warnings. Attendance defaults both filter dates to Vietnam today and correctly shows zero sessions; no missing actual-teacher-view error. Finance shows zero cash/invoice debt; Payroll/Feedback/Reports show valid empty lists.

Desktop 1440x900 and mobile 390x844 Attendance/menu inspected: grouped navigation and active Attendance item display correctly, mobile menu opens. No browser console errors observed. These are page-load checks, not a claim that every transactional workflow was rerun.

## Historical security rehearsal — original blocker

The subsequent owner Master Plan authorized Phase 1 scoped staging identities. The formerly rejected fixture command then passed approval review and committed successfully. After migration reconciliation, test setup added one synthetic branch-B class/student/enrollment, two scheduled branch-A sessions (one explicit substitute), three scoped role assignments, teacher identity/branch links, and activated the copied DRAFT class for operational scope. These are deliberate post-upgrade test fixtures, not migration side effects.

Authenticated Supabase sessions passed **28 assertions**: A/B own class and student allowed, unrelated IDs denied, no sampled Finance/Payroll action permissions, teacher own class/student allowed, primary teacher excluded from the substitute session, branch-B sessions denied, and inactive/expired branch-admin sessions lose operational access with their existing JWT. Empty Feedback reads returned no rows; this alone is not proof of populated Feedback privacy.

**BLOCKER SEC-STG-001: inactive teacher can read an APPROVED payroll period.** A separate staging transaction created a synthetic zero-value payroll and approved-period fixture, disabled the teacher profile, switched to `authenticated` with that teacher's JWT subject, then queried the real RLS path. Result:

| Check | Expected | Actual |
|---|---|---|
| account_is_active() | false | false |
| has_role('TEACHER') | false | false |
| can_read_payroll_period(fixture) | false | **true** |
| SELECT payroll_periods for fixture | 0 rows | **1 row** |

The entire reproduction transaction ended with ROLLBACK. No financial fixture was committed. This is an authenticated-role RLS reproduction, not a service-role read, although fixture setup used a privileged isolated transaction. It proves exposure of the period row; it does not claim every payroll line is visible.

Root cause: `can_read_payroll_period` in `20260915180000_teacher_payroll_v1.sql` permits `teachers.user_id = auth.uid()` plus APPROVED/FINALIZED status without ACTIVE account/valid-role checks. `period_read` delegates to that function. Later security migrations harden search_path but do not add those predicates. The approved Security V1 summary requires active account + valid assignment + permission + relationship; this path violates that contract.

Per Master Plan absolute stop condition **“security leak occurs”**, execution stopped before Phase 2, further browser fixtures and module implementation. No remediation migration was improvised. Recommended next scoped task: harden Payroll self-read and related helpers/policies with regression tests for ACTIVE/INACTIVE, expired/revoked role and teacher identity; preserve valid SUPER_ADMIN and finalized-history rules. Existing Feedback account/parent-link residual remains unverified and must also be investigated before broad rollout.

Pending due to this stop: positive substitute-user scope, populated browser Attendance filters/actual-teacher badge, parent/student cases, remaining broad security paths. Do not label Phase 1 or the master plan PASS.

## Validation

- git diff --check: PASS.
- npm run build: PASS.
- All app/action/bootstrap tests: **103/103 PASS**.
- Local pgTAP: **33 files / 548 tests PASS**; explicitly local, not production.
- Relevant ESLint: PASS (Attendance, navigation, Payroll, Feedback, Learning Reports, Operations, authorization).
- Browser/runtime error scan: no error observed in pages visited.

## Historical reconciliation after first security stop

Ledger remains 49. Post-fixture counts: students 3, classes 2, enrollments 3, sessions 2, attendance 0. Deltas are exactly the documented synthetic operational fixtures. Tuition remains one row / 5,500,000 VND. Invoices, payments, refunds, payroll periods, teacher payrolls and cash are all zero. Inactive-profile and expired-role counts are zero, confirming test restoration and Payroll transaction rollback.

## Backup/recovery readiness

**Not ready for production restore.** This small de-identified export is a rehearsal fixture, not a full backup. No production recovery point, full backup verification or timed restore was performed. Existing cloud-migration-plan.md describes the recovery gate.

Before separately authorized production work: capture a consistent encrypted recovery point including schema/ACL/RLS/functions, business data, auth relationships, sequences and migration ledger; inventory Auth settings and Storage objects separately. Verify backup completeness and restore it into an isolated project, configure required extensions/roles/settings, then validate login, row counts and currency totals before considering it usable.

If a migration transaction fails, roll it back; previous committed migrations remain applied. If no new business writes have occurred, owner-approved restoration of the verified pre-upgrade point is possible. After new writes, preserve the failure state and prefer reviewed forward-fix; restoration requires owner-approved loss/replay handling. App rollback alone cannot undo database changes. Never drop history guards or manually mark failed migrations applied.

Recommended target for owner review: RPO 0 for the maintenance window by quiescing writes and taking a consistent recovery point; provisional RTO 60–120 minutes, **unmeasured and uncommitted** until a timed full restore proves it.

## Cleanup / Git / decision

Cleanup PASS: removed the restricted export/credentials directory, generated fixture SQL/results, isolated staging app and migration runner, and owned rehearsal logs. The staging app process was stopped. Temporary files are absent; no export or credentials entered Git. Staging synthetic accounts/operational fixtures remain in that isolated project; no remote deletion was attempted. The earlier cleanup completed before Payroll remediation. Subsequent Payroll/Feedback diagnostic temporary files were also removed. Payroll code was committed locally after its checks passed; no push. This report records both the fix and remaining failed security diagnostic.

**Production NO-GO.** Payroll and Feedback remediations and current-role staging rehearsal PASS. Historical access rollout, wider module security, full-system validation and verified backup/restore remain outstanding. No production changes or push performed at this checkpoint.
