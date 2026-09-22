# Completed staging batch: 62 → 69 — reviewed plan

Status: applied in this continuation. Eight focused files / 307 assertions PASS;
financial baseline unchanged. The approval wording below is retained historically.

Target: `owpfqwdrmyzcmjahehek` only. Production `qhznfywwrhmcwbkujclm`
remains HOLD. No push/deploy or production database operation is authorized.

Apply only after the 59→62 batch regression and reconciliation pass. All seven
file hashes match the previously reviewed manifest in
[staging upgrade preflight](staging-upgrade-preflight-20260917.md).
Keep timestamp order with the normal runner; no ledger repair or `include-all`.

| ID | Purpose | Dependency checkpoint | Apply-time data / Finance impact | Security impact |
|---|---|---|---|---|
| `20260916160000` | employee master | Ordered after ledger 62 and earlier rows in batch | Seed 3 organization units; no employee/payroll backfill | Employee identity and unit access policies |
| `20260916170000` | employee attendance | Ordered after ledger 62 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Retain existing authenticated scope; regression suite required |
| `20260916180000` | payroll scheduled minutes | Ordered after ledger 62 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Own-payroll scope or immutable/evidence financial workflow |
| `20260916181000` | payroll employee recipients | Ordered after ledger 62 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Own-payroll scope or immutable/evidence financial workflow |
| `20260916182000` | payroll evidence adjustments | Ordered after ledger 62 and earlier rows in batch | Permission/role metadata seed; no financial generation | Own-payroll scope or immutable/evidence financial workflow |
| `20260916183000` | payroll employee self read | Ordered after ledger 62 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Own-payroll scope or immutable/evidence financial workflow |
| `20260916184000` | payroll trip cost breakdown | Ordered after ledger 62 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Own-payroll scope or immutable/evidence financial workflow |

## Risk classification and dependencies

All seven are **non-destructive, additive/replacement migrations**: no table/column
removal, truncation, deletion or migration-time financial posting. Replacement of
payroll routines, views and constraints affects future operations and requires
regression coverage; “non-destructive” does not mean risk-free.

- `20260916160000`: HR identity/version/audit foundation; depends on existing
  profiles, teachers, branch authorization; seeds HQ/ST/LX organization units only.
- `20260916170000`: depends on employee foundation; schedules, trips, attendance and
  leave review history. Sensitive HR access remains scoped; no automatic payroll.
- `20260916180000`: depends on employee attendance and existing payroll approval
  engine; scheduled-minute evidence and effective compensation calculation.
- `20260916181000`: extends recipients to employee records after payroll-minute
  foundation; preserves original teacher payroll history and maker-checker flow.
- `20260916182000`: evidence/adjustment workflow and permission metadata; depends
  on extended payroll recipients. No generated earning or adjustment on apply.
- `20260916183000`: own-payroll reads depend on employee recipients and effective
  employment; ACTIVE account enforcement and approved/finalized visibility.
- `20260916184000`: trip cost breakdown depends on employee trips and extended
  payroll; no cash/payment creation.

Expected ledger: **69**, exactly seven more than the verified 62 baseline.
Reconcile tuition 5,500,000 VND, no unexpected finance rows, unchanged original
user-role assignments, and only documented metadata seeds. Run schema69-compatible
regression, scoped HR/payroll tests and catalogue checks before the next batch.

If approval tooling requires exact confirmation, use:

> Cho phép áp dụng chính xác 20260916160000, 20260916170000, 20260916180000,
> 20260916181000, 20260916182000, 20260916183000, 20260916184000 vào STAGING
> owpfqwdrmyzcmjahehek; dự kiến ledger 62→69. Không áp dụng Production.
