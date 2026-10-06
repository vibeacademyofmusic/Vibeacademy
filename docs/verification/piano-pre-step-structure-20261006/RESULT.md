# Piano Pre Step — reconciliation on local port 3000

The warning was valid for the stored data: Technique Foundation was ACTIVE with ALL_REQUIRED_COMPONENTS but its only active LESSON_DRAFTS container was optional, containing ten INACTIVE, optional, unnamed-authoring-placeholder lessons. No required active component existed. The ninth group was this draft container; the other eight were the published Book B Units. The academic validator was not relaxed.

## Actual correction

Only Technique Foundation subject 68944925-476b-47da-85e6-0c3f1ff9068d and container d912f529-56d0-4005-9340-91c0bc5a4444 changed ACTIVE → INACTIVE. They remain available for authoring. No deletion, new lesson, required-flag change, completion-rule change, authorization change, student outcome, enrollment or promotion. No history existed for this subject/component. Ten lesson IDs and contents retained. Book B retains all 50 active lessons and 50 syllabi across eight Units. Aural/Sight Reading and all other levels unchanged.

The supplied Book B PDF does not supply a separately approved Technique Foundation syllabus or its assessment rules. Deactivating its empty draft scaffold is a publication-state correction, not delivery of missing Technique content. Three unpublished subjects remain visible: Technique Foundation, Aural, Sight Reading. A complete approved four-subject curriculum is not claimed.

Level page now counts only active subjects and active parent components; shows 1 active subject / 8 Units / 50 lessons. It distinguishes “Đủ cấu trúc phần đang hoạt động” from the three unpublished subjects. Inactive subjects remain visible with status and “Chưa phát hành nội dung.” Units are not described solely as assessment groups. Subject/component/item query errors stop readiness metrics and display a retry notice; they cannot appear as an empty or academically ready tree.

## Target, execution and preservation

Verified port 3000 Node PID 35759 cwd /Users/macbookair/vibe-academy-system; app runtime API http://127.0.0.1:54321; container supabase_db_vibe-academy-system, PostgreSQL local 54322. No staging/production writes or deployment, credentials changed, or messages sent.

Targeted SQL: scripts/sql/piano-pre-step-draft-reconciliation.sql. Dry run rolled back before application. Applied once in a transaction after backup; second execution reports subject 0 / component 0 changes. It locks catalog/progress tables, verifies the exact optional scaffold, refuses authored/active items, required subjects, extra components, student history, video links or either guide table, and requires the 50 active Book B syllabi. Checksums of all five enrollment/progress tables match before/after. No schema migration was needed.

Local PostgreSQL backup /tmp/vibe-pre-step-structure-backup/before.dump, file 0600, directory 0700. Full PostgreSQL custom archive including database permission/Auth metadata; pg_restore --list verified readable. Restore was not attempted. This does not include Storage object bytes or external platform/deployment configuration and is not full Supabase recovery.

## Repeatable local reconciliation

1. Confirm the process serving 3000 has this repository as cwd and its loaded Supabase API is the loopback API. Confirm local Supabase project_id and Docker container/54322 binding match. Stop on mismatch; never use a cloud SQL connection.
2. Back up the verified local PostgreSQL database with pg_dump -Fc, preserve a private archive, and verify pg_restore --list. Do not restore the entire archive over later work.
3. Run the saved reconciliation SQL with psql -X -v ON_ERROR_STOP=1 inside BEGIN/ROLLBACK against that local container. Inspect the refusal/error if any; do not remove guards, skip statements or weaken requirements.
4. For exactly the approved empty optional scaffold, rerun inside BEGIN/COMMIT on the same verified local database. All other records and permissions remain intact. Rerun with rollback to demonstrate zero further changes; read back Book B and progress preservation.
5. Reload the authenticated local level page. Expect 1 / 8 / 50, the scoped structure label, and three explicit unpublished subjects. Subsequent authoring/activation needs actual content and the existing academic validation; this script is not a general deactivation policy or shared upgrade migration.

## Evidence and checks

Actual independent database readback: database-readback.json. Execution: local-dry-run.txt, local-applied.txt, local-idempotence.txt.

14/14 focused reconciliation, Book B and rendered-level tests passed (final-tests.log). They cover idempotence, retained IDs/content/rules/progress, refusal for authored items/history/required subject/video/authored guide, continued denial of invalid active academic structures, all three catalog-query failure states, and counts excluding inactive parents. These PostgreSQL fixture tests are not full Supabase authorization acceptance.

Authenticated native Safari local SUPER_ADMIN session reloaded the actual level page and displayed 1 active subject / 8 Units / 50 lessons, “Đủ cấu trúc phần đang hoạt động,” and three unpublished subjects. Browser evidence: browser-after-reload.txt and pre-step-local.png. Rendered design verified existing VIBE white cards, navy text, restrained gold borders/notices and consistent spacing. No unrelated redesign. Mobile viewport not separately verified.

Focused ESLint, TypeScript and git diff --check passed. Additional old regression runs exposed two fixture/assertion mismatches outside this change: programs-workspace P01 expects .from('curriculums') although existing canonical-program work now reads operational_curriculums; academic-subject assignment fixture supplies no operational_curriculums identity, so the existing canonical-program guard rejects before the mocked academic-validation RPC. Assertions and product permissions were not weakened. Logs: tests.log and affected-tests.log. No full suite PASS is claimed.

## Remaining scope

Technique Foundation/Aural/Sight Reading still need authored content and approved publication/assessment configuration; the supplied Book B alone cannot complete those subjects. Existing level ALL_REQUIRED_SUBJECTS and optional subject flags remain unchanged; this run does not approve a new completion policy. The two broader fixture mismatches and mobile acceptance remain outside the completed local correction. No commit/push/deployment; unrelated uncommitted work preserved.
