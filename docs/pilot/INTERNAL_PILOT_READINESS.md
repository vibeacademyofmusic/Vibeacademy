# Internal pilot package — prepared, not released

2026-09-17. **NOT READY TO START.** Production HOLD. This package defines the
controlled pilot; it does not certify unrun staging workflows or appoint people.

## Entry conditions and scope

One Owner-selected unit; 2–5 named authorized users; 7–10 working days. Owner must
name the unit, operators, independent checker, escalation contact and dates before
start. At least two distinct financial actors are required; one person must not
approve their own work. Permission mapping must follow existing roles, not new
blanket SUPER_ADMIN grants. Do not use fake validation accounts operationally.

Prerequisites: staging upgrades approved and reconciled; all role/module rehearsal
and populated E2E evidence complete; source package and mapping approved; recovery
and escalation rehearsed. No Production activity is authorized by this document.
CRM, full Theory/Aural curriculum and new Report Card are not implemented/approved
at this checkpoint. Exclude them explicitly from a narrower pilot if Owner approves
that scope; never present them as delivered.

## Roles and training

| Responsibility | Person to nominate | Training and acceptance |
|---|---|---|
| Unit operator / maker | Pending | Student, mapping, attendance, draft finance; demonstrate denied self-approval |
| Independent reviewer / checker | Pending | Source review, totals, approvals, corrections; demonstrate reject path |
| Academic/teaching operator | Pending; may share a nonconflicting role | Actual-teacher scope, journal, attendance, approved reports |
| Pilot lead / escalation owner | Pending | Freeze, severity triage, audit collection and decision log |
| Optional read-only observer | Pending | Own/linked-child portal boundaries; no shared login |

Use fake exercises before real pilot access: missing-class NEEDS_REVIEW, substitute
session, partial payment, rejected approval, finalized payroll correction, unrelated
student denied. Record attendee, date, scenario and independent observer result.
Do not record passwords or student private content in training/issue logs.

## Operator SOP

1. Confirm environment and unit. Sign in with own account; verify intended scope.
2. Start day by checking open issues, migration batch status and finance control totals.
3. Preview/validate source; resolve identity/class/curriculum/Grade mappings. Never
   fabricate relationships or earlier Academic passes. Unresolved rows stay in review.
4. Separate maker and reviewer. Recheck currency, original document and effective
   dates before approval. Record business reference and reason.
5. Import approved student units atomically; retry through idempotent workflow.
   Reconcile count, opening paid, debt and currency totals before further activity.
6. Use canonical payment/refund/payroll actions. Never directly edit posted history.
   Correct finalized payroll next OPEN period or audited off-cycle run with checker.
7. At day end, reconcile cash = effective applications + unapplied credit (accounting
   for active refunds/voids); unexplained VND difference must be zero. Review failed
   jobs and access denials, sign out, log evidence without credentials/PII.

## Working-day plan (proposed)

| Day | Activity / exit evidence |
|---|---|
| 1 | Training, individual access and scope checks; all users demonstrate denial cases |
| 2 | 10 synthetic migration rows, dry-run/review/import/rerun/reconcile |
| 3 | 20–30 supplied de-identified representative rows; mapping and control totals approved |
| 4 | One-unit batch, pause/resume/retry; count/currency differences zero |
| 5 | Tuition/invoice/payment/credit/refund with distinct maker/checker |
| 6 | Employee/actual teacher/substitute and monthly/hourly payroll through finalize/correction |
| 7 | Portals, reports, implemented assessment/manual review/regrade; access boundaries |
| 8 | Volume/latency observations and issue retest; no unsupported capacity claims |
| 9 | Recovery/escalation drill; evidence and cleanup review |
| 10 | Owner acceptance or extension; no automatic production release |

Days 8–10 may be consolidated for a seven-day plan only if gates remain evidenced.
No real emails/Zalo, bank payouts, production import or unapproved course publication.

## Issue and severity model

Issue fields: ID, timestamp, environment, unit, module, pseudonymous reference,
steps, expected/actual, severity, owner, containment, evidence link, fix commit,
retest result, reviewer, closed date. Never include tokens/passwords/raw source PII.

- S0: security leak, lost/corrupted data, unexplained financial difference. Stop
  affected operation immediately; preserve audit, revoke affected test sessions if
  needed, notify Owner/security/finance lead. Do not continue postings.
- S1: critical workflow blocked or authorization inconsistency. Pause affected
  module; independent unaffected read-only work only after pilot lead assessment.
- S2: incorrect nonfinancial display or recoverable workflow defect. Track, use only
  documented safe alternative, retest before sign-off.
- S3: cosmetic/usability defect. Log and prioritize; never relabel integrity issues.

No invented response-time SLA: nominate reachable contacts before day 1. Severity
can be raised by any tester; only the accountable reviewer closes S0/S1.

## Rollback and escalation

Freeze new work and capture exact batch/record/audit references. Pre-activity legacy
rollback must use existing reviewed rollback workflow. Once downstream activity
exists, use approved correction/reversal; no destructive deletion or finalized-line
rewrite. Schema/data recovery must target an isolated restore first; do not assume
reverting an app commit reverses database changes. Owner must approve any Production
restore/mutation separately. Failed restore or unexplained reconciliation blocks release.

## Exit

Zero unresolved S0/S1, all required scenarios evidenced, exact reconciliation,
accounts/scopes reviewed, source and learning content approvals recorded, recovery
limits accepted, issue log reviewed and Owner sign-off. Missing evidence means
NO-GO or an explicitly narrowed pilot, never implicit approval.
