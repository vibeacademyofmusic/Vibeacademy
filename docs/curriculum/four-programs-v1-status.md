# Four-program authoring scaffold — PARTIAL

> Update 2026-09-28: Owner subsequently confirmed GUITAR and its linked registration/payment records were test data and explicitly requested complete removal. GUITAR was deleted in a verified local transaction, including the 9 levels/45 subjects added below. The applied counts below are historical, not current. TEST_GUITAR and the other three TEST programs remain unchanged. A restricted local backup is at `/private/tmp/vibe-guitar-removal-backup.json`. No full four-program import is claimed.

Date: 2026-09-28. Source: `/Users/macbookair/Downloads/VIBE_Curriculum_4_Programs_Codex.md`.
The separately attached Music Theory DOCX is a different specification and was not imported.

Environment: `/Users/macbookair/vibe-academy-system`, branch `feature/learning-report-v2`, HEAD `45822a4d9dd56317324f9c554df76b42f55c1199`.
Port 3000: PID 27073, matching CWD. API: `http://127.0.0.1:54321`; database container `supabase_db_vibe-academy-system`.
The browser's initial program IDs/counts matched this database.

## Applied

Reused GUITAR ID `5e1d59e5-5802-4da3-83ec-c3f6e91ff4fb`.
Added Pre and Grade 1–8 (9 levels), 45 subjects. All new rows INACTIVE; new subjects optional. No academic activation, component, lesson, course, class or progress writes.
The old GUITAR1/GUITAR2 levels remain unchanged and outside this new scaffold, including their 2 subjects and 5 components. No assumption that these legacy names mean Grade 1/2.
New sequence numbers follow the existing two levels without modifying their ordering.

| Program | Existing before: levels/subjects/components/lessons | Added | Pending |
|---|---|---|---|
| Guitar (GUITAR) | 2/2/5/0 | 9 levels, 45 subjects | Component mapping and 610 lessons |
| Piano (TEST_PIANO) | 9/36/36/360 | 0 | Demo conversion/separate tree decision and mapping |
| Drums (TEST_DRUMS) | 9/36/36/360 | 0 | Demo conversion/separate tree decision and mapping |
| Violin (TEST_VIOLIN) | 9/36/36/360 | 0 | Demo conversion/separate tree decision and mapping |
| Guitar demo (TEST_GUITAR), outside target | 9/36/36/360 | 0 | Preserved |

`guitar-scaffold-v1-applied.json` lists all 54 created IDs. No existing fields changed.
`guitar-scaffold-v1-rerun.json` records zero new rows on the second actual run.
Full target authoring manifest: 4 programs, 37 levels, 184 subjects, 2640 lesson keys. A manifest entry is not an imported lesson.

## Validation

- Dry-run transaction rolled back successfully before apply. Advisory lock and real unique constraints protect writes.
- Actual apply and rerun succeeded. No RLS/schema changes.
- Before/after counts and hashes of full rows in student_curriculum_enrollments, student_level_progress, student_subject_progress, student_component_progress and student_component_item_progress matched.
- Focused matrix/workspace tests: 12 pass, 0 fail. Changed CJS files lint clean.
- Browser: `/admin/programs`, Guitar program, and Guitar Pre rendered. Program shows 11 levels/47 subjects including legacy entries; Pre has exactly Methode Book, Technique Foundation, Aural, Sight Reading. VIBE shared cards/colors/layout retained; no UI code changed.
- Existing UI labels inactive empty subjects as “Đủ nội dung Lesson”; this label is not evidence that lessons exist. Database and visible lesson counts remain 0 for the new scaffold.
- No Lesson edit/reload acceptance is possible yet because no new Lesson has been imported. No full curriculum completion claim.

## Required mapping decisions

1. Whether to convert Piano/Drums/Violin TEST trees while keeping IDs, or preserve demo trees and create separate official trees. All three have no course/student curriculum enrollments. TEST cleanup scripts own the existing TEST codes, so silently importing official content into those trees is unsafe.
2. Whether one Core component is approved for this scaffold or an instrument-specific component/lesson distribution template is required. Existing generic Core comes from a demo seed, not an approved instrument template. Application action requires explicit component creation; no official automatic default was found.

The owner was asked both questions; dependent writes remain pending. No inferred instrument-specific pedagogical allocation was made.
