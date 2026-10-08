# Business / CRM security map V1

Local migrations through `20260922240000_business_command_center_v1.sql` add the permissions below. No new role is created.

`SUPER_ADMIN` is global only when `user_roles.branch_id` is null. `crm_can(permission, branch)` allows that global super admin, or an active non-super role whose `user_roles.branch_id` equals the target branch and whose role has the permission. A null branch on `BRANCH_ADMIN` does not grant access. `has_permission` is not used for CRM branch decisions.

## Permissions granted to BRANCH_ADMIN

- `crm.view`
- `crm.lead.create`
- `crm.lead.update`
- `crm.lead.assign`
- `crm.lead.convert`
- `crm.campaign.view`
- `crm.campaign.manage`
- `crm.reactivation.view`
- `crm.reactivation.manage`
- `instrument_customer.view`
- `instrument_customer.manage`

`FINANCE`, `TEACHER`, `STUDENT`, `PARENT`, and `STAFF` do not receive these codes. The lead owner is an attribute and does not grant visibility.

## Writes

Authenticated users have select, not insert, update, or delete, on the CRM, campaign, reactivation, and instrument-customer tables. Direct writes raise a domain error when the table owner bypasses grants, and `permission denied` for `authenticated`.

Lead, campaign, reactivation, warranty, and follow-up changes go through `SECURITY DEFINER` functions with `search_path = public, pg_temp`. Each function checks `auth.uid()`, an active profile, the permission, and the branch. A transaction-local write flag is cleared before the function returns. Event and follow-up history reject update and delete.

Organization-wide campaigns have a null branch and can be created or edited only by a super admin. A branch user may attach an active organization campaign to a lead in their own branch.

Instrument sale rows stay readable through their existing super-admin policies. Branch care uses `list_instrument_customer_care`, which returns serial, sale price, and warranty from the sale and does not return acquisition cost.

## Admin shell

`app/admin/layout.tsx` still redirects anyone who is not `SUPER_ADMIN`. Database branch scope is enforced even for that shell. See `docs/admin-shell-role-gate-v1.md`.
