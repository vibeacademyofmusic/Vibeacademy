# Staging release — 2026-10-06

The authorized 15-migration upgrade, source rollout and subsequent Guitar reconciliation are COMPLETE on Supabase staging `owpfqwdrmyzcmjahehek`. Guitar now includes Pre Grade and Grade 1–8 in the authenticated Owner browser. This is not a claim that every staging workflow passes or that numbered lesson slots contain authored teaching content.

## Release and deployment

- Deployed source commit: `fa2ad332fd917ef10cf4938b3111ca7886627dfd`.
- READY deployment: `dpl_766DUKnnd855oJ6LsQsuwr3f6hGa` (50-second build).
- Preview: https://vibeacademy-staging-es1epdtop-vibeacademyofmusic.vercel.app
- Stable staging: https://vibeacademy-staging-git-codex-release-c2cc5d-vibeacademyofmusic.vercel.app
- Alias switch succeeded and a separate Vercel inspection confirmed it points to that READY deployment.
- Source contains the approved academic imports, video links, teaching-shift changes, staff cards, bilingual reports, checkout persistence and tuition-reminder dialogs. Snapshot excludes private backups, environment files and temporary evidence. No Git push or production alias/deployment change.
- Build/runtime settings: `VIBE_PILOT_ENVIRONMENT=staging`, `ZALO_PILOT_OUTBOUND=disabled`, `ZALO_TEMPLATE_SEND_ENABLED=false`, `ZALO_TOKEN_RENEWAL_ENABLED=false`.

## Database: actual committed results

The owner explicitly authorized these 15 migrations in this chat. The previous approval block is resolved.

Before: 211 migration versions, latest `20261005050000`; Piano 0 levels, Guitar 9, Drum 0, no Violin. This was the cause of the missing curriculum in the owner's screenshot.

The exact source/snapshot hashes were checked against `migration-manifest.json`. The full upgrade passed a rollback rehearsal on staging, then the identical body was committed in one transaction. An exact-ledger guard and original-row digests protected 176 existing public business tables, including students, progress, enrollments, profiles, employees, permissions, role assignments, invoices, payments, renewal and payOS records. No function creation was skipped. Complete migration SQL and ledger entries were committed together; two historical remote-only versions remain preserved.

After the initial 15 migrations, read back through separate connections (the later Guitar result is documented below):

- Ledger: **226**, latest `20261006071000`.
- Piano: **2 levels**, 10 subjects including unpublished subjects, 230 active lessons. Pre Step: Book B, **50** lessons; Pre Grade: Level 1, 2A and 2B, **50 each**, plus three existing 10-lesson subjects.
- Guitar: **10 levels**; Werner Volume 1 and Volume 2: **50 lessons each**; 130 active lessons total.
- Violin: **9 levels**, 46 subjects, 360 active lessons.
- Existing Drum identity retained and canonical code/name reconciled to `DRUMS` / Trống; 0 levels remain.

Evidence: `database-postapply.json`, `books-persisted.json`, `migration-result.json`, `migration-manifest.json`. Transaction guard scope intentionally excludes the academic catalog, staff-position catalog and classes being reconciled by the approved migrations. All other pre-existing public tables are checked. The classes migration can backfill its curriculum reference from its existing course.

## Authenticated browser and rendered design verification

Reused the existing Safari Owner session, displayed as **Lê Đăng / Quản trị viên cấp cao**. No password, cookie copying or authentication bypass.

- Reloaded the stable staging curriculum list: four programs visible with updated counts; Piano and Violin report adequate academic structure.
- Opened Piano: Pre Step and Pre Grade links, 230 active lessons, adequate structure.
- Opened Pre Step: Book B has 8 units / 50 active lessons; active structure is complete. Three unpublished subjects remain explicitly labeled as unpublished, not falsely complete.
- Opened Pre Grade: Level 1, 2A and 2B each display 50 lessons; 2A and 2B retain the approved required flags; obsolete generic repertoire is absent.
- Actual rendered views retain VIBE navy type, white cards, gold borders/selected navigation, and consistent card/button spacing. Desktop visual evidence: `programs-staging.png`, `piano-pre-step-staging.png`, `piano-pre-grade-staging.png`.
- Full authenticated tuition send/renewal, academic edits and report publication workflows were not rerun on staging in this migration turn. No real notification or financial mutation was used as a smoke test.

## Regression and security results

- Typecheck passed; lint: 0 errors, 76 warnings; isolated local production build passed; final remote Preview is READY and serves VIBE login HTML.
- Focused academic/tuition checks: 52/52 passed. Affected migration checks: 28/28 passed. Latest bilingual reports: 36/36 passed.
- Broad guarded suite: 962/967 passed. Five retained failures: two recovery-helper tests receive `unexpected redirect` under the external-network preload; one registration-placement string assertion matches enrollment ACTIVE filtering rather than student roster filtering; Zalo durability fixture reports `verified fixture missing`; reply-sync fixture reports `need a second pending reminder`. Assertions were not weakened to hide these failures.
- Post-upgrade Supabase security advisors: 0 ERROR, 358 WARN (349 authenticated security-definer entry points, 8 mutable function search paths, 1 leaked-password-protection setting). These are recorded for follow-up, not silently waived or automatically rewritten. No role or Auth-policy expansion was performed in response.

## Remaining work and boundaries

The omitted Guitar Grade 1–8 catalog is now reconciled; no upload blocker remains for the approved local catalog. The 320 Grade lessons are numbered Lesson 01–Lesson 10 slots, not detailed authored lesson plans. Trống still has no levels. Broader acceptance remains limited by the five previously recorded regression failures and incomplete staging end-to-end coverage above. The admin program summary includes archived records in its total: Guitar has 9 active levels plus one retained inactive Diploma, so the summary displays 10. The inactive Diploma is not a released course.

No real Zalo messages, new payOS orders, fabricated callbacks, paid updates, enrollment activation, reception payment permission changes, credential resets or production changes. No user action is required to finish this approved upgrade.

## Reconciliation and recovery procedure

The protected files are under `/private/tmp/vibe-staging-release-20261006`. The complete apply transaction is `upgrade-apply.private.sql`; its SHA-256 is `8faa8b1823ce181fdf95cd88d80b1b191764e3be2e1e79768716fdc9cc68ef35`. Do not replay it now: its ledger guard correctly rejects the already-upgraded state.

For another environment: explicitly identify/authorize its target, compare its actual migration ledger and source hashes, preserve application schema/data/ACL, restore a new isolated clone with the real Auth/Storage definitions, and rehearse the complete missing migrations with original-record guards before committing. Reconcile every drift explicitly; do not omit functions or forge ledger entries. Verify persistence and authenticated UI before switching the environment's alias.

Backups here cover application schema/data/ACL/ledger and Auth/Storage definitions. They do **not** include Auth credentials, identities/sessions or Storage object bytes. These are limited application backups, not full platform recovery. Recovering Storage requires separately preserved object bytes and ownership/permission metadata.

## Guitar reconciliation — applied and verified

Code commit: `f47e43c6f12e32c77a1eb54ba97d0011c3aef875`. Migration: `20261005215015_guitar_grade_catalog_reconciliation.sql`. The later-dated report/PDF migration in the shared working tree was not included or applied. No new web deployment was required; this is catalog data served by the already verified staging deployment.

Cause: the foundation migration deliberately skipped existing Guitar Grade levels. Staging therefore retained legacy subjects and zero Grade lessons, even though the imported Pre books were present. Refreshing the browser could not fix this database difference.

The owner authorized the upload after the specific proposal to reset only the synthetic academic progress for `STG-students-1` and `STG-students-2`, and then explicitly reminded us to include Pre. A protected backup was taken before writing. The original Guitar program, level, mapped subject, student and academic-enrollment IDs were retained. Current placement stayed Grade 1 and Grade 2 respectively, with original enrollment dates. Their synthetic assessed history was intentionally reset: 2 current IN_PROGRESS levels, 8 NOT_STARTED subjects, 8 NOT_STARTED components and 80 NOT_STARTED lesson-progress rows. No PASS result or completion history was fabricated. No other learning-progress rows existed in this staging snapshot.

A single transaction reconciled the reviewed legacy catalog with the exact local source. Unsupported legacy subjects/groups were archived rather than deleted. The empty, unreferenced Diploma was retained as INACTIVE. All checks, triggers, foreign keys and permissions remained enabled. Full-row digests verified **179 public business tables** unchanged, including financial, student, enrollment, staff/profile and role/permission records. Original catalog IDs remained present; Pre and every pre-existing lesson row were immutable under the transaction guard.

Actual committed/read-back result:

- **Pre Grade: 5 active subjects / 130 active lessons** — Werner Volume 1: 50, Volume 2: 50, Technique Foundation: 10, Sightreading: 10, Aural: 10. Its original 1 level, 5 subjects, 5 components and 130 lesson rows match the backup exactly, including IDs and timestamps.
- **Grade 1–8: 4 active subjects and 40 numbered lessons per grade**, totaling 320; exact active teaching metadata matches local. The legacy 17 extra subjects remain archived.
- **Full Guitar: 450 active lessons**, 37 active subjects/components, 9 active levels; the admin summary includes 54 total subjects and 10 total levels because archived records remain recoverable.
- Migration ledger: **227** entries; reconciliation version appears exactly once. Highest chronological version remains `20261006071000` because the generated reconciliation filename uses the CLI's UTC timestamp.

Verification performed:

1. Restored staging clone with actual Auth/Storage schema components: complete rollback rehearsal passed, then clone commit passed. No manually skipped functions.
2. Applying the catalog migration directly before the scoped reset correctly failed with `GUITAR_PROGRESS_RECONCILIATION_REQUIRED`.
3. Two migration reruns after reconciliation changed no catalog, enrollment or progress row and created no duplicates.
4. Staging rollback rehearsal passed; its body exactly matched the committed transaction apart from ROLLBACK versus COMMIT. Separate read-back connections confirmed the counts, preserved Pre, original enrollment rows, trigger definitions and reset statuses.
5. Werner regression suite **5/5 PASS**. An initial exact-output failure came solely from an extra final newline in the SQL generator; the generator was corrected to reproduce the immutable historical migration. The migration and assertions were not weakened or rewritten.
6. Supabase security advisors again returned **0 ERROR / 358 WARN**, with the same previously recorded categories. No authorization change was made.
7. Existing Safari Owner session: Guitar page shows Pre Grade plus Grade 1–8 and 450 lessons; Pre detail shows 5 subjects / 130 lessons and both 50-lesson books; Grade 1 shows 4 active subjects / 40 lessons and labels the archived Music Theory subject as unpublished. Rendered cards, table, typography and navy/gold styling remain consistent with VIBE. Evidence: `guitar-staging.png`, `guitar-pre-staging.png`, `guitar-grade1-staging.png`.

Machine-readable evidence: `guitar-reconciliation-result.json`, `guitar-stage-catalog-after.json`, `guitar-grade-local-catalog.json`. The prior `guitar-reconciliation-diagnosis.json` remains the before-state record, not the current result.

### Repeatable procedure and recovery scope

Protected operator inputs and the academic backup are retained locally in `tmp/staging-guitar-20261006/` (directory 0700; files 0600), excluded from this commit. The backup contains the Guitar catalog, only the two authorized academic enrollments/progress trees, and relevant trigger definitions. It contains no Auth credentials or Storage object bytes. It is **not a full recovery backup**. SHA-256 hashes are in `guitar-reconciliation-result.json`; committed transaction hash is `b39ebf902c06846d4c4ee3e8b9942e79c49a94cfa8fe69b295da7d855e526166`.

For a repeatable upgrade on a separately authorized target: verify project identity, ledger and exact legacy catalog; preserve catalog/progress/ACL first; restore an isolated clone; run the complete catalog migration. Its drift and existing-progress guards must remain enabled. If learning history exists, stop for an explicitly approved reconciliation of those exact records; never infer that staging history is disposable. For this approved synthetic reset, the operator locks the academic tables, compares the two full enrollment rows with the backup, removes their level-progress trees in descending level order through normal enabled constraints, applies the catalog migration, and seeds NOT_STARTED work for their unchanged current placements. It then checks preserved business rows, immutable Pre/other catalog rows and triggers before writing the complete migration statement into the ledger in the same transaction. Rehearse with ROLLBACK, then commit identical SQL and verify through a fresh connection and browser.

Do not rerun the scoped reset: its ledger guard rejects an already applied migration. The generic catalog migration is safe to rerun and returns without changing learning progress. Recovery requires a separately reviewed transaction restoring the exact archived catalog/progress snapshot and checking for later activity first; do not restore an old snapshot over new learning records. Financial and Auth data are outside this scoped backup and reset.
