# Phase 7 — Payroll V1.1 local validation

2026-09-16. Local validation PASS. Production HOLD; no push/deploy.
Owner authority: `../decisions/PAYROLL_V11_OWNER_DECISIONS.md`.

## Implementation

The existing payroll ledger, period transitions, financial approvals and
post-finalization corrections are extended, not replaced. Non-teaching employees
have an `employee_id` recipient in `teacher_payrolls`; no fabricated teacher is
created. Existing teacher IDs/URLs and HOURLY earnings remain compatible.

New migrations:

- `20260916180000_payroll_scheduled_minutes.sql`
- `20260916181000_payroll_employee_recipients.sql`
- `20260916182000_payroll_evidence_adjustments.sql`
- `20260916183000_payroll_employee_self_read.sql`
- `20260916184000_payroll_trip_cost_breakdown.sql`

MONTHLY uses approved scheduled minutes and attendance. Required zero is a review
error, not a division by zero or guessed salary. Missing/unapproved required
attendance blocks generation. Valid paid-leave minutes remain payable; unpaid
leave/absence do not. Late/early retain full payable scheduled minutes and their
original evidence. Saturday shifts remain independent; ST/LX rest adds zero;
approved HQ Sunday trips use 240 minutes. Monetary rounding retains the existing
two-decimal convention. Each monthly line freezes its ordered schedule/attendance
sources, rule, required/payable/unpaid minutes and calculation version.

MONTHLY rules must cover the full period. Existing monthly teachers must first
have a real Employee Master link and reviewed attendance; there is no legacy
flat-salary fallback. Explicit unit-to-branch mapping is required. Cross-branch
monthly assignment currently stops for review rather than guessing allocation.
Generation uses configured active compensation recipients; Admin must configure
eligible staff before preparing a period.

PER_SESSION uses actual completed teaching, branch, class type and effective
rate. A substitute receives that session; the primary does not. Cancelled
sessions are excluded. The compatible TEACHING line family is retained, with
PER_SESSION/HOURLY distinguished by payroll type and frozen calculation metadata.
Hourly duration remains scheduled duration, not clock-in evidence.

Explicit late/early deductions require the exact payable attendance snapshot.
A unique employee/date/shift guard prevents duplicate deductions, including across
revisions/periods. Absence already reducing base cannot be deducted through that
path. Bonus/correction remain separate adjustments. Trip allowance links approved
employee travel; optional itemization records allowance/transport/lodging exactly.
Amounts and details remain immutable; even privileged inserts cannot add a cost
breakdown to finalized payroll. Reversal/correction uses the existing audited
financial correction mechanism, not rewriting the original adjustment.

Existing maker-checker and emergency override controls are retained. Employee
recipient matching now survives next-period and off-cycle corrections.

`/my-payroll` is read-only and shows only own APPROVED/FINALIZED payroll. ACTIVE
account, active permission/role scope and active employment are checked. Teacher
self-read remains supported; a linked inactive employee cannot bypass through
teacher identity. STAFF login routes here. Administrative payroll access is not
granted by the new self-read permission.

## Tests

- Full pgTAP: **49 files / 1,145 tests PASS**.
- Application/bootstrap: **156 tests PASS** (Payroll UI/action: **18 PASS**).
- Build: PASS.
- Relevant ESLint: PASS.
- `git diff --check`: PASS.
- No db reset: existing local fixtures/history were preserved.

New scheduled-minute/payroll tests cover minute proportions, Saturday, ST/LX
rest, paid/unpaid leave, absence, accurate late/early evidence without automatic
salary reduction, zero/missing evidence, monthly generation, repeat generation,
explicit deduction/double-deduction guard, maker-checker, finalization,
next-period/off-cycle correction, itemized travel, idempotency, own/inactive and
cross-branch cost visibility. Existing teacher payroll assertions remain and
receive an approved attendance fixture for the new monthly policy; PER_SESSION
assertions were added without removing HOURLY checks.

## Browser evidence (local synthetic data only)

Desktop 1440×900 and mobile 390×844:

1. Created monthly rule through UI for VIBE-HQ-0003, synthetic employee.
2. August: 13,740 required / 13,320 payable minutes; 420 absent minutes.
   Monthly base 10,000,000 × ratio = **9,694,323.14 VND**.
3. Explicit late deduction -100,000 and approved-trip allowance +200,000;
   total **9,794,323.14 VND**.
4. Maker self-approval rejected; independent checker approved and finalized.
   Finalized UI hides mutation forms and preserves calculation evidence.
5. Own-payroll page shows that finalized payroll. Mobile horizontal page overflow
   was found and fixed with a bounded full-width container; final page width 390.
6. A synthetic 90-minute completed substitute session receives **300,000 VND**
   with PER_SESSION, not 450,000; primary has no earning for that session.
7. July full-work monthly payroll is **10,000,000 VND**. Itemized trip form saved
   100,000 allowance + 200,000 transport + 300,000 lodging = **600,000 VND**.
   The July period remains GENERATED test evidence, not an approved payment.
8. Browser console errors: none in the tested tab. Tables scroll internally on
   mobile without widening the page. No cash/bank payout occurred.

All three synthetic payroll totals reconcile to earning lines plus adjustments;
VND difference is exactly **0.00** for each.

August payroll period: `0f008001-0c0a-4e61-9222-b1cf989a3950`.
July payroll period: `e1d1c55c-3c7e-4cf9-822c-1eb969791d8e`.
Employee: `c89d7b3c-dd53-4a5c-be6e-450546a1a2c5`.
Substitute session: `76b70000-0000-4000-8000-000000000007`.

## Safety and environment

Local ledger: **69**, latest `20260916184000`.
Staging `owpfqwdrmyzcmjahehek`: read-only ledger inspected during this phase,
**59**, latest `20260916120000`. The ten later local migrations are absent there.
No staging migration was applied. Production was not contacted or mutated; its
last documented ledger count (28) is not a new verification.

Push remains BLOCKED: this UI depends on schema absent from staging and the last
known production contract. Vercel auto-deploy makes pushing main unsafe.

Automatic approval review initially rejected the cost-breakdown migration,
requesting clearer scope/ownership checks. Its policy was made explicit (ACTIVE
account, scoped Finance/admin or approved own payroll), linked to master section
7.8, re-reviewed and allowed. RLS regression tests passed. No bypass was used.

Temporary credentials were local-only mode 0600. Both previously authorized fake
admin accounts were logged out, banned and set INACTIVE; credentials and setup
scripts were removed. HQ mapping was restored to its prior NULL via audited RPC.
The prior Phase 6 ST test mapping was not changed. Synthetic immutable history is
retained; it must never be copied as production business data.

## Limits

No bank payout, tax/social-insurance calculation, feedback-based salary,
automatic lateness formula or clock-in device integration. Preparation remains
SUPER_ADMIN; existing scoped Finance review/finalization permissions are retained.
Rate/employee pickers are bounded; no large-organization performance claim is
made. Existing organization-unit mapping must be explicitly configured by Admin.
Cross-branch monthly allocation requires review. An unknown rate/attendance must
be resolved, not bypassed. Finalized originals remain locked.
