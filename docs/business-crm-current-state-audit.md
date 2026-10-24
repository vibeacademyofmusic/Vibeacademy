# Business / CRM current-state audit

Sprint 1. Local schema and repository migrations only. No Business tables, RPCs, or routes were added. Production was not touched.

Audit date: 2026-09-22. Authoritative objects below were read from the local database after the repository migrations, then checked against `supabase/migrations`.

## Answers

There is no CRM lead, campaign, opportunity, or instrument-customer table.

`customer_credits` and `customer_credit_uses` are a finance ledger for unapplied money. They are not a person, a lead, or a buyer.

There is no generic contact model. A person is one of: `profiles` (login), `students`, `parents`, or `teachers`.

Parent identity is `parents`. The row has `id`, optional `user_id`, `parent_code`, `occupation`, and `status` (`ACTIVE` or `INACTIVE`). It has no name, phone, or email. When `user_id` is set, the name and phone are `profiles.full_name` and `profiles.phone`. The login email is `auth.users.email`.

Student identity is `students`: `student_code` (unique), `full_name`, `date_of_birth`, `phone`, `email`, `default_branch_id`, `user_id` (unique when set), and `status` (`ACTIVE`, `INACTIVE`, `PAUSED`, `GRADUATED`, `ARCHIVED`).

The parent-student link is `student_parents` (`student_id`, `parent_id`). It stores `relationship`, `is_primary`, `can_view_finance`, `is_active`, `valid_from`, and `valid_until`. There is no `student_user_links` or `parent_profiles` table.

Instrument inventory already has a source of truth:

- `inventory_items`, `inventory_movements`, `inventory_entries` are the quantity ledger.
- `instrument_catalogue` (brand, model) extends an inventory item.
- `instrument_units` stores the serial, unique per item.
- `instrument_events.kind = 'SALE'` is the sale. It stores `sale_price`, `currency`, `warranty_until`, branch, and reason. It does not store a customer, parent, student, or invoice.

`invoice_items.item_type` is constrained to `TUITION`. `invoices` snapshot an enrollment and a student. An instrument sale cannot be linked to an invoice without changing the finance engine. This audit does not change finance.

Enrollment pause is `enrollment_pauses`: `starts_on`, `ends_on` (both required, `ends_on >= starts_on`), `reason`, and `status` `ACTIVE` or `CANCELLED`. Current, upcoming, and ended are derived. `is_enrollment_paused_on(enrollment, date)` is true only when an `ACTIVE` pause covers that date, inclusive. There is no separate expected-return column. `ends_on` is the planned return boundary. A pause approved for six months is not overdue on day 90 while `ends_on` is still in the future.

Leaving the school is not one flag:

- `students.status = 'INACTIVE'` is the student record.
- `enrollments.status` is `ACTIVE`, `COMPLETED`, or `WITHDRAWN`.
- `students.status = 'PAUSED'` exists separately from an enrollment pause and must not be treated as the same fact.

`student_retention_alerts` is an attendance follow-up, not a sales CRM. The rule is `CONSECUTIVE_ABSENCE_2`. Statuses are `NEW`, `CONTACTED`, `FOLLOW_UP`, `RESOLVED`, `LOST`, `DISMISSED`. One open alert per enrollment and rule. Events in `student_retention_events` are append-only. V1 security is `SUPER_ADMIN` until a dedicated permission exists. The empty migration `20260919115041_attendance_retention_risk_v1.sql` is already recorded locally and must stay empty. The live definition is `20260919120145_attendance_retention_risk_v1.sql`.

The permission engine is `permissions`, `role_permissions`, `user_roles` (`branch_id`, `is_active`, `valid_from`, `valid_until`), plus `account_is_active()`, `has_role()`, `has_permission(permission, branch)`, and `has_role_permission(role, permission, branch)`. `SUPER_ADMIN` is global only when `branch_id` is null. There is no `crm.*` permission. Existing roles include `SUPER_ADMIN`, `BRANCH_ADMIN`, `FINANCE`, `STAFF`, `TEACHER`, `STUDENT`, and `PARENT`. No new role is required for a later CRM grant.

Notifications are `notification_jobs`, `notification_events`, and `notification_inbox`. Channels include `EMAIL`, `ZALO`, and `IN_APP`. V1 Business must not enqueue those channels. In-app queues can be list filters first.

Branch scope helpers that already exist and should be reused: `has_permission`, `has_role_permission`, `student_belongs_to_branch`, `student_branch_permission`, `can_access_student`, and `can_read_student_history`. Business dates in the app use `Asia/Ho_Chi_Minh` through `app/admin/_lib/business-date.ts`.

Admin navigation is `navigationGroups` in `app/admin/navigation.ts`. `activeNavigationHref` highlights the longest matching href, so a later `/admin/business/crm` item will highlight itself rather than `/admin/business`.

Student creation today is `createStudent` in `app/admin/students/actions.ts`: a `SUPER_ADMIN` server action that inserts `students` directly. There is no parent-creation action and no student-creation RPC. A later conversion must not invent a second student table and must not use the service role in the browser.

## Classification

| Entity | Decision | Why |
| --- | --- | --- |
| `students`, `parents`, `student_parents`, `profiles` | REUSE | Identity. Do not copy name or phone into a parallel customer. |
| `enrollments`, `enrollment_pauses` | REUSE | Withdrawn and long-pause facts. |
| `student_retention_alerts` | DO NOT USE as the sales or reactivation case | Different rule, population, and lifecycle. Leave it on Attendance. |
| `customer_credits` | DO NOT USE | Finance balance, not a person. |
| `instrument_units`, `instrument_events` SALE | REUSE | Serial and sale price already live here. |
| `invoices`, `payments` | DO NOT USE for instrument sales in V1 | Tuition-only lines. Do not change finance behavior. |
| `notification_jobs` | DO NOT USE in V1 | Would schedule external or in-app sends. |
| `permissions` / `has_role_permission` | EXTEND later | Add atomic `crm.*` codes. Do not add a Sales role. |
| Lead, campaign, reactivation case, warranty case | CREATE later | No equivalent table exists. |

## Conflict with the master plan

The plan's `instrument_sales` table would duplicate `instrument_events` where `kind = 'SALE'`. The safe adaptation is a later attribution row that points at `instrument_events.movement_id` and at an existing `students`, `parents`, or lead id. Serial, price, and `warranty_until` stay on the instrument event.

The plan's open-ended "pause longer than 90 days" rule contradicts the pause engine. `ends_on` is required. A case is eligible only after the approved window has ended and the student has not returned.

Won-lead conversion cannot call a parent workflow that does not exist. Sprint 3 must add one authorized create path, or stop on ambiguous identity and require a human to create the parent first.
