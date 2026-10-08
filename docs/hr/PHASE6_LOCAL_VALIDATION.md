# Phase 6 — Employee Time Attendance V1

Local validation on 2026-09-16. Production HOLD; no cloud migrations, push or deployment.

## Implemented recording contract

- Migration `20260916170000_employee_attendance.sql`; local migration ledger: **64**.
- `/admin/employees/attendance`: employee/month/unit selection, distinct shifts, approved attendance, requests/reviews, business trips, leave policy, immutable history.
- Monthly schedule: weekday 14–21, Saturday 08–11 and 14–21, HQ Sunday 14–21, ST/LX Sunday scheduled rest. Each row has scheduled minutes, not a monetary or salary work-unit value.
- Employee assignment is resolved at the work date. Recorded shifts retain their original schedule/assignment snapshot after later employee changes.
- Missing attendance remains unrecorded. No automatic absence, worked status or future worked evidence.
- Attendance requests and corrections require a different active SUPER_ADMIN reviewer. Original entries remain immutable; approval is idempotent and stale versions are rejected. Manual corrections link the previous entry and preserve maker, checker, reason and timestamps.
- Trips require explicit destination branch mapping and independent review. Only approved trips affect schedules; HQ branch-trip Sunday ends at 18:00. Approval revalidates mapping/assignment, rejects overlapping trips and does not rewrite existing attendance.
- Leave policies have explicit unit/group/individual scope and quota windows. Quota is recorded in minutes; excess is recorded separately as unpaid leave minutes. HQ has no invented quota. Admin must explicitly configure a zero ordinary quota for the applicable ST/LX permanent group; employee groups are not guessed from free-text names.
- Raw CHECK_IN/CHECK_OUT table includes source/device/raw-reference fields and idempotent source identity. No device integration or public ingestion write path is enabled.
- RLS, RPC role checks, active-account checks, restrictive grants and immutable audit apply independently of the UI. Initial rollout remains SUPER_ADMIN-only, consistent with Employee Master.

## Validation

| Gate | Result |
| --- | --- |
| Full pgTAP | **48 files / 1,089 PASS** |
| New employee attendance assertions | **39 PASS** |
| Application/bootstrap | **151 PASS** |
| New attendance application tests | **6 PASS** |
| Build | PASS |
| Relevant ESLint | PASS |
| Git diff check | PASS |
| Desktop 1440×900 / mobile 390×844 | PASS |

Browser evidence uses only synthetic local data:

1. `VIBE-HQ-0002` / `7509bb0a-ba4a-4243-8ef0-a04a4bb8aad1`: September calendar includes two Saturday shifts.
2. Maker submits September 1 arrival 14:15; self-approval is denied.
3. Different reviewer approves: late minutes = 15.
4. Reviewer submits corrected evidence; different checker approves. Both original and revision 2 remain in history; current result is WORKED.
5. HQ → ST trip on September 13: pending retains 14–21, approved shows 14–18 / 240 minutes.
6. Individual synthetic leave quota = 120 minutes. September 2 leave approval records 120 paid + 300 unpaid minutes, shown separately in the monthly table and detail.
7. Mobile filter works; no document horizontal overflow (tables scroll internally). Browser console errors: none.

## Cleanup / environment

- The two previously authorized synthetic local accounts are INACTIVE and banned again. Browser signed out; temporary credential/setup/cleanup files removed.
- Synthetic employee, branch `HR-BROWSER-SYNTHETIC`, ST mapping, trip, leave policy and attendance audit remain as local test evidence. These are not approved real organizational mappings or policies and must not be copied to staging/production.
- Customer credit reference remains original 1,000,000, applied 400,000, refunded 0, remaining 600,000 VND. Phase 6 writes no finance, teacher payroll or student attendance tables.
- Staging last verified: 59 migrations. Production last verified in the owner prompt: 28. Neither was accessed or modified in this phase.

## Limits and Phase 7 gate

- This closes attendance recording, not automatic payroll conversion. No salary amount, deduction rate or work-unit weight has been inferred.
- Owner decisions pending: relative work-unit weights for 3-hour and 7-hour shifts, and late/early conversion (manual approval, minute-based or configured thresholds). The current master prompt section 6.10 permits attendance completion; sections 7.2–7.3 require this decision before automatic salary calculation.
- Leave configuration windows and approved trips are append-only. Changes to already recorded schedule evidence require reviewed attendance correction; there is no silent approved-trip overwrite/cancel path.
- Current UI caps employee picker at 100, monthly request/history/policy lists at 100. Larger HR populations need searchable/paginated selection before rollout beyond that size.
- Device hardware, payroll linkage, travel expense posting and non-SUPER_ADMIN personnel access are not part of this attendance recording release.
