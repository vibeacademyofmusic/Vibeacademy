# CRM reconciliation inventory — 28 September 2026

Primary: vibe-academy-system / localhost:3000 / Supabase 54321.
Reference: vibe-academy-crm-preview, preserved without edits.
Git and full tracked diffs, hashes and schema-only snapshots: /tmp/vibe-consolidation-20260928.
Main HEAD 45822a4; reference HEAD 0b0fc90. Both working trees were dirty before integration.

| Feature | CRM files | Main files | CRM migrations | Main migrations | Conflict / action |
|---|---|---|---|---|---|
| Counter / academic registration | registrations/new, actions, shell | basic new form/actions | 241900, 241930 | new 280100 | replace only create action; preserve placement and main Academic |
| CRM interest/routing | crm, registrations list | CRM workspace and access | 241920 | new 280100 + routing batch | manually combine source labels, permissions and consolidated routing |
| MoMo | integrations/momo, registration actions/detail | absent | 242000–242100 | payment batch | retain finance posting, no second ledger |
| payOS | integrations/payos, registration detail | absent | 250130,250400,252200,261430 | payment batch | retain main finance APIs; provider evidence only |
| Zalo consent/outbox | integrations/zalo, registration ZaloConnection | existing identity/outbound | 250530–252100 | notification batch | compare actual DDL; do not replay drifted history |
| Zalo recovery | system/integrations/zalo, oauth/service/recovery | basic admin read UI | 270100,270200 | notification batch | service-only credential store, no secrets/data transfer |
| Shared navigation and VIBE UI | preview nav and shells | newer business groups and shared components | n/a | n/a | main structure wins; only change CRM target |
| Academic, HR, Student, Finance, Reports | older reference variants | authoritative newer work | main-specific | unchanged | retain main; targeted regression |

## Migration drift
Reference ledger lacks 20260925090000 although consent table and 9 rows exist.
Exact current schema captured in vibe-crm-preview-schema.sql; provenance (manual SQL vs copied/rolled history) cannot be proved from catalog/ledger alone.
No ledger repair, no source migration replay on reference, no data import. Main lacks these objects and receives a new forward definition after schema review.

## Environment
Only variable names/placeholders may be added to main .env.local. No preview tokens or provider orders are imported. Main Auth remains 54321.

## Conflict decisions and final migration identities

- New forward migrations only: `20260928010000_consolidate_counter_registration.sql`, `20260928020000_consolidate_registration_payments.sql`, `20260928030000_consolidate_zalo_durable_outbox.sql`, `20260928040000_consolidation_rpc_grants.sql`, `20260928050000_preserve_main_registration_contract.sql`.
- Main's newer branch authorization, Student Operations placement RPCs, Academic, HR, finance ledger and Z1 tuition notification guards remain authoritative.
- Added target-branch authorization to registration commercial corrections; did not import reference placement/listing overrides or renewal-window overrides.
- Main manual registration originally allowed no-invoice completion; preserved that contract after regression detected the preview's global gate. New academic counter/provider flow still requires a settled invoice or verified deposit receipts. Added negative pgTAP assertion for unpaid academic registration.
- PHONE consent must be explicitly recorded. Excluded preview's automatic parent-phone consent trigger, pilot allowlist and seeded pilot row. No preview business records imported.
- Kept main Z1 outbound helper and worker, merged template labels and durable registration dispatcher separately. Main strict MAC remains; explicit signed `oa_id` supported with conflict rejection. No bootstrap bypass imported.
- Kept main CRM lifecycle, source validation, marketing and after-sales. Legacy CRM list redirects with all query values; `workspace=crm` is separate from the existing lifecycle `tab` filter.
- New counter UI allows explicit subject selection in multi-subject main levels. DB checks active curriculum/level/subject membership.
- Kept main finance URLs (`/admin/finance/payments`, `/admin/finance/invoices`); reference-only collections/A5 links were not transferred without their unrelated finance architecture.
- Public widget identifier env placeholders are blank, with no reference OA/App values copied. Callback proxy is optional, loopback-only, host allowlist empty by default, and was not started.

## Drift evidence

Source `20260925090000` objects were inspected against exact schema-only dumps captured before edits. Main had no phone-consent table or durable store; reference had 9 consent rows despite the absent migration ledger entry. Current source definitions include later changes to phone status, dispatch decisions and retry protection; therefore the original file is not a trustworthy replay of current state.

Exact frozen DDL, including functions, table columns/constraints, indexes, triggers, RLS and grants:
- `/tmp/vibe-consolidation-20260928/vibe-crm-preview-schema.sql`
- `/tmp/vibe-consolidation-20260928/vibe-academy-system-schema.sql`
- Object comparison: `/tmp/vibe-consolidation-20260928/schema-object-inventory.txt`

The catalog cannot distinguish manual SQL, a copied database or a rolled/edited ledger. Provenance is UNKNOWN; no claim of a specific origin and no ledger repair. Main uses its own five new ledger entries.

The first Zalo migration attempt exposed a syntax-slice error and Supabase's statement-by-statement application. It left five NEW functions and an empty consent table before stopping. Recovery verifies the exact existing function body before skipping creation, refuses differing definitions, and wraps the remaining migration in a transaction. Final migration applied successfully. No existing main security function was mass-replaced.

## Exact integration file inventory

Relative to the frozen working tree (not relative to HEAD, which would include unrelated work):

### Existing files edited

- `app/admin/business/crm/[id]/page.tsx`
- `app/admin/business/crm/actions.ts`
- `app/admin/business/crm/data.ts`
- `app/admin/business/crm/model.ts`
- `app/admin/business/crm/page.tsx`
- `app/admin/business/registrations/[id]/ZaloConnection.tsx`
- `app/admin/business/registrations/[id]/page.tsx`
- `app/admin/business/registrations/actions.ts`
- `app/admin/business/registrations/new/page.tsx`
- `app/admin/business/registrations/page.tsx`
- `app/admin/navigation.ts`
- `app/admin/system/integrations/zalo/page.tsx`
- `app/admin/system/integrations/zalo/view.tsx`
- `app/api/integrations/zalo/webhook/route.ts`
- `docs/local-development-workflow.md`
- `lib/integrations/zalo/outbound.ts`
- `lib/integrations/zalo/webhook.ts`
- `scripts/local-preview.cjs`
- `tests/admin-navigation.test.cjs`
- `tests/crm-operations.test.cjs`
- `tests/registration-placement.test.cjs`
- `tests/zalo-webhook-foundation.test.cjs`

### New files

- `app/admin/business/crm/CrmContent.tsx`
- `app/admin/business/registrations/[id]/PayosAwaiting.tsx`
- `app/admin/business/registrations/new/CounterForm.tsx`
- `app/admin/business/registrations/shell.tsx`
- `app/admin/business/registrations/status.ts`
- `app/admin/business/registrations/workspace.module.css`
- `app/admin/system/integrations/zalo/RegistrationRecovery.tsx`
- `app/admin/system/integrations/zalo/actions.ts`
- `app/api/integrations/momo/ipn/route.ts`
- `app/api/integrations/payos/webhook/route.ts`
- `docs/crm-consolidation-inventory.md`
- `lib/integrations/momo/signature.ts`
- `lib/integrations/payos/client.ts`
- `lib/integrations/payos/sync.ts`
- `lib/integrations/zalo/app-secret-proof.ts`
- `lib/integrations/zalo/connection.ts`
- `lib/integrations/zalo/errors.ts`
- `lib/integrations/zalo/oauth.ts`
- `lib/integrations/zalo/phone.ts`
- `lib/integrations/zalo/preview-dispatch.ts`
- `lib/integrations/zalo/readiness.ts`
- `lib/integrations/zalo/recovery-labels.ts`
- `lib/integrations/zalo/service.ts`
- `lib/integrations/zalo/widget-public.ts`
- `scripts/payos-webhook-proxy.cjs`
- `supabase/migrations/20260928010000_consolidate_counter_registration.sql`
- `supabase/migrations/20260928020000_consolidate_registration_payments.sql`
- `supabase/migrations/20260928030000_consolidate_zalo_durable_outbox.sql`
- `supabase/migrations/20260928040000_consolidation_rpc_grants.sql`
- `supabase/migrations/20260928050000_preserve_main_registration_contract.sql`
- `supabase/tests/database/registration_agreed_deposit_test.sql`
- `supabase/tests/database/registration_branch_payment_option_test.sql`
- `supabase/tests/database/registration_momo_deposit_test.sql`
- `supabase/tests/database/registration_payos_test.sql`
- `supabase/tests/database/student_code_sequence_test.sql`
- `supabase/tests/database/zalo_durable_recovery_test.sql`
- `supabase/tests/database/zalo_template_readiness_test.sql`
- `tests/crm-consolidation.test.cjs`
- `tests/momo-signature.test.mjs`
- `tests/payos-hardening.test.mjs`
- `tests/payos-registration.test.mjs`
- `tests/payos-sync.test.cjs`
- `tests/zalo-durable-database.test.cjs`
- `tests/zalo-durable-recovery.test.cjs`
- `tests/zalo-phone-payment-path.test.cjs`
- `tests/zalo-phone-registration.test.cjs`
- `tests/zalo-template-readiness.test.cjs`

Ignored local configuration: `.env.local` received required variable names with empty values only. No credentials were copied or committed.
