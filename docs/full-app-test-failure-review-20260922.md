# Application test failure review — 2026-09-22

## Result

The baseline was 518 tests, 495 pass, 23 fail. After the fixes below, `node --test tests/*.cjs` is 523 pass, 0 fail. The count changed because four obsolete finance-page assertions were replaced by three current loader assertions, one navigation assertion was added, and `tests/admin-shell-access.test.cjs` added five tests. No valid test was deleted to hide a failure.

## Failures

| Failure | Class | What was true | Fix |
| --- | --- | --- | --- |
| Family, finance, payslip, and invoice tests opened `app/admin/_components/vibe.ts` or `vibe.tsx` | MOVED/RENAMED SOURCE | The module now lives at `app/admin/_components/vibe/index.tsx`, with `interactive.tsx` and `Context.tsx`. There is no `vibe.tsx`. | Test loaders resolve a directory `index.tsx` before a missing file. The old file was not recreated. |
| `NEEDS_REVIEW page displays raw source` | MOVED/RENAMED SOURCE | `tests/legacy-migration.test.cjs` had the same missing-file loader. | Same resolver. |
| Attendance loader `qrRows.filter is not a function`, and the approved-leave render that then showed a load error | MISSING TEST FIXTURE | `get_employee_attendance_qr_verified_entries` was not mocked. The harness returns a UUID string for an unknown RPC. | The attendance tests return an empty array for that RPC. Production code was not changed. |
| Expense file: page must not contain `Chứng từ` | STALE TEST | The page shows a stored evidence count in a `Chứng từ` column. It does not upload a file. | The test forbids `type="file"` and requires `evidenceCount`. |
| Expense file: category suggestions, draft editing, owner review, payment evidence | MOVED/RENAMED SOURCE | Those controls moved to `SelfServiceView.tsx`. | The assertions read that file. |
| Expense file: `placeholder` forbidden | STALE TEST | The only match is the search box hint `placeholder="Tên, mã nhân viên, mục đích..."`. | The test allows that one hint and still forbids `mock` and `demo`. |
| Employee creation expected `create_employee` | STALE TEST | The action calls `create_employee_with_private_profile` and still does not send `employee_code`. | The assertion uses the current RPC and keeps the forged-code check. |
| Finance document deny, anonymous, and not-found | Cascade of the missing `vibe.tsx` loader | After the loader resolved, these three assertions passed without a document change. | Loader only. |
| Payslip mismatch showed a JSON `DebugBlock` | REAL REGRESSION | A mismatch, RPC error, or missing total rendered internal JSON, including database error text. | The block now renders `Không tải được phiếu lương.` and does not print the payload. |
| Approved payslip expected `50.00%` | STALE TEST | The current document shows the snapshot rate, amount, and line kind. It does not render that ratio, and it still does not read live compensation. | The assertion checks the snapshot fields the page renders. |
| Finance overview empty state, isolated query failure, five-table query shape, and currency ledger | STALE TEST | `/admin/finance` now loads `get_financial_management_report` through the control tower. The old cash-summary tables are not queried by that page. | The page tests pass `searchParams`, expect the safe report error, and require the branch select to be `id, name, code` with no `*`. Currency helper tests in the same file still pass. |

Business CRM application tests were already passing and stayed passing.
