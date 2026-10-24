# Phase 8 — Portal local validation

2026-09-16. **PASS for implemented Portal scope. Production HOLD.**

## Delivered

- Student/Parent: authorized learner selector, multi-program academic journey,
  upcoming schedule, attendance, approved report snapshot, issued-invoice debt,
  opening receivables and unapplied customer credit. Independent academic and
  finance permissions; parent finance reads honor `can_view_finance`.
- Feedback submission delegates eligibility, respondent identity, actual teacher
  and duplicate prevention to the existing secured feedback engine.
- Teacher: actual-teaching schedule/history, current assigned classes, current
  learner academic records, permitted journals, aggregate own feedback and own
  approved payroll/off-cycle corrections. No raw approval payload exposure.
- Expired assignment retains actual completed sessions and authored journals,
  but not current learner profiles/academic data. Historical attendance masks
  current learner names. Attendance/journals remain read-only under current grants.
- Approved reports render allowlisted snapshots, never draft or internal notes.
- Linked employee payroll self-read now requires an effective ACTIVE employment
  version. Two regression assertions failed before the fix and pass after it.

## Final automated gates

| Gate | Result |
|---|---|
| Full local pgTAP | 49 files / **1213 PASS** |
| Application/bootstrap tests | **171 PASS** |
| Portal UI/action tests (included above) | **15 PASS** |
| Teacher historical scope suite (included above) | **34 PASS** |
| Build | PASS |
| Relevant ESLint | PASS |
| Diff whitespace check | PASS |

## Browser evidence

Local synthetic fixtures only. No production/staging mutation.

- Student and Parent sign-in show only own/linked student; unrelated UUID denied.
- Current Teacher opens assigned student Academic; after ending assignment the
  same URL returns not-found. Other-branch session URL returns not-found.
- Teacher history includes own completed session and actual substitute session;
  unrelated future assignment is absent. Substitute historical attendance hides
  current learner names. Completed history survives assignment termination.
- Current Teacher sees two permitted journals; former Teacher sees only their own.
- Payroll shows own 300,000 VND approved fixture, not other teacher's 900,000 VND.
  These are synthetic read fixtures, not a claim of payroll generation rehearsal.
- Student feedback submit succeeds through the existing canonical RPC.
- Student and Parent see the approved report generated/approved through canonical
  RPCs, including attendance and journal; private admin-note sentinel is absent.
- Inactive Parent cannot access linked-child report even with its existing session.
- Desktop/tablet/mobile: 1440×900, 768×1024, 390×844; DOM width has no horizontal
  overflow. Browser console errors: none observed.

Populated invoice/opening-credit and off-cycle correction correctness are covered
by pgTAP/UI tests; this browser run did not repeat their financial posting flows.
Duplicate feedback handling is covered by the canonical database tests, not a
second browser submission. No external delivery or assessment routes are claimed.
Notification/e-learning entry points arrive with their subsequent phases.

## Cleanup and migration ledger

One explicitly authorized TEACHER account and the two previously authorized
STUDENT/PARENT accounts were used. All three are banned, profiles INACTIVE and
role assignments inactive. Temporary 0600 credential/setup files were removed;
browser signed out, agent tab closed, viewport reset. Synthetic business fixtures
remain auditable; no financial history was erased. Developer admin is untouched.

Phase 8 local migrations: 20260916190000, 20260916191000, 20260916192000,
20260916193000, 20260916194000, 20260916195000, 20260916200000,
20260916201000. Local expected ledger: **77**. No reset, CLI update, staging
migration, production connection, push or deploy.
