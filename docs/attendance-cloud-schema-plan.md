# Attendance cloud schema diagnosis and deployment hold

Read-only audit: linked project `qhznfywwrhmcwbkujclm`, migration ledger through `20260914170000`. Public schema dump confirms `session_occurrences` and `attendance_records` exist, but `session_actual_teachers`, `session_teacher_assignments`, and `session_teacher_snapshots` do not. Attendance uses `session_actual_teachers`; this schema cannot satisfy that query. The missing view is defined by `20260915170000_session_teacher_assignment_v1.sql`.

Vercel CLI/auth/log access was unavailable. The deployed app uses server-side Supabase configuration, which could not be confirmed from public bundles. Confirm NEXT_PUBLIC_SUPABASE_URL points to the linked project before treating the linked-schema diagnosis as the independently verified Vercel root cause. Do not infer a different project configuration from successful login alone.

No production migrations applied. Re-deploying this code improves diagnostics and navigation, but cannot supply a missing view. No fallback fabricates actual-teacher data from primary assignments.

## Missing ledger entries, in timestamp order

- `20260914201223_future_academic_start_scheduling.sql`
- `20260915050000_edit_academic_program_start_date.sql`
- `20260915060000_pause_tuition_effective_end.sql`
- `20260915070000_invoice_engine_v1.sql`
- `20260915080000_payment_engine_v1.sql`
- `20260915090000_debt_engine_v1.sql`
- `20260915100000_lock_tuition_discount_after_invoice.sql`
- `20260915110000_refund_engine_v1.sql`
- `20260915120000_finance_engine_v1.sql`
- `20260915130000_revenue_forecast_v1.sql`
- `20260915140000_tuition_operations_rpc.sql`
- `20260915141000_tuition_reminder_engine_v1.sql`
- `20260915150000_learning_reports_v1.sql`
- `20260915160000_lesson_feedback_v1.sql`
- `20260915170000_session_teacher_assignment_v1.sql`
- `20260915180000_teacher_payroll_v1.sql`
- `20260915181000_payroll_history_guards.sql`
- `20260915190000_security_rpc_surface.sql`
- `20260915191000_authorization_foundation.sql`
- `20260915192000_security_unused_grants.sql`
- `20260915200000_branch_relationship_scope.sql`

## Safe plan requiring separate owner approval

1. Confirm deployment environment/project reference and actual failing source error code (new server log records source and code only).
2. Back up production and rehearse the pending chain against a private restored copy. Review existing data, constraints, and backfills, especially invoices, session teacher snapshots and payroll.
3. Verify all active administrators have ACTIVE profiles before authorization migrations. Audit existing BRANCH_ADMIN/TEACHER/PARENT/STUDENT assignments before the Phase 2 permission mappings open scoped access.
4. Review the complete pending migration chain, not only the view DDL: the session-teacher migration also updates feedback/report-related objects. Prepare a migration execution manifest and owner-approved maintenance/rollback plan. No timestamp rewriting or automatic ledger repair.
5. Only after separate production approval, apply the reviewed sequence, verify schema cache/grants and run read-only deployment smoke checks. Investigate any failure before continuing; do not mark unapplied migrations as applied.

The Cần Thơ prerequisite `20260909100000` is present in the observed remote ledger; this audit does not assume anything about prior repair/deployment actions. No new migration is needed just to recreate the already-versioned view.
