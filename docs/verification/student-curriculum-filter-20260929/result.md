# Student curriculum filter — local verification

- Served PID 81249, CWD /Users/macbookair/vibe-academy-system, port 3000.
- Added curriculum filtering for active, paused, future-start and waiting lists; filters applied before LIMIT/OFFSET. Original RPCs untouched; branch permission predicates retained.
- Migration applied only to supabase_db_vibe-academy-system. No business data written.
- Read-only SQL verification: 8 groups passed (4 list/count/filter/pagination groups; 4 no-permission checks). Empty paused/future data limits positive-path coverage there.
- Browser: actual local application, Piano selected with Lọc, 8 rows became 2 Piano enrollments; waiting metric became 2; refresh retained selection.
- Rendered desktop design: existing VIBE shared filter card/buttons, navy text, gold accents. Screenshot piano-filter.png. Mobile not separately verified in this task.
- ESLint page.tsx passed.
- TypeScript has 6 errors in untouched students/actions.ts and students/movement-data.ts; no errors reported in edited page. Build not run while TypeScript fails.
- Changed files: app/admin/students/page.tsx; supabase/migrations/20260929140000_student_curriculum_filters.sql; this verification directory. Existing unrelated changes preserved; page backup in .backups/student-curriculum-filter-20260929/page.tsx.
