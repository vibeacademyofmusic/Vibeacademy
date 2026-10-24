# Ca dạy & Lịch học — release notes

Status: production release of Ca dạy & Lịch học, authorized after the 12 October freeze was unlocked. Source base is `acd2792`. Apply migration `20261021013000_placement_eligibility_contract.sql` to production database `qhznfywwrhmcwbkujclm` before staff use the new workspace.

## Root cause

Waiting placement loaded `list_placement_class_options` one page at a time, then filtered that page in the browser. A suitable shift outside the page was shown as “Chưa có ca dạy phù hợp trong trang lựa chọn này.” Failed queries were read as empty lists. The confirm form also reused `desired_start_date` even when that date was already in the past.

## Migration order

Apply after the existing chain, with no reset and no RLS change:

1. `supabase/migrations/20261021013000_placement_eligibility_contract.sql`

The migration adds availability columns, two indexes, and functions. It replaces `list_waiting_placements_by_curriculum` (ordering and current grade only), `assign_student_placement`, and `change_future_student_placement`. Existing class and enrollment IDs stay in place. Historical import does not go through `assign_student_placement`.

## What staff get

One training tab, “Ca dạy & Lịch học”, with views Chờ vào ca, Danh sách ca, and Lịch tuần.

`/admin/students?tab=waiting`, `/admin/students?tab=teaching-shifts`, `/admin/students?tab=schedule`, `/admin/classes`, and `/admin/schedule` redirect to that workspace and keep branch, search, and date filters.

“Xếp ca” opens one panel. Search and confirm both use `placement_shift_decision`. A past desired date is shown separately and is not submitted as the participation date.

## Held back

This release does not change Zalo, payments, finance permissions, or unrelated staff authorization. The waiting-student path on manage.vibe.edu.vn is confirmed only after the migration and this build are both live.
