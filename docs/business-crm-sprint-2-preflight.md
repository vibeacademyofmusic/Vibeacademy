# Sprint 2 CRM preflight

Read-only. No mutation. Local database, 2026-09-22.

## Helpers present

All are `SECURITY DEFINER` with `search_path=public, pg_temp`:

- `account_is_active()`
- `has_role(role_code text)`
- `has_permission(p_permission text, p_branch uuid)`
- `has_role_permission(p_role text, p_permission text, p_branch uuid)`
- `student_belongs_to_branch(p_student uuid, p_branch uuid)`
- `student_branch_permission(p_student uuid, p_permission text)`

`has_permission` treats a global `SUPER_ADMIN` (`user_roles.branch_id` is null) as authorized for any existing permission code. Every other role must have an active, unexpired `user_roles` row whose `branch_id` is null or equal to the requested branch, plus a `role_permissions` row.

CRM will not use the null-branch allowance for non-super-admin roles. A branch user must have `user_roles.branch_id` equal to the lead branch.

## Tables

`profiles` has `id`, `full_name`, `phone`, `status`. `user_roles` has `user_id`, `role_id`, `branch_id`, `is_active`, `valid_from`, `valid_until`. `branches` requires `code` and `name`; timezone defaults to `Asia/Ho_Chi_Minh`.

Roles already include `SUPER_ADMIN` and `BRANCH_ADMIN`. No new role is required.

`permissions` contains zero `crm.*` codes.

`to_regclass('public.crm_leads')`, `to_regclass('public.crm_lead_events')`, and `create_crm_lead` are absent.

## Decision

The existing permission engine can express Sprint 2 branch scope. Migration may proceed. Students, parents, profiles, retention alerts, customer credits, instrument events, and invoices are not altered.
