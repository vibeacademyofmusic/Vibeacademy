# Student placement operational UAT V1

Local only. Production and staging were not used.

## State model

A learner is scheduled when `student_placement_cases.status` is `SCHEDULED`. That row points at one `enrollments` row, a class, and `scheduled_start_date`.

`assign_student_placement` is the write that creates the enrollment. It inserts one `ACTIVE` enrollment and links it from the placement case and the registration application.

Once placed, these records exist:

- the original registration, including payment state
- the student and parent created at registration completion
- one enrollment
- the placement case and its `CLASS_ASSIGNED` event

Attendance, tuition terms, pauses, makeup credits, lesson feedback, learning reports, access grants, retention alerts, reactivation cases, and an academic-program link can hang off that enrollment. None of those are created by placement itself.

Changing the placement is safe only while the Vietnam business date is still before `enrollments.started_at`, and while none of those downstream records exist. On that date, or after it, the screen says “Đã bắt đầu học — cần quy trình chuyển lớp”. A later Student Class Transfer Workflow has to consider past attendance, future sessions, the teacher, makeup credits, learning journals, academic progress, tuition, and reporting history. This release does not transfer a learner who has started.

## Who can do what

`/admin/students` is the operational list. `/admin/students/[id]` stays on the existing super-admin shell.

`student_ops_may_enter()` admits an active super admin, or an active user with `student_placement.view` on a real branch. `student_placement.manage` is required to assign, change, or cancel. No new permission or role was added.

A `BRANCH_ADMIN` also has `crm.view`, so login still opens `/admin/business`. Học viên is the next item and opens the operational list. Finance, HR, and payroll are not in that menu.

## Before-start correction

`change_future_student_placement` updates the same enrollment’s class and start date in one transaction. It does not delete the enrollment and insert another. The placement version, actor, old class, new class, and a 1–2000 character reason are stored on `PLACEMENT_CHANGED`.

The new start must stay after the Vietnam business date. The target class must be in the same branch, still open, compatible with `registration_applications.course_id` when that course is set, and have a free seat. Seat count is `classes.capacity` minus `ACTIVE` and `PAUSED` enrollments, excluding the enrollment being moved. A full class is omitted from the dropdown.

## Cancellation

`cancel_future_student_placement` is allowed only before the Vietnam start date, and only when the enrollment has no learning or finance history.

The enrollment becomes `WITHDRAWN` with `ended_at` equal to its start. It is not deleted. The placement returns to `UNASSIGNED`, so the learner stays on Chờ sắp lớp. The registration and student remain. `linked_enrollment_id` is cleared. The reason is stored on `PLACEMENT_CANCELLED`.

The unique key on `(student_id, class_id)` now applies only to `ACTIVE` and `PAUSED` enrollments, so a later assignment can use the same class without deleting the withdrawn row.

## Branch security

| Surface | Result |
| --- | --- |
| Waiting and current rows | Branch A does not see branch B |
| Search | Searching the other branch’s learner returns no rows |
| KPI | A forged branch id returns zeros |
| Page size | Limit and offset stay inside the caller’s branches |
| Class dropdown | Only the caller’s branch, and a full class is omitted |
| Assign, change, cancel | A missing placement and another branch’s placement both return `PLACEMENT_UNAUTHORIZED` |
| Forged class | A missing class and another branch’s class both return `PLACEMENT_CLASS_DENIED` |

## Browser UAT

Signed in as a local branch admin on 22 Sep 2026, Vietnam date `2026-09-22`.

- Login opened `/admin/business`. The menu contained Học viên and did not contain finance, HR, or payroll.
- `/admin/students` showed only branch A. Current contained UAT Ops Today, with “Đã bắt đầu học — cần quy trình chuyển lớp” and no correction buttons.
- Waiting showed Tổng chờ 2, Chưa xếp lớp 1, Đã xếp lớp – chờ bắt đầu 1. UAT Ops Other and Lop B1 were absent.
- Search plus a forged branch id showed zeros and “Không có hồ sơ chờ sắp lớp.”
- Xếp lớp placed UAT Ops Open on Lop A2 starting 2026-10-15. The learner stayed in waiting.
- Đổi lớp moved UAT Ops Future from Lop A1 to Lop A2. The database kept one active enrollment and recorded the reason.
- Hủy xếp lớp returned UAT Ops Open to Chưa xếp lớp. The enrollment was `WITHDRAWN`, not deleted. The registration and student remained.
- `/admin/students/[id]`, `/admin/finance`, `/admin/hr`, and `/admin/payroll` each returned to login with “Bạn không có quyền truy cập”.
- After `student_placement.manage` was removed locally, the same admin could still read the lists and saw “Chỉ xem”. The assign, change, and cancel buttons were gone. The permission was restored afterward.
- A local super admin saw Open, Future, and Other together. Current search showed only UAT Ops Today.

No application error overlay appeared on these screens.

## Tests

`student_ops_shell_test.sql`: 78 assertions, including the Vietnam date, change, cancel, capacity, audit, and branch isolation.

`registration_placement.test.cjs`: the two tabs, Vietnamese labels, and the before-start actions.

`npx tsc --noEmit`: pass.

`npm run build`: pass.

Full `npx supabase test db`: 79 files, 2381 tests, 0 failures.
