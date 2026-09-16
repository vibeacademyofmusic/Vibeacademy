# Employee Attendance / Leave UX separation — local validation

2026-09-17. **Targeted separation PASS within the existing workflow limits below.**
Production HOLD; no staging/production migration, push or deployment.

## Problem and final responsibilities

The old Attendance page combined shift operations, paid/unpaid leave requests and
entitlement configuration. It exposed policy scope/date/quota fields beside daily
attendance and loaded policy data even when unused.

- `/admin/employees/attendance`: employee/month/unit filters, scheduled/actual times,
  approved current states, monthly evidence summary, operational requests/reviews,
  business trips and immutable correction history. Paid/unpaid leave are displayed
  as approved results; their submission controls are absent. A contextual link leads
  to the selected shift's dedicated leave page. No entitlement form or policy query.
- `/admin/employees/leave-requests`: selected employee/month/unit, affected whole
  shift and scheduled minutes, paid/unpaid request, reason, maker/time, independent
  approval/rejection with checker/reason/time, and historical leave outcomes.
  Requests are filtered by canonical leave statuses before the 100-row limit.
- `/admin/employees/leave-policies`: existing unit/group/individual scope, explicit
  effective dates and minutes, reason and creator audit. Existing immutable policy
  windows remain intact; overlapping policy changes are not silently rewritten.
  Employee code/name replaces UUID as the visible individual identifier.

The two dedicated routes appear under NHÂN SỰ. Existing routes remain unchanged and
all navigation links retain `prefetch={false}`. No HR-wide redesign.

## Schema, workflow and authorization reuse

**No migration created.** Reused employee versions/directory, organization units,
`employee_schedule`, `employee_attendance_requests`, `employee_attendance_reviews`,
`employee_attendance_entries`, invoker current view, leave policies and trip records.
`request_employee_attendance` and `review_employee_attendance` remain the one request
and review engine; no duplicate leave table/status system. The absence of a review
is displayed as Chờ duyệt; APPROVED/REJECTED remain existing canonical decisions.
`configure_employee_leave` remains the configuration RPC.

Server actions retain SUPER_ADMIN checks, route submission to the appropriate screen,
reject paid/unpaid statuses from the attendance form and reject operational states
from the leave form. The database still enforces independent review, stale revision,
quota, schedule, history, active account and all existing access restrictions. No
RLS/grant changes or new employee self-service permission. Direct RPC callers retain
the same authorized canonical workflow; UI separation is not the security boundary.

## Payroll compatibility

No Payroll implementation, schema, schedule rule or salary policy changed. Display
summary reads only current approved attendance, never request rows or old revisions.
It labels payable minutes as evidence-backed and shows incomplete-shift count; it
is not an approved payroll amount. Payroll's private evidence function remains
canonical and refuses incomplete periods. Late/early states preserve scheduled
payable minutes; deduction remains an explicit financial adjustment.

Browser fixture: `VIBE-HQ-0004 — HR UX Synthetic Leave`, one fake employee. Individual
September allowance 210 minutes. Approved Sep 14 PM PAID_LEAVE produced 210 paid +
210 unpaid; Sep 15 PM UNPAID_LEAVE produced 0 paid + 420 unpaid. Sep 16 request was
rejected and produced no attendance. A read-only call to the unchanged canonical
Payroll evidence function for Sep 14–15 returned **840 required / 210 payable /
630 unpaid**, matching UI evidence exactly. No payroll period/earning/adjustment or
financial posting was created for this browser fixture. Existing finalized payroll
immutability remains covered by the full regression suite; no finalized row edited.

## Browser evidence

- Desktop 1440×1000: selected employee and month, policy creation on separate route,
  paid/unpaid submissions, maker self-approval refused, independent checker approval.
- Pending request left Attendance payable at 0. Approved paid/unpaid outcomes and
  audit history appeared; operational request list did not mix leave requests.
- Mobile 390×844: independent rejection, separate policy form, attendance filters,
  summary and horizontally scrollable tables usable. All three document widths
  equal 390; desktop width 1440. No page-wide overflow. Console errors: none.
- Fixed two discovered display defects locally: raw audit timestamps now use Vietnam
  date/time formatting; absent actual arrival/departure show missing evidence rather
  than a fabricated 1970 time. Shared Finance formatting helpers were not changed.
- Two reused synthetic localhost reviewers were explicitly authorized by Owner after
  initial automatic review blocked activation under the restore-only authorization.
  Both now banned/INACTIVE, SUPER_ADMIN assignments disabled; browser signed out,
  test tab closed, viewport reset and credential file deleted. Audited fake HR data
  remains local as authorized; no real employee/account was changed.

## Regression coverage map

| Required invariant | Evidence |
|---|---|
| No policy editor on Attendance; separate policy capability | Render/loader/action tests + browser |
| Approved paid/unpaid; pending/rejected not payable | Employee attendance pgTAP + browser + canonical evidence check |
| Existing quota and excess handling | Employee attendance pgTAP, 210/210 browser fixture |
| Other employee/protected data denied | RLS read denials in employee attendance suite |
| Unit/branch permissions not broadened | Added branch-admin policy/read denials; existing scoped payroll suites |
| Inactive account/employment | Existing employee master/attendance/payroll suites |
| Saturday AM/PM and ST/LX/HQ Sunday | Existing attendance/scheduled-minute assertions unchanged |
| HQ approved-trip Sunday override | Existing attendance assertions unchanged |
| Payroll minutes unchanged; no late/early auto deduction | Summary unit test + canonical SQL and full payroll suite |
| No duplicate leave; audit/current history preserved | Existing repeated approval/revision/quota tests + current-view loader |
| Finalized payroll unchanged | Existing payroll/financial approval immutability regressions |
| No new anonymous access | Added explicit leave-policy/request privilege assertions + security catalogue suite |

Final gates: **59 pgTAP files / 1,543 assertions**, **281 application/bootstrap tests**,
Webpack build, repository-wide ESLint and diff check. The build uses
`npm run build -- --webpack`; default Turbopack has the previously documented local
port-permission restriction and is not claimed as newly passing here.

## Known limits

- Existing engine allows retrospective whole-shift evidence, not future leave or
  partial-shift requests. The leave page states this. Expanding those capabilities
  would require a separate business/schema decision and is outside this refactor.
- HR mutations remain SUPER_ADMIN-only. This does not implement employee self-service
  or delegated branch HR access, and it does not replace RLS with UI filtering.
- Existing selector limit 100 employees; requests/policies/history show their stated
  bounded lists. Broad pagination/search is not introduced. A month/unit filter on
  schedule is an operational filter, not a new permission boundary.
- Monthly summary includes scheduled future shifts as required minutes, so an
  unfinished month can have incomplete evidence. It never marks them worked/absent.
- Historical audit rows are preserved; a superseded approved leave links users to
  history instead of falsely presenting it as the current attendance result.

Return to pre-production closure after this local commit. Staging batch approval
and all earlier NO-GO conditions remain unresolved; this refactor does not authorize
cloud changes or convert the production gate to GO.
