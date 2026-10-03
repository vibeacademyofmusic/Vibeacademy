# Lesson feedback operational validation

Local only. Production remains on hold. This pass extends the existing feedback engine. It does not replace eligibility, relationships, low-rating detection, or resolution history.

## Student entry

Student portal `/my-learning` → selected student → Điểm danh → completed session the student attended (`PRESENT` or `LATE`, session `COMPLETED`, end time reached) → Phản hồi buổi học.

The database still requires an active student account, `feedback.submit` on the session branch, and one submission per respondent for that session. The form hides the action only as a convenience. Duplicate and unauthorized submissions are rejected by `submit_lesson_feedback`.

## Parent entry

The same portal lists linked children. A parent opens a child, then the same completed-session action. The RPC allows the parent only when the parent account is `ACTIVE` and the `student_parents` link is active and inside `valid_from` / `valid_until`. An unrelated, inactive, or expired link is denied.

## Reasons

Rating 4–5:

- `TEACHER_CLEAR_GUIDANCE` — Giảng viên hướng dẫn dễ hiểu
- `CONTENT_APPROPRIATE` — Nội dung buổi học phù hợp
- `TEACHER_SUPPORTIVE` — Giảng viên tận tâm và hỗ trợ tốt
- `SESSION_ON_TIME` — Buổi học diễn ra đúng giờ, đúng kế hoạch
- `OVERALL_SATISFIED` — Tôi hài lòng với buổi học hôm nay

Rating 1–2:

- `CONTENT_UNCLEAR` — Nội dung buổi học chưa dễ hiểu
- `PACE_INAPPROPRIATE` — Tiến độ buổi học chưa phù hợp
- `TEACHER_SUPPORT_INSUFFICIENT` — Tôi chưa nhận được đủ sự hỗ trợ từ giảng viên
- `SESSION_TIMING_ISSUE` — Buổi học chưa diễn ra đúng giờ hoặc đúng kế hoạch
- `CONTENT_BELOW_EXPECTATION` — Nội dung buổi học chưa đúng kỳ vọng

Rating 3, and a form that has not chosen a rating yet, shows no predefined set. Comment stays optional. Selected codes are stored in `lesson_feedback_reasons` with a Vietnamese label snapshot. Unsupported or mixed-band codes are rejected before insert. Reason rows cannot be updated or deleted.

## Admin workflow

Page: `/admin/feedback`.

Statuses stay canonical:

- `NORMAL` — Mới
- `NEEDS_REVIEW` — Cần xử lý, set by the database when rating is 1 or 2
- `IN_REVIEW` — Đang xử lý, including reopen
- `RESOLVED` — Đã xử lý

Actions remain `resolve_lesson_feedback`: move to `IN_REVIEW` or `RESOLVED` with a required note, or reopen a resolved row to `IN_REVIEW`. There is no separate `REOPENED` status. Original rating, comment, and reasons stay unchanged. History stays in `lesson_feedback_events`.

Default view is Cần xử lý, limited to the recent 30 days unless a date range is chosen. KPIs are counted on the server for that window and the same branch, teacher, and date scope: total, average, needs attention (`NEEDS_REVIEW` + `IN_REVIEW`), resolved. Low-rating rate and resolution rate appear on Tổng quan chất lượng, with averages by teacher and branch. Those aggregates do not include comments or respondent names.

## Privacy and roles

- Raw feedback select policy remains `SUPER_ADMIN`.
- Resolve remains `SUPER_ADMIN`. Branch admin and finance are not granted a new path.
- Teacher portal reads `teacher_feedback_summary` only: month, response count, and average. Respondent name, reason labels, comments, and resolution notes are not rendered there.

## Performance

The list stays paginated at 25 rows and does not select the comment. The attention query uses the existing `lesson_feedback_review_idx` (status, session start, id). Branch and teacher filters already have `lesson_feedback_list_idx` and `lesson_feedback_teacher_idx`. Reason lookup is one query by `feedback_id`, with `lesson_feedback_reasons_feedback_idx`. No additional index was added. KPI rows are read on the server for the selected date window, not calculated in the browser.

## Browser

Synthetic local accounts on the running dev server, desktop and a 390px viewport. No page-wide horizontal overflow on the portal form or the admin queue.

- Student: completed session → 5 stars → `TEACHER_CLEAR_GUIDANCE` and `CONTENT_APPROPRIATE` → comment stored → “Cảm ơn bạn đã gửi phản hồi.” Database row is `NORMAL`.
- Parent of the linked child: 2 stars → `PACE_INAPPROPRIATE` and `TEACHER_SUPPORT_INSUFFICIENT` → comment stored → `NEEDS_REVIEW`.
- Admin queue default view showed that row. Detail showed the original reasons and comment. Resolve with a note set `RESOLVED` and left the rating and comment unchanged. Reopen set `IN_REVIEW` and kept both history rows. The item returned to Cần xử lý.
- Teacher summary showed `2026-09 — 2 phản hồi · Trung bình 3.5/5` and did not show the comment, reasons, or parent name.
- A branch admin for the other branch was redirected from the feedback detail with “Bạn không có quyền truy cập”.

## Tests

- `tests/lesson-feedback.test.cjs` — 10 passed
- `tests/family-portal.test.cjs` — feedback cases passed. One unrelated payroll self-read case in the same file fails because `/admin/_components/vibe.ts` is missing; that import is outside this module.
- `node --test tests/*.cjs` — 513 tests, 490 passed, 23 failed. The failures are in leave, employee, expense, finance dashboard, payslip, and document suites already present in the dirty tree, not in `tests/lesson-feedback.test.cjs`.
- `supabase/tests/database/lesson_feedback_test.sql` — 33 passed
- `supabase/tests/database/feedback_authorization_test.sql` — 20 passed
- `supabase/tests/database/session_teacher_assignment_test.sql` — 14 passed
- `supabase/tests/database/security_catalogue_baseline_test.sql` — 16 passed
- `npx supabase test db` — 68 files, 1970 tests, 1 failed. Failure is `expense_claim_v2_itemized_test.sql` test 9, because existing payroll retroactive functions use `search_path=pg_catalog, pg_temp`. `submit_lesson_feedback` uses `search_path=public, pg_temp`.
- Webpack `next build --webpack` passed after the feedback type fixes: 62 routes.
- ESLint on the feedback files passed.
- `git diff --check` on the feedback files passed.

## Limitations

Reopen returns the row to `IN_REVIEW` and appends history. Rating 3 has no reason chips. After the thank-you message, a later visit still shows the feedback action; a second submit is rejected as “Bạn đã gửi phản hồi cho buổi học này.” Students cannot read the feedback table, so the portal does not query prior reasons. Teacher raw comments stay hidden. Resolve stays limited to `SUPER_ADMIN`. Production was not migrated or deployed.
