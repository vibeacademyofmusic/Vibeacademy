# Payroll V1.1 implementation plan

Owner authority: `docs/decisions/PAYROLL_V11_OWNER_DECISIONS.md`.
Production HOLD. Local implementation only; no push or deployment.

Reuse the canonical payroll periods, earnings, adjustments, maker-checker,
finalization and financial correction workflow. Extend recipient identity to
employees without fabricating teacher records for non-teaching staff.

1. Extend compensation and payroll recipient contracts for Employee Master;
   retain existing teacher payroll compatibility and immutable historical rows.
2. Calculate MONTHLY earnings from approved scheduled/attendance minutes,
   snapshot every source, reject unresolved attendance/rate coverage and zero
   required minutes rather than infer attendance or a salary.
3. Add PER_SESSION rates by teacher/branch/class type/effective date; preserve
   HOURLY and actual-teacher selection. No cancelled-session pay.
4. Add traceable explicit deductions and trip allowances through existing
   adjustment approval. No automatic late/early deduction or duplicate evidence
   deduction. Extend corrections to employee recipients in the same ledger.
5. Extend Admin UI and approved own-payroll read with active identity/role and
   employment checks; do not grant payroll administration to employees.
6. Regression, full database/application tests, build/lint, desktop/mobile,
   diff review, local commit. Continue Phase 8 only after Phase 7 PASS.

Validation is pending. The plan is not evidence of implementation or PASS.
