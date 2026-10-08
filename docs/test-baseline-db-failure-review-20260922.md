# Database baseline failure review — 2026-09-22

## Result

`expense_claim_v2_itemized_test.sql` test 9 was a stale assertion. The nine functions it named were not changed.

After the assertion was aligned with the existing trusted-path catalogue, the targeted file passed. The full local suite then passed: 76 files, 2144 tests, 0 failures. The previous baseline was 75 files and 2132 tests. The extra file is `crm_shell_access_test.sql` (12 tests). The expense file still contains the same number of assertions.

## What failed

The expense test required every public `SECURITY DEFINER` function to carry exactly `search_path=public, pg_temp`. Nine payroll functions carry `search_path=pg_catalog, pg_temp` instead.

## Classification

A and C. The test expectation was stale. The functions follow a security convention that the payroll migrations and the security catalogue already require. The functions are not misconfigured.

## The nine functions

| Function | security definer | search_path | Execute grant | Caller | Why this path | Safe to change |
| --- | --- | --- | --- | --- | --- | --- |
| `approve_payroll_retroactive_claim` | yes | `pg_catalog, pg_temp` | `authenticated` | `app/admin/hr/retroactive-pay/actions.ts` | Payroll migrations pin a catalog-only path and fail their own verify check if it is missing | No |
| `cancel_payroll_retroactive_claim` | yes | `pg_catalog, pg_temp` | `authenticated` | retroactive-pay actions | Same | No |
| `create_payroll_period` | yes | `pg_catalog, pg_temp` | `authenticated` | `app/admin/payroll/actions.ts` | `20260921145500_payroll_period_create_guard.sql` raises `PAYROLL_PERIOD_GUARD_SECURITY_VERIFY_FAILED` unless this path is set | No |
| `create_payroll_retroactive_claim` | yes | `pg_catalog, pg_temp` | `authenticated` | retroactive-pay actions | Same catalog-only convention | No |
| `guard_payroll_pending_retroactive_close` | yes | `pg_catalog, pg_temp` | none for `anon`, `authenticated`, or `service_role` | trigger `payroll_pending_retroactive_close_guard` on `payroll_periods` | Internal guard | No |
| `post_payroll_retroactive_claim` | yes | `pg_catalog, pg_temp` | `authenticated` | retroactive-pay actions | Same catalog-only convention | No |
| `retarget_payroll_retroactive_claim` | yes | `pg_catalog, pg_temp` | `authenticated` | retroactive-pay actions | Same | No |
| `submit_payroll_retroactive_claim` | yes | `pg_catalog, pg_temp` | `authenticated` | retroactive-pay actions | Same | No |
| `sync_retroactive_claim_action_cancel` | yes | `pg_catalog, pg_temp` | none for `anon`, `authenticated`, or `service_role` | trigger `payroll_retroactive_action_cancel_sync` on `payroll_period_actions_v2` | Internal guard | No |

No CRM function is in this list. A catalogue query for public security-definer functions that use neither trusted path returned no rows.

`authorization_foundation_test.sql`, `security_consistency_test.sql`, and `security_catalogue_baseline_test.sql` already accept `search_path=public, pg_temp` or `search_path=pg_catalog, pg_temp`. The expense assertion now uses that same pair. Replacing the payroll path with `public, pg_temp` would fail the payroll migration checks and would widen name resolution.

## Fix

Only `supabase/tests/database/expense_claim_v2_itemized_test.sql` changed. The nine functions were left as deployed.
