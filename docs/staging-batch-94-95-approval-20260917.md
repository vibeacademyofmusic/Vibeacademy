# Final staging migration requiring separate approval: 94 → 95

Target: **owpfqwdrmyzcmjahehek only**. Production HOLD. Not applied.

Exact migration: `20260917100000_operational_payroll_documents.sql`.

- Purpose: audited compensation configuration and scoped payroll payslip projection.
- Dependencies: employee/teacher compensation RPCs, payroll period/earning/adjustment tables, active-account and employee/teacher self-read helpers from earlier migrations.
- Schema: nullable `teacher_compensation_rules.reason` with nonblank length constraint; new `configure_employee_compensation` and `payroll_payslip` RPCs.
- Security: both SECURITY DEFINER with fixed `public,pg_temp` search path; revoke PUBLIC/anon/service_role execution, grant authenticated. Configuration requires SUPER_ADMIN; payslip checks ACTIVE account, APPROVED/FINALIZED period, scoped finance/self-read authorization.
- Finance/data: no apply-time earning/payment mutation. Configuration RPC can create future compensation rules through existing engines; payslip is read-only. No seed/backfill.
- Risk: medium, authorization-sensitive financial RPC surface.
- Destructive: **NO**. No drop, delete, historical rewrite, or rate resolver replacement.
- Recovery: fresh restricted staging business/ledger checkpoint before apply; stop traffic to affected new RPCs on failure and prefer reviewed forward fix. Do not blindly restore shared staging or repair ledger. Restoring a checkpoint requires explicit destructive-recovery approval.
- Blocks full current-schema staging validation: **YES**, compensation UI and payslip require these RPCs.
- Validation: operational payroll/document tests, inactive/cross-scope denial, compensation reason/type validation, approved/finalized payslip only, complete compatible pgTAP, reconciliation, then full role/browser/E2E workflows.
- Expected ledger: **94 → 95**, provided fresh local/remote ledger comparison confirms no other migration.

## Exact approval wording

> Cho phép áp dụng chính xác migration 20260917100000 vào STAGING owpfqwdrmyzcmjahehek, ledger 94→95. Không áp dụng Production; không push/deploy.
