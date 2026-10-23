# Ca dạy & Lịch học: source sync (24/10/2026)

This branch is a **development source snapshot** for continuing the operating schedule at the top of “Ca dạy & Lịch học”. It starts from the already published GitHub development commit `2da0f07b90445ba86ef559538eea4910391b6c44` on `codex/staging-full-sync`. Selected application, migration, and regression-test files were copied from the separate, uncommitted checkout at `fb8c24ea2a8ef9bb5cf12fe438a5f257d2115dbc`; that checkout was not reset, staged, or overwritten.

## Source boundaries

- Includes the `/admin/classes` and `/admin/schedule` redirects, the `/admin/students?tab=coordination` workspace, class setup and placement actions, schedule planning rules, transactional room guards, and their focused tests.
- SQL migrations here are **source files only**. This sync does not run them against staging or production and does not change room, class, enrollment, attendance, or tuition records.
- Excludes `.env*`, credentials, ignored `.backups/` and `.vercel/`, `tmp/`, production snapshots and reports, student imports and rosters, production reset scripts, and unrelated academic/CRM work. No user records are part of this commit.
- The source serving `manage.vibe.edu.vn` cannot be identified by Git SHA from the current Vercel deployment metadata: it was made through the CLI without Git metadata. This branch must not be described as the verified production source.

## Local verification before sync

- `next typegen` and `npm run typecheck`: passed.
- Focused coordination, navigation, independent-shift, class-ops, and Piano-planning Node tests: **51/51 passed**.
- `CI=1 npm run build`: passed; this compiles the isolated branch without deploying.
- Focused ESLint: no errors, four warnings in copied development files.
- Database migration execution and end-to-end browser testing were not part of this source-only sync. SQL test files and CI steps are included, but a GitHub CI result is needed after push before calling the branch release-ready.

The original checkout retains all unrelated local work. Production deployment, database migrations, and student placement require their own reviewed steps.

## GitHub-only sync guard

`vercel.json` disables Vercel's Git deployment for `codex/caday-source-sync-20261024`. It must be present in the first push of this branch, because the project Git-link status could not be confirmed from the available read-only metadata. This setting applies only to the named branch; do not remove it or merge it into another branch without reviewing deployment behavior. Verify the GitHub remote SHA and both Vercel projects after the push.
