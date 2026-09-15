# Phase 5 — Employee Master V1

Local engineering validation, 2026-09-16. Production HOLD; no push/deploy or cloud database changes.

## Model

- Migration `20260916160000_employee_master.sql`; local ledger 63 migrations.
- Canonical units HQ, ST, LX. Branch mapping starts empty and requires an explicit administrator action with reason; no guessed branch relationships.
- Employee code is allocated atomically per home unit. Home unit, code and hire date are immutable. Transfer does not change identity.
- Optional unique links to existing profiles and teachers. No auth users or access roles are provisioned. A teacher with a user link must match the selected profile.
- Employment versions hold name, group, unit, status, pay type, operational role and effective date. Ending employment records the effective end date. Current assignment uses Vietnam date; future changes remain future.
- Append-only history plus actor/reason/before/after audit. Optimistic version check and row locking reject stale changes. Past versions cannot be rewritten; same-date corrections append a new version.
- SUPER_ADMIN with an active account only. RLS, restricted grants and server RPC authorization apply independently of the UI. Operational role is metadata, never an authorization grant.

## Validation

- Build PASS; route `/admin/employees` included.
- Full application/bootstrap: 145 PASS (5 new Employee Master tests).
- Full pgTAP: 47 files / 1,050 PASS (34 new Employee Master assertions).
- Relevant ESLint and `git diff --check`: PASS.
- Browser: create synthetic employee `VIBE-HQ-0001`, transfer HQ → ST while retaining code/home unit, schedule LX in 2099 without changing current ST assignment, view all versions and audit. PASS.
- Desktop 1440×900 and mobile 390×844: no document horizontal overflow; tables scroll within their containers. Browser console errors: none.

## Boundaries and next phase

- One synthetic local employee and its audit remain as test evidence. No real employee data was imported.
- Temporary local reviewer account is INACTIVE and banned again; temporary credential and setup/cleanup files were removed after browser sign-out.
- Profile/teacher links are optional and validated; the administrator must identify the correct existing record. No inference from similar names.
- Employee groups are administrator-supplied metadata; no guessed group taxonomy or compensation rate.
- Phase 5 does not change teacher compensation rules, payroll generation, attendance or account privileges.
- Next: Employee Time Attendance V1. Owner confirmation is pending for shift work-unit weights and the late/early-leave conversion policy before calculating payable units. No guessed fractional payroll deductions.
- Staging remains at its last verified 59 migrations; production schema is behind local. This commit is not deployable to production without separate schema approval.
