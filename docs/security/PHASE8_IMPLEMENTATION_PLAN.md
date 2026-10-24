# Phase 8 — relationship-scoped portals

Production remains HOLD. Work and validation are local; no push or deploy.

## Checkpoint

Phase 7 commits: `c3d5990`, `c9dd30d`. Baseline: 49 database files / 1145
assertions, 156 application/bootstrap tests, build and relevant ESLint PASS.

## Delivery order

1. Close the confirmed historical finance permission gap: a linked parent with
   `can_view_finance = false` must not read debt. Attendance/report access remains
   governed by its own permissions. Add a regression before exposing portal UI.
2. Add bounded, explicitly projected student/parent reads. Preserve active account,
   role, branch and relationship validity at the database boundary. Historical
   access must work after a class enrollment ends. Never expose internal notes,
   raw report drafts, unrelated children or unrestricted finance tables.
3. Build the student/parent portal: identity selector, read-only multi-program
   journey, upcoming schedule, attendance, approved reports, permitted balances
   and feedback. Reuse the existing Academic progress calculation and financial
   engines. Do not duplicate business mutations.
4. Extend teacher operations with assigned schedule, actually taught history,
   permitted student context, own journals, feedback summary and own approved
   payroll. An expired class assignment never grants current student access.
5. Validate relationship/role permutations, pagination and safe field projections;
   then desktop/mobile/tablet workflows, full database/application/bootstrap tests,
   build, relevant ESLint and diff check. Review and commit locally only after PASS.

## Dependencies

Notification delivery, assessments and e-learning belong to later master-plan
phases. Do not create placeholder routes or claim those features are available in
this checkpoint. Integrate their portal entry points when their engines exist.

## Validation evidence so far

The new parent-finance regression failed before the fix (one invoice was returned
instead of zero). Migration `20260916190000` fixes the shared historical-read
predicate without changing finance calculations. Focused history tests: 59 PASS.
This is not yet a Phase 8 completion report.
