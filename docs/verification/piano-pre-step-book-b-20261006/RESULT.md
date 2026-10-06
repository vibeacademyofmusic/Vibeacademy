# Piano Pre Step — Book B, actual local application

Applied the supplied 29-page VIBE_Piano_Pre_Step_Book_B_50_Lessons.pdf to the existing official PIANO / PRE_STEP / METHODE_BOOK subject on port 3000. Source SHA-256: 01c851c2e99bcad968e4c526bf8b18777f9728c720b2622693f520708846c888.

## Actual target and changes

Port 3000: Node PID 35759, cwd /Users/macbookair/vibe-academy-system. Runtime API http://127.0.0.1:54321; Docker supabase_db_vibe-academy-system. No cloud/staging/production writes, deployment, password changes, financial actions or notifications.

Program d650ee06-2567-4694-a792-9d47722cf6af, level fd3d456f-e877-4379-8e7c-c788a9706ddd, subject a348a034-75dd-4978-82a6-032f1411a09d retained. Rename: Methode Book → My First Piano Adventure - Lesson Book B: Steps on the Staff. Exactly 8 active Units and 50 active optional Lessons; 50 syllabi. Reused all ten original draft item IDs, added 40 items. The old empty inactive LESSON_DRAFTS storage component remains preserved; no rows were deleted. Technique Foundation, Aural, Sight Reading and Piano Pre Grade/other levels unchanged.

Subject completion is MANUAL. Unit containers use the schema-supported DIRECT_ASSESSMENT rule and stay optional; lessons remain optional. No scores, exam attempts, Final Tests, PASS outcomes, student progress inserts or automatic level promotion were introduced. Existing authored content/history/video references cause import refusal rather than being overwritten.

Full lesson names, order, goals, classroom activities, homework, teacher notes and source page references extracted from all 50 Lesson entries. The four introductory/lookup pages are preserved as source_context on Lesson 01 and available under its expandable source guide. Original handover wording is part of the source document, not the current application status. Unit counts: 4,6,6,12,4,5,5,8. Source PDF pages 4–85 excluding duplicated page 49: 81 unique pages. Hush Little Baby remains one Lesson; Finger Trick 1/2, left/right Two-Wheeler, Steam Shovel/The Crane and both Twinkle variations remain separate. Unit 1–4 references explicitly say PDF source pages; printed references are stored only for Unit 5–8. No missing Music Library/certificate/audio content was invented.

## Local database execution and backup

Migration supabase/migrations/20261006003000_piano_pre_step_book_b.sql was tested in a rolled-back transaction and then applied in one targeted local transaction with the exact SQL recorded in schema_migrations. No unrelated migration batch. Five enrollment/progress tables locked/checksummed; progress_unchanged=true. Other-subject snapshots unchanged. Final rollback rerun reports zero changes.

Before-change PostgreSQL custom archive: /tmp/vibe-book-b-backup/local-before.dump (0600; enclosing directory 0700); pg_restore --list confirmed readable. No restore attempted. PostgreSQL backup is not a full Supabase recovery backup: Storage object bytes, deployment settings and external services are outside its scope.

New curriculum_lesson_syllabi table keeps content separate from the existing Piano Pre Grade guides and their validation rules. RLS read scope mirrors those existing guides: SUPER_ADMIN only. No general administrator access or write grant added. Local SQL verified unauthenticated authenticated-role reads return zero rows and authenticated INSERT privilege is false. Teacher/family access to this detailed guide is not expanded; this report does not claim teacher/family UI acceptance.

## Verification

18/18 affected isolated PostgreSQL/content/lesson CRUD regression tests passed. Tests cover exact 50-entry ordering, source-page coverage, duplicate page exclusion, 10 reused IDs, remaining 40 inserts, preserved progress, idempotence and authored-content refusal/rollback. Focused ESLint, TypeScript and git diff --check passed.

Independent actual database readback compared all 50 titles, page references and all four instructional fields exactly with the extracted source manifest; all match. Evidence: database-readback.json, local-applied.txt, local-idempotence.txt.

Safari used the existing authenticated local SUPER_ADMIN session. Actual Lesson 01 showed correct book title/Unit, source PDF 4–7, objective, classroom activity, homework and teacher note; source-context disclosure was present. Evidence: lesson-01-accessibility.txt and lesson-01-local.png. Rendered card uses the existing VIBE white surface, navy typography, restrained gold border and page breadcrumb. No screenshot of a loading/blank state is used as completion evidence.

Mobile 390px and a second end-of-book browser page have not been verified. All 50 persisted lessons were verified through actual database readback; these limitations are not represented as browser PASS. There is no remaining local import blocker. No full pilot/build/deployed acceptance is claimed.

## Where to open

http://127.0.0.1:3000/admin/academic/d650ee06-2567-4694-a792-9d47722cf6af/levels/fd3d456f-e877-4379-8e7c-c788a9706ddd/subjects/a348a034-75dd-4978-82a6-032f1411a09d

Use Chương trình học → PIANO → Pre Step → My First Piano Adventure - Lesson Book B: Steps on the Staff → Lesson. Full structured source content: lib/academic/piano-pre-step-book-b.json; repeatable import builder: scripts/piano-pre-step-book-b-sql.cjs. Preserve the local backup and do not restore it wholesale over later work.
