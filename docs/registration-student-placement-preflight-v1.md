# Registration, student, and class placement preflight

Local inspection only. No production or staging change.

## What already exists

| Concept | Source | Decision |
| --- | --- | --- |
| Student | `public.students` | REUSE. One student row. No second student type. |
| Parent | `public.parents` (`parent_code`, `status`; no name column) | REUSE. Contact name stays on the application. |
| Student-parent link | `public.student_parents` unique `(student_id, parent_id)` | REUSE. |
| CRM won lead | `public.crm_leads` plus `review_crm_lead_conversion` | REUSE. Won does not create a student or an enrollment. |
| Class enrollment | `public.enrollments.class_id` is required | REUSE at class assignment. It cannot represent “not yet placed”. |
| Class, teacher, schedule | `classes`, `class_teachers`, `schedules` | REUSE. Placement does not create a second scheduler. |
| Future start | `enrollments.started_at` | REUSE. Current vs waiting is derived with the Vietnam date. |
| Invoice payment | `invoices` and `invoice_receivables.outstanding_balance` | REUSE. No payment-confirmed flag is stored as a guess. |
| Registration application | none | CREATE |
| Placement queue | none. `waiting_students` does not exist | CREATE `student_placement_cases` |
| Students page | `/admin/students` lists `students` rows | EXTEND with two derived tabs |

## Current student rule

An enrollment is current when `status = 'ACTIVE'`, `started_at` is on or before the Vietnam date, and `ended_at` is null or on/after that date. The class must be `ACTIVE`. Creating a student, winning a lead, or paying an invoice does not satisfy this rule.

## Waiting rule

`enrollments` cannot be inserted without a class. The open placement case is the waiting record. It leaves the waiting list when a class is assigned and `scheduled_start_date` is on or before the Vietnam date. A future start stays on the waiting list with the badge “Đã xếp lớp – chờ bắt đầu”.

The same student may have a current enrollment for one program and an open placement for another.
