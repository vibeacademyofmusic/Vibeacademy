# Phase 10 — CRM implementation gate

2026-09-16. Phase 9 local PASS and committed as `0bbd4e3`.
No CRM schema or business-state transitions have been applied yet.
Production HOLD.

## Owner decision pending — conversion deferred, independent work continues

The subsequent unattended execution authorization permits independent phases to
continue while this decision is pending. It authorizes local and reviewed,
non-destructive staging work, but does not select a CRM transition policy.
Do not mark Phase 10 complete. Phase 11 inventory is independent of lead conversion.

The master lists NEW → CONTACTED → TRIAL_BOOKED → TRIAL_COMPLETED → FOLLOW_UP
→ ENROLLED → LOST, but does not define whether a trial is a prerequisite or LOST
is an alternative terminal outcome. Clarify before enforcing database edges:

1. May a lead enroll without completing a trial?
2. Is LOST limited to pre-enrollment prospects (and never an enrollment withdrawal)?

An asynchronous owner question offers optional-trial or mandatory-trial policies,
both keeping LOST separate from enrollment cancellation. Do not infer the answer
from elapsed time. Existing conversion/cancellation workflows remain unchanged.

## Safe technical design prepared

- Lead identity/contact/source/branch/program interest, staff assignment, next
  follow-up, notes and pipeline stage; no Student before actual conversion.
- Immutable stage/assignment history with actor/time and optimistic version check.
- Explicit branch-scoped permissions and ACTIVE account/role enforcement.
- Creation idempotency uses request identity, not a unique telephone number:
  siblings may share household contact details. No automatic identity merging.
- Conversion transaction locks the lead and class, checks actual class capacity,
  validates Student/Academic context with existing engines, then records the
  official enrollment and conversion metadata atomically. Rerun returns the same
  conversion. Never fabricate class/curriculum/Grade and never auto-create tuition,
  invoice, payment or cash records.
- Existing class action checks ACTIVE/PAUSED occupancy and class/student status;
  repeat those checks under database locks for conversion, not just UI checks.
- Primary Academic remains a default; conversion must preserve other programs
  and use existing assignment safeguards instead of inventing Grade progression.
- Admin list/filter/detail/follow-up and conversion UI reuse existing components;
  permission checks remain database-backed. No public self-service CRM endpoint.

## Validation plan after owner decision

Test allowed/denied transitions, lost reason, branch scope, inactive/expired
roles, staff assignment validity/history, follow-up updates, conversion rollback,
idempotency and duplicate enrollment prevention. Then full pgTAP/app/bootstrap,
build, relevant ESLint, diff/secret review and browser desktop/mobile using the
single authorized synthetic local admin. Commit only after the phase passes.
