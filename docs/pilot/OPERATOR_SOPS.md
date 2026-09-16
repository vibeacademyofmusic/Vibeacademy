# One-unit pilot operator handbook — draft for training

2026-09-17. **PILOT NOT READY.** Use only on approved staging until entry gates pass.
No production access, posting, deployment or import is authorized by this handbook.
Choose one existing unit with a nominated reviewer; Cần Thơ is a candidate because
staging has a representative tuition baseline, not an approved launch decision.

## Account matrix and login

| Pilot person | Minimum workflow | Access verification before training |
|---|---|---|
| Owner / administrator | Admin setup and review | Named individual; global access intentional and approved |
| Admin / Academic | Unit students, classes, attendance | Existing supported route/permission; cross-unit denied |
| Teacher | Actual sessions, own journal and allowed history | Current/substitute/former boundaries and own payroll |
| Finance / Payroll maker | Draft/request monetary work | Own request approval denied |
| Independent checker | Approved financial scope | Distinct from maker; check totals and reason |

Use 2–5 named people, combining only nonconflicting responsibilities. Do not create
new permissions or grant SUPER_ADMIN to work around a route restriction. Some Admin
routes are currently super-admin-only; delegation must be proven, not assumed.

Get the approved staging application URL from the pilot lead; none is certified in
this package. Confirm it connects to staging `owpfqwdrmyzcmjahehek`. Sign in with
own account, confirm displayed identity/unit, open only assigned routes, then sign
out. Never reuse temporary rehearsal passwords, share accounts, paste credentials
into issues or use the Production URL for training. If login fails, contact the
pilot lead; do not repeatedly reset or elevate an account without review.

## Student workflow SOP

Open Students; check for existing identity before creation. Confirm unit, class,
curriculum and starting Grade; unresolved mapping stays in migration review. Add
an official enrollment only through the supported action. Preview tuition and
verify plan/currency/start/end/discount before save. Check invoice linkage and lock
state; no direct edits to invoiced pricing. Schedule a valid session/teacher. After
attendance/journal/feedback, prepare and independently approve learning report;
verify the allowed snapshot in the linked student's/parent's view. Finance records
actual receipt and confirms the debt update through canonical actions. Capture
business references and zero-difference reconciliation, not screenshots of private
student details in public logs.

## Teacher and Student Attendance SOP

Use Teacher Portal for sessions actually taught. Confirm Vietnam date/time and
actual teacher; substitute assignment takes priority over class primary teacher.
Mark only the authorized session's students, then review before submission. Do not
mark a cancelled session completed to create pay. Write own journal; another
teacher's journal or unrelated/current student access must be denied when outside
scope. Former teachers retain only permitted historical sessions/authored journals.
Escalate assignment mistakes through the assignment workflow before financial use.

## Employee Attendance SOP

Confirm employee identity, unit and effective assignment. Record attendance or
leave/business trip through available validated actions with dates/reason. Check
approved evidence and payable-minute breakdown; do not infer actual clock-in from
scheduled teaching duration. Payroll V1 may use scheduled minutes where explicitly
shown. Late evidence must follow documented adjustment/correction, not editing a
finalized financial line. Employee self-read must disclose only their own records.

## Finance SOP

Verify student, obligation, currency, amount and source reference. Preview tuition;
issue invoice only when valid and not already represented by an opening obligation.
Record actual payment once and allocate explicitly. Opening settlement is historical,
not new cash/revenue. Request refund/void/credit application with reason; a distinct
checker verifies source and amount before approval. Refuse self-approval, stale
requests and cross-unit use. Downward correction may create customer credit, never
negative receivable or extra revenue. Do not silently allocate credit elsewhere.
Reconcile receipt, effective applications, unapplied credit and active refunds/voids
by currency. Any unexplained VND difference is SEV-1; stop affected postings.

## Payroll SOP

Verify employee/teacher, effective compensation rule and period. MONTHLY coverage
must meet the implemented coverage requirement; a gap blocks generation. HOURLY
uses the actual teacher, substitute override first, excluding cancelled sessions.
Generate, inspect original earning lines/minutes/rates, and record adjustments with
reason without overwriting earnings. Regeneration must not duplicate lines and is
not allowed on approved/finalized payroll. Independent checker reviews/approves,
then finalize. Verify immutability and correct own-payroll visibility. After finalize,
use linked correction in next OPEN period; urgent audited off-cycle correction still
requires maker/checker. No bank payout, tax inference or feedback-rating salary rule.

## Migration SOP

Receive the approved de-identified source and signed control totals outside Git.
Record hash/unit/source identity; upload supported CSV format, dry-run and resolve
NEEDS_REVIEW. No fabricated class, dates, historical PASS or historical cash.
Independent identity/academic/finance reviews precede atomic per-student import.
Process READY rows in supported chunks, stop on failure, rerun idempotently. Compare
input/valid/review/duplicate/rejected/imported/failed counts and opening/debt/credit
by currency. Sign off only exact reconciliation. Before downstream activity use
reviewed rollback; afterward use correction/reversal and preserve history.

## Daily checklist and training record

Before work: environment/unit/account correct; incidents reviewed; no SEV-1 open;
source/control totals ready; checker available. During work: capture reference and
reason, confirm effective dates, avoid duplicate requests. End of day: reconcile,
review failed jobs/access denials, log issues, sign out, confirm temporary credentials
are removed by the responsible operator. Never delete audit rows to make counts fit.

Training log fields: participant, role/unit, date, instructor, scenario, expected
result, observed result, evidence reference, corrective action and reviewer sign-off.
Each person demonstrates happy path plus denial/retry/correction relevant to role.

## Issue log and escalation

| ID | Time | Env/unit | Module/reference | Expected/actual | Severity | Owner | Containment | Retest/reviewer | Status |
|---|---|---|---|---|---|---|---|---|---|
| Not yet opened | — | — | — | — | — | — | — | — | — |

This empty template means no pilot has run, not that pilot defects are zero.

- **SEV-1:** data loss/leak, wrong financial posting, critical permission bypass,
  unrecoverable workflow. Immediately stop affected work, preserve audit, alert
  Owner and security/finance lead. Revoke affected test sessions when appropriate.
- **SEV-2:** major workflow blocker. Pause affected workflow; assign responsible
  owner, reproduce safely and retest with an independent observer.
- **SEV-3:** wording/UX/minor issue. Log and prioritize without disguising integrity
  defects as cosmetic issues.

Nominate real escalation contacts and availability before day 1. No response SLA is
invented here. Security/finance failures cannot be waived by an operator to continue.

Rollback: freeze activity, preserve references and control totals, classify whether
business activity occurred. Use supported rollback only when allowed; otherwise
reviewed correction/reversal. App rollback is not DB rollback. Production restore
requires separate Owner authorization. Resume only after independent evidence that
access boundaries and financial reconciliation are correct.
