# Piano Pre Grade — Repertoire 2A and 2B, local application 2026-10-06

Read all 30 pages of each supplied VIBE syllabus and imported both as separate new subjects under the existing official PIANO / PRE / Pre Grade level. User's explicit request for two new subjects takes precedence over the PDFs' older handover text proposing reuse/rename of one Repertoire identity.

## Source interpretation and complete content

2A: Piano Adventures - Level 2A - Lesson Book (2nd Edition), Nancy Faber và Randall Faber. Four Level 1 review lessons, seven Units; counts including review = 4,6,6,3,5,7,4,15. Last four Challenge lessons remain in Unit 7; no invented Unit 8. Printed-page coverage 4–63, scan references 6–65. In an Old Castle retains student Primo / teacher Secondo distinction. Shared-page Ice Cream/More Ice Cream, right/left Old Man, introduction/piece and Challenge groups retain distinct scopes.

2B: Piano Adventures - Level 2B - Lesson Book (2nd Edition), same authors. Two Level 2A review lessons, ten Units; counts including review = 2,4,2,4,5,6,4,2,4,5,12. Last six Challenge lessons stay in Unit 10. Printed pages 4–71, scan references 6–73. The Eighth Rest and Pumpkin Boogie share scan page 44 but retain distinct scopes. Long Ultimate Scale Warm-up titles preserve both wrapped lines. No imported Theory/Technique/Performance/Sightreading companion-book content, fabricated audio, certificate/Final Test or automatic PASS/promotion.

Each of 100 lessons includes exact source title, order, Unit, scope, objectives, classroom activities, homework, teacher notes, printed and scan-page references, and its actual VIBE syllabus page (6–30). Five introduction/structure/lookup pages per PDF retained as source_context on the first lesson. Handover statements such as “not yet imported” remain historical source text, not current execution status.

Extraction cross-checks every title and both reference page ranges against the independent lookup tables on syllabus pages 3–5. Rendered PDF structure and split-scope pages visually inspected. The supplied PDFs are VIBE teaching syllabi, not the underlying 68/76-page score scans. Those original score scans were not supplied or independently reviewed in this run; reference mappings and pedagogic content come from the supplied syllabi. No missing score/music bytes were fabricated.

SHA-256 2A: 370fa0c776ba1a336ccb47f44b29d9a973865e03a0561ec609b366ff2379976f.
SHA-256 2B: a39a716dda54fde53549580c4e75889d4bca016be5810368d2f4fe21c108e997.

## Actual database result and preservation

Verified port 3000 PID 35759 cwd /Users/macbookair/vibe-academy-system, runtime API http://127.0.0.1:54321, PostgreSQL local container supabase_db_vibe-academy-system. No cloud/staging/production writes or deployment, credential changes, payment actions or messages.

Existing level b403c8a4-a7ce-406c-b0ab-8db151595701 retained. Created:
- REPERTOIRE_2A: 91d86d3f-324c-4155-a645-d3c51725ceb0, 50 active lessons, eight containers = review plus seven Units.
- REPERTOIRE_2B: dd5f98ca-b8e4-46f6-946c-4a0b914611aa, 50 active lessons, eleven containers = review plus ten Units.

Old REPERTOIRE subject 6a8d1765-4bf6-4b1b-918c-a39d7a6b004d changed ACTIVE → INACTIVE. All child IDs, ten old lessons, required flags, completion rules, and two student_subject_progress rows remain intact. No transfer of old progress to new books. New books appended in 2A → 2B order without reordering other subjects. Other subjects/levels remain unchanged, including Methode Book Level 1 and Pre Step Book B.

New subjects are optional and MANUAL; Unit containers use existing supported optional DIRECT_ASSESSMENT, and lessons are optional. This adds the requested instructional content without inventing compulsory completion or assessment policy. Existing level/other-subject rules and all permissions unchanged.

Syllabus schema extended additively with content_scope and syllabus_pdf_page, preserving Book B content and its RLS. Anonymous-session authenticated-role reads show zero Repertoire syllabi; authenticated INSERT privilege remains false. Detailed syllabus access remains existing SUPER_ADMIN scope; no teacher/family authorization expansion.

Migration 20261006021000_piano_pre_grade_repertoire_books applied only locally and recorded with exact SQL in supabase_migrations.schema_migrations. Trial transaction rolled back before commit. Actual writes: two subjects, nineteen Unit/review containers, one hundred lessons, one hundred syllabi, one retired subject. All five enrollment/progress tables locked and checksummed unchanged; old children and other subjects compared unchanged. Rerun reports zero changes. Existing conflicting authored book rows cause refusal/rollback, not overwrite or duplication.

Before-change backup /tmp/vibe-repertoire-20261006-backup/before.dump, directory 0700 / file 0600, pg_restore --list verified. Full PostgreSQL metadata/data archive; not full Supabase recovery: Storage object bytes, external platform configuration and score PDFs are outside its scope. No restore performed.

## Repeatable execution

Source extractor: scripts/extract-piano-repertoire.py, using bundled pypdf. Manifest: lib/academic/piano-pre-grade-repertoire.json. Builder: scripts/piano-pre-grade-repertoire-sql.cjs; SQL body: scripts/sql/piano-pre-grade-repertoire.sql; generated migration file includes exact manifest.

Confirm the running app's cwd, loaded API loopback URL and local Docker project/port binding before any execution. Back up that target. Execute the generated SQL inside BEGIN/ROLLBACK with psql -X -v ON_ERROR_STOP=1; inspect guards and stop on identity/content/history conflict. Apply only to the same verified local target inside one transaction, recording the exact migration version/statements. Independently read back all 100 entries and perform a rollback rerun. Do not run a blanket migration batch or apply to shared databases. This data import requires the verified existing PIANO / PRE / Repertoire catalog and syllabus schema; it is not a fresh database/bootstrap or shared-environment upgrade claim.

## Code/UI and evidence

Lesson page reuses the existing VIBE syllabus card, with distinct “Giáo án Repertoire 2A/2B”, content scope, scan/printed references and actual VIBE syllabus page. Loading failures identify the expected syllabus. Existing Book B layout/fields retained.

Level's main table now shows active subjects; historical/unpublished subjects remain accessible via the all-subject filter. Retired content is labeled as not used for new activity, rather than falsely presented as an unpublished draft. Old records are not deleted.

13/13 affected import, source coverage, rendered-page/error-state and Book B regression checks pass (tests.log). Focused ESLint, TypeScript and git diff --check pass. React checklist: server rendering preserved, no added hooks/client bundle, existing shared components/design, no authorization caching or unsafe HTML. Independent actual DB readback matches all 100 extracted entries, every instructional field/scope/page/title, book hash and full first-lesson source context (database-readback.json). Preservation, migration and read denial: preservation.json, read-denial.json. Local execution logs: local-dry-run.txt, local-applied.txt, local-idempotence.txt.

Authenticated Safari verification on port 3000 completed with the existing Local Developer Admin session. The Pre Grade level showed six active subjects, including both new books with fifty lessons each; the retired Repertoire was omitted from the active table and its preserved-history notice remained visible. Opened 2A Lesson 01 and 2B Lesson 50: correct book, lesson title, Unit, scope, instructional fields and source-page references were present. The last 2B lesson remains in Unit 10, with its five-finger Challenge guidance intact. Evidence: repertoire-2A-lesson01.png/.txt and repertoire-2B-lesson50.png/.txt. Rendered desktop pages retain shared VIBE white cards, navy typography and restrained gold accents; no divergent local styling was introduced.

No remaining blocker for the requested local import. All 100 lessons were compared against persisted database fields; browser checks sampled the level and two lesson pages, not every lesson. Original score scans were not supplied; their bytes are not included. Mobile, teacher-role browser access and deployed acceptance were not verified. Chrome reload acceptance is not claimed; the authenticated browser evidence above is Safari. No full pilot acceptance is claimed. Unrelated uncommitted work preserved; no commit/push requested.
