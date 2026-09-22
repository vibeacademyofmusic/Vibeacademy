# Repository cleanup — Business V1

Reviewed again on 2026-09-22. Nothing in this list was deleted. Migration history was not rewritten.

## KEEP

- `supabase/migrations/20260919115041_attendance_retention_risk_v1.sql` is zero bytes and is already in local migration history. The live retention migration is `20260919120145_attendance_retention_risk_v1.sql`.
- `supabase/migrations/20260910201008_fix_academic_level_start_date_timezone.sql` is zero bytes and is already in history.
- `scripts/crm-sprint-2-rehearsal.sql`.
- Business routes under `app/admin/business`.
- `supabase/migrations/20260922250000_crm_shell_access_v1.sql`, the business-shell admission function.

## REVIEW

These are local copies or design snapshots outside the CRM closure. Deleting them could discard unrelated work.

- Root SQL copies: `staff_foundation_v1.sql`, `staff_compensation_rpc_v1.sql`, `employee_expense_claims_v1.sql`. The applied copies are under `supabase/migrations`.
- `*.bak`, `*.backup`, and `*.before-*` files under payroll, compensation, finance, HR, and payslip documents. Twenty files were present on this pass.
- `.env.local.auth-repair-1790022354813.bak`. Do not commit it. This audit did not open it.

## DELETE

None.

## ARCHIVE

None.

No token file was added by this closure. The local admin password used for UAT was not written into the repository.
