# Production pilot authorization

Date: 7 October 2026

Role: `OPERATIONS_LEAD` (Điều hành vận hành)

This role is for:

- nguyenthitramy@vibe.edu.vn
- thachthihuynh@vibe.edu.vn

They are not `SUPER_ADMIN`. A global `SUPER_ADMIN` bypasses permission checks, so that role cannot carry this restriction.

The migration grants `OPERATIONS_LEAD` with `branch_id` null, which covers every branch. If either account currently has `SUPER_ADMIN`, that assignment is removed. No other user's role rows are updated.

## Effective access

Operational permissions granted from the current catalog, by module:

| Module | Permissions |
| --- | ---: |
| academic | 2 |
| attendance | 4 |
| branches | 1 |
| classes | 2 |
| crm | 11 |
| feedback | 2 |
| finance | 24 |
| inventory | 2 |
| learning_journals | 1 |
| learning_reports | 3 |
| migration | 8 |
| payroll | 6 |
| registration | 6 |
| students | 4 |
| tuition | 4 |

The only withheld catalog permission is `finance.report.view`.

Operational finance remains available: tuition, invoices, payment records, receivables, refunds, expenses, and payroll, under the existing business rules. Learning reports are academic reports, not financial reports.

Denied, in the database and in the application:

- Financial management report RPC `get_financial_management_report`
- Consolidated and branch revenue, profit, and cash-flow summary views
- Dashboard money summaries and the financial report link
- Direct URLs `/admin/finance` and `/documents/finance/management-report`
- Report export and PDF for that management report

`can_view_financial_reports` stays false for this role even if `finance.report.view` is later attached to it. Branch finance staff who are not operations leads keep their existing branch report access. The unrestricted owner keeps consolidated reports.

They cannot remove the restriction. Role, permission, and assignment tables reject changes from this role. Account status remains owner-only. Zalo credential storage stays owner-only. There is no impersonation path.

## Tests

Local database, after the migration:

- `operations_lead_financial_reports_test.sql`: 19 passed
- `financial_management_report_v1_test.sql`, `authorization_foundation_test.sql`, `finance_engine_v1_test.sql`, `revenue_forecast_v1_test.sql`: 134 passed
- `tests/admin-navigation.test.cjs`: 18 passed

The operations-lead test checked: not super admin, operational gate open, both consolidated and branch report RPCs denied, summary and forecast views empty, payment creation still reaches business validation, self-grant of `SUPER_ADMIN` fails, and the owner plus a third assignment stay unchanged.

## Production application

The grant is in `supabase/migrations/20261007120000_operations_lead_financial_report_restriction.sql`. It was applied to the local database only.

It has not been applied to the production database. The live application still admits administrators with `SUPER_ADMIN`. Applying the user change first would remove that role from these two accounts before the application knows `OPERATIONS_LEAD`. Deploy this application and the migration together.
