# Student Operations UX validation

Local only. Production remains HOLD. No Production push or migration apply.

Migration created for local/staging readiness:

- `20260924120000_student_operations_ux_v1.sql`

Report ID before staging application: **20260924120000**.

## Shared design language

Students, Learning Reports, and Lesson Feedback now share the VIBE ops primitives in `app/admin/_components/vibe/operations.tsx`:

- `AppPage` / `PageHeader`
- `OperationsFilterBar` (GET → URL query params)
- `OpsTabs`
- `OpsMetricLink` KPI cards
- `OpsStatusBadge` / `opsStatusTone`
- `EmptyState`, `DataTable` / `vibe-table`, `vibe-button` hierarchy

Visual language stays light neutral surfaces, subtle borders, navy primary actions, semantic status colors only.

## Shared filter behavior

Filters run server-side and persist in the URL (refresh / back / forward safe). Branch selection scopes Class options where the page loads class lists by `branch_id`. Teacher and Grade filters use human-readable names/codes, not UUID-first labels.

## Students redesign

- Header: **Học viên**
- KPIs from canonical sources only:
  - Học viên đang hoạt động → `count_current_student_enrollments`
  - Needs Attention → waiting placement summary
  - Học viên mới / Đang bảo lưu → shown as `—` (no inventing unsupported KPI engines)
- Filters: Chi nhánh, Lớp, Giáo viên, Search (+ waiting status tabs)
- Table links student name to detail when permitted
- Server pagination via RPC `p_limit` / `p_offset`

## Learning Report redesign

Operational dashboard (not a basic list):

- KPI cards: Cần xử lý, Bản nháp, Chờ duyệt, Đã duyệt, Quá hạn (head counts on `learning_report_list`)
- **Cần tạo báo cáo** shows `—` — no canonical report-schedule engine yet (documented limitation)
- Tabs: Cần xử lý (default), Tất cả, Đã duyệt, Quá hạn
- Filters: Branch, Class, Teacher text, Grade, Curriculum, Type (MONTHLY / END_OF_COURSE), Status, Month, Student search
- Actions by state: Xem / Tiếp tục soạn / Duyệt / In
- Detail draft/review layout uses the seven-section structure (Overview → Progress → Assessment → Attendance → Teacher Evaluation → Development Plan → Academic Status)
- Approved path remains immutable snapshot + print document

## Feedback redesign

- Same ops chrome and KPI cards (Tổng / Điểm TB / Cần xử lý / Đã xử lý)
- Tabs: Cần xử lý, Tất cả, Tổng quan chất lượng
- **Class filter** added (server-side via enrollment ids for the selected class, bounded to 200)
- Empty states match the acceptance copy

## Performance findings

- Reports KPIs use `count: exact, head: true` — no full payload load for cards
- Feedback KPIs use head counts; quality aggregates still page server-side within the selected date window (comments never selected on list)
- Students list uses RPC pagination (max 100 per call)
- Indexes added only where justified:
  - `learning_reports_status_period_idx`
  - `learning_reports_type_status_idx`
  - `lesson_feedback_enrollment_idx`
- Enriched `learning_report_list` exposes class/grade/teacher/curriculum for filter/display without N+1 lookups on the list page

## Authorization

No security rule changes. Existing SUPER_ADMIN finance/admin client gates and RLS/RPC permissions remain. Feedback raw read/resolve stays SUPER_ADMIN. Report teacher/academic/student/parent scopes unchanged in engines.

## Browser results

Desktop and 390px responsive checks rely on shared `vibe-*` CSS (`vibe-metrics` auto-fit, `vibe-filter` wrap, `vibe-table-scroll`). Manual browser PASS should be confirmed on local preview after migration apply.

## Test totals (focused)

Command:

```bash
node --test tests/student-operations-ux.test.cjs tests/learning-reports.test.cjs tests/lesson-feedback.test.cjs
```

Result for this pass: **46 pass / 0 fail** (do not reuse older totals).

Full pgTAP: **84 files, 2530 tests, PASS**.

Webpack build (`next build --webpack`, scripts skipped due to local :3000 listener): **PASS**.

ESLint on touched Student Ops files: **PASS**.

`git diff --check`: **PASS**.

## Known limitations

1. **Cần tạo báo cáo** KPI is unavailable until a report-schedule / due engine exists.
2. Students KPIs for “Học viên mới” and “Đang bảo lưu” are not fabricated; engines do not expose those counts on the current list contract.
3. Feedback Class filter resolves through enrollments (bounded). Historical class renames may diverge from `context_snapshot.class_name`.
4. Teacher filter on Reports is text match on snapshot teacher names (no separate teacher_id on the list view).
5. Assessment / Development Plan sections present snapshot Academic + teacher_summary fields; they do not invent a separate assessment ledger inside the report engine.
