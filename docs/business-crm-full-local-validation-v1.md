# Business CRM full local validation

Date: 2026-09-22. Local database only. No remote project was contacted.

## Reset

`npx supabase db reset --local --yes` completed on branch `feature/learning-report-v2`. Migrations applied from baseline through `20260922250000_crm_shell_access_v1.sql`, then `supabase/seed.sql`. The labeled `UAT SMOKE LOCAL` rows from the super-admin walkthrough were removed with the rest of the local database.

## Database

Full suite after the reset: 76 files, 2144 tests, 0 failures.

Security files included in that pass:

- `crm_security_test.sql`: direct CRM writes denied, event history immutable, cross-branch create and update denied, disabled user denied, null-branch role denied
- `crm_pipeline_test.sql` and `crm_conversion_test.sql`: stale version denied, conversion review idempotent, forged owner denied
- `crm_reactivation_test.sql`: refresh is idempotent, a future pause opens no case
- `instrument_customer_care_test.sql`: the sale event remains the stock authority, the serial is not copied, and acquisition cost stays on the commercial record
- `crm_shell_access_test.sql`: branch admin A cannot view branch B
- `crm_campaign_report_test.sql`: cohort and activity reconciliation

## Application and build

`node --test tests/*.cjs`: 523 pass, 0 fail.

`npm run build`: pass. The business routes are in the build output: `/admin/business`, `/admin/business/crm`, `/admin/business/crm/[id]`, `/admin/business/campaigns`, `/admin/business/reports`, `/admin/business/reactivation`, `/admin/business/instrument-customers`.

## Result

Local release validation: PASS. This does not authorize a staging or production migration.
