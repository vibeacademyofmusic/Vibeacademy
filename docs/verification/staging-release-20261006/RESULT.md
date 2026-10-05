# Staging release — 2026-10-06

The authorized 15-migration upgrade and source rollout are COMPLETE on Supabase staging `owpfqwdrmyzcmjahehek`. The curriculum is now visible in the authenticated Owner browser. This is not a claim that every staging workflow passes.

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

After, read back through separate connections:

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

The curriculum upgrade requested here is complete. Broader acceptance remains limited by the five regression failures and incomplete staging end-to-end coverage above. Existing Guitar levels still contain 49 subjects without lesson content and one missing subject structure; Trống has no level. These gaps are not caused by losing the imported books and are not labeled complete.

No real Zalo messages, new payOS orders, fabricated callbacks, paid updates, enrollment activation, reception payment permission changes, credential resets or production changes. No user action is required to finish this approved upgrade.

## Reconciliation and recovery procedure

The protected files are under `/private/tmp/vibe-staging-release-20261006`. The complete apply transaction is `upgrade-apply.private.sql`; its SHA-256 is `8faa8b1823ce181fdf95cd88d80b1b191764e3be2e1e79768716fdc9cc68ef35`. Do not replay it now: its ledger guard correctly rejects the already-upgraded state.

For another environment: explicitly identify/authorize its target, compare its actual migration ledger and source hashes, preserve application schema/data/ACL, restore a new isolated clone with the real Auth/Storage definitions, and rehearse the complete missing migrations with original-record guards before committing. Reconcile every drift explicitly; do not omit functions or forge ledger entries. Verify persistence and authenticated UI before switching the environment's alias.

Backups here cover application schema/data/ACL/ledger and Auth/Storage definitions. They do **not** include Auth credentials, identities/sessions or Storage object bytes. These are limited application backups, not full platform recovery. Recovering Storage requires separately preserved object bytes and ownership/permission metadata.
