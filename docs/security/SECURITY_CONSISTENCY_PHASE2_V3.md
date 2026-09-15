# Security consistency — Phase 2 V3

2026-09-16. Local checkpoint. Production HOLD; staging replay required.

## Canonical chain audit

Every relationship/action path was reviewed against authenticated identity,
ACTIVE profile, current active role assignment, role-specific permission, scope,
and record state. Existing deny-by-default areas are not expanded into portals.

| Audience | Implemented boundary reviewed | Regression suite |
|---|---|---|
| PARENT | Active parent/link plus effective dates; related profile projection; own child's historical attendance/approved report/debt; feedback requires eligible attended session and permission | relationship_read_authorization, student_parent_history, feedback_authorization |
| STUDENT | Own student identity; active account/role; paused/graduated historical reads permitted; unrelated records denied; no raw invoice/report private notes | student_parent_history, relationship_read_authorization, feedback_authorization |
| TEACHER | Current class assignment for current student; actual session/substitute for session access; former teacher retains taught session and personally authored journal; only own APPROVED/FINALIZED payroll | teacher_historical_access, session_teacher_assignment, payroll_self_read_security, relationship_read_authorization |
| FINANCE | Same assignment supplies role, permission and branch; separate maker/checker; no access to full Admin/student workspace | finance_read_scope, financial_approval_workflows, payroll_maker_checker |
| BRANCH_ADMIN | Effective enrollment/class branch, not default branch alone; cross-branch denied; sensitive finance and payroll approval denied | branch_relationship_scope, financial_approval_workflows, payroll_maker_checker |

Student/parent raw schedules remain denied; the current bounded attendance
projection includes the student's session schedule, without other students or
staff notes. E-learning routes/permissions not implemented remain closed rather
than gaining broad student-role access. Portal UI is a later master-plan phase.

## Findings fixed

1. `has_role('SUPER_ADMIN')` previously accepted a branch-scoped assignment while
   the global permission bypass required a null branch. This could open legacy
   Admin/RLS paths. New migration `20260916120000_security_consistency_hardening`
   makes role, permission and role-specific permission helpers agree: SUPER_ADMIN
   must be global. No role assignments are changed by the migration. Legitimate
   global SUPER_ADMIN and scoped FINANCE keep their intended permissions.
2. Supabase default grants made the off-cycle view nominally writable and granted
   anonymous SELECT. Underlying RLS/table grants still prevented anonymous reads
   and authenticated writes, but the grants were inconsistent. Explicitly revoke
   them, retain authenticated SELECT only, and prevent service clients from
   forging requests/events/corrections via direct DML. Application posting remains
   authenticated RPC only. Database owner maintenance remains privileged.
3. All public/private SECURITY DEFINER routines have explicit trusted search_path.
   No private finance engine is executable by anonymous, authenticated or service
   clients. Historical source immutability and approved-report projection remain.

## Verification

- Local migration applied successfully; no production/staging mutation.
- Full pgTAP: 43 files / 858 assertions PASS (30 new consistency assertions).
- Full application/bootstrap suite: 118 PASS; build and relevant ESLint PASS.
- Browser: fake branch-scoped SUPER_ADMIN denied login; same fake account restored
  to global SUPER_ADMIN permits Admin. Phase 1 browser scope and maker/checker
  workflows remain valid; existing relationship and financial regressions PASS.
- Before/after grant audit verified, no unsafe search_path or exposed private RPC.
- No historical migrations changed. No destructive schema change or new module.

## Deployment and remaining scope

Production remains HOLD. Ship only with reviewed migration plan and staging
rehearsal; application-only deployment cannot supply the new financial schema.
Teacher off-cycle correction portal presentation belongs to the portal phase;
raw financial request snapshots are deliberately not exposed to teachers.
No e-learning permissions/routes or student/parent portal UI are invented here.
