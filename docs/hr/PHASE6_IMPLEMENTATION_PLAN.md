# Phase 6 — Employee Time Attendance V1

Status: local attendance recording validation PASS. See `PHASE6_LOCAL_VALIDATION.md`. Production HOLD. No push or staging mutation authorized by local completion.

## Approved source and scope

The current owner master execution prompt explicitly permits completing attendance recording before the late/early payroll deduction policy is decided (section 6.10). Phase 4 and Phase 5 are already complete at local commits `f288ead` and `a3392c8`; their older checkpoint figures in that prompt are superseded by actual repository evidence.

Reuse `employees`, effective-dated `employee_versions`, `organization_units`, active-account authorization and immutable audit architecture. Do not reuse student/session attendance as employee attendance.

## Implementation sequence

1. Backend schedule contract: Vietnam dates, employee version at the work date, weekday afternoon, Saturday morning and afternoon, HQ Sunday afternoon, ST/LX scheduled rest. Return distinct shift identities and scheduled minutes, not an inferred salary fraction.
2. Employee attendance evidence: one stream per employee/date/shift, immutable versions, original schedule/assignment snapshot, actual arrival/departure, late/early minutes, actor/reason. Missing evidence remains unrecorded, never automatically fabricated as worked or absent.
3. Approved leave/business-trip records: separate requester/checker, effective dates, explicit policy scope, source audit. Approved HQ-to-branch Sunday travel overrides the expectation to 14:00–18:00; 18:00–21:00 is not absence. Leave policy must be configured, with no guessed HQ quota.
4. Corrections append reviewed replacement evidence, never overwrite history. Reject stale approvals and retain original records. Prepare immutable raw CHECK_IN/CHECK_OUT event references without device integration.
5. Admin monthly view with employee/unit filters, schedule, attendance, leave/trip review and audit. Reuse existing UI building blocks and backend authorization.
6. Regression, full pgTAP/application/bootstrap, build/lint/diff, desktop/mobile browser validation, cleanup and local commit.

## Explicitly deferred decision

Do not calculate salary fractions, late/early monetary deductions or automatic monthly salary until the owner defines work-unit conversion. Scheduled minutes are evidence only. Phase 7 must not silently assume that a three-hour Saturday morning has the same weight as a seven-hour afternoon, or invent a deduction rate.

## Validation matrix

- Weekday and two Saturday shifts; HQ Sunday versus ST/LX rest.
- Approved branch trip Sunday ends at 18:00; unapproved trip has no schedule effect.
- Effective transfer and ended/inactive employee boundaries.
- Worked, paid/unpaid leave, absence, late, early leave and manual correction evidence.
- Independent approval, stale version rejection, audit immutability and inactive/unauthorized account denial.
- No payroll or student attendance mutation; future device API remains unintegrated.
