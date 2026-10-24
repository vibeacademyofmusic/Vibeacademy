# Local development and preview

Use `npm run dev` for Turbopack development on port 3000 with hot reload.
Use `npm run dev:lan` for the same engine/port on all network interfaces.
Keep one development server per checkout. A second invocation must not be
used to move the same checkout's development server to another port: both
instances need the same `.next/dev/lock`. Never delete a lock owned by a
running process. Stop your server with Ctrl+C in its terminal.

While interacting with the UI, run only focused module tests when necessary.
Do not leave full tests, TypeScript, or builds running in the background.

For a checkpoint, run focused tests, then `npx tsc --noEmit`, sequentially.
For a quality gate, stop dev/preview, run relevant/full tests, then
`npm run build`. Do not run these jobs in parallel on this machine.

`npm run build` remains `next build --webpack`. Local prebuild/postbuild hooks
refuse an occupied port 3000, fingerprint runtime source/config/local
production env files before compilation, and mark the build only after
successful completion with unchanged inputs. No process is automatically killed.
CI and Vercel skip these local hooks. No deployment is performed by these scripts.

`npm run preview` serves the verified build on port 3000. It refuses missing,
incomplete, replaced, or stale builds, including added/deleted source files.
It does not build silently. Stop preview with Ctrl+C when finished, then start dev.
Next 16 isolates dev output in `.next/dev`; preview reads the completed `.next`
production output. Dev and preview use the same port, so stop one before starting the other.

The fingerprint covers Git-listed tracked/untracked runtime sources, public
assets, root build configuration/package files, and local production env files.
It stores only a digest, not secrets. Changes to shell-only environment overrides
or installed dependencies outside the lockfile cannot be detected: rebuild
explicitly after those changes. Bypassing npm lifecycle hooks also bypasses the
verified-build marker. The preview is a snapshot; later source edits are not hot
reloaded, and a subsequent preview start will require rebuilding.

## Measured on this repair

Sequential cold `.next/dev` runs (2026-09-23), same local database.
Generated `.next/dev` was moved aside before each engine; source and DB untouched.
Times are HTTP request/response timings, not browser paint.
A single short run per engine is evidence for this machine.

Turbopack (`npm run dev` / default Next 16): Ready 208 ms.
- `/login`: 1765 / 19 ms (200)
- `/admin`: 337 ms (307 → login without session)
- `/admin/hr/expenses`: 295 ms (307)
- `/admin/attendance`: 89 ms (307)
- Sampled server CPU during navigation: 91.3%; after 10s idle: 0.0%
- New GET lines during 10s idle: 0

Webpack (`next dev --webpack -p 3000`): Ready 223 ms.
- `/login`: 4271 / 157 ms (200)
- `/admin`: 507 ms (307)
- `/admin/hr/expenses`: 487 ms (307)
- `/admin/attendance`: 69 ms (307)
- Sampled server CPU during navigation: 49.1%; after 10s idle: 30.5%
- New GET lines during 10s idle: 0

Both engines stayed available; neither reported lock/process errors.
Turbopack retained: faster cold `/login`, near-zero idle CPU, no idle request loop.

The historical measurement used `next start -p 3001`; current preview uses port 3000 and remains faster because it skips on-demand
compilation. Keep it as an optional snapshot via `npm run preview` after a verified
`npm run build`.

Supabase idle snapshot (no test/build jobs): DB ~0.7%, Realtime ~3.6%, Analytics ~2.3%,
pg_meta ~1.2%. Persistent but modest; no optional service disabled. No database reset.


## Authoritative local workspace — 2026-09-28

VIBE daily development uses only vibe-academy-system on localhost:3000. Feature preview worktrees are temporary and must be reconciled back before further development.

- Repository: `/Users/macbookair/vibe-academy-system`, branch `feature/learning-report-v2`.
- Supabase main only: API 54321, PostgreSQL 54322, Studio 54323. Use main local Auth.
- `vibe-academy-crm-preview`: ARCHIVE / READ-ONLY REFERENCE; preserve it until owner accepts consolidation. Do not start it for daily work or delete it yet.
- Daily: `npm run dev`, open http://localhost:3000. Typecheck: `npm run typecheck`.
- Local snapshot: stop the identified main dev process first, then `npm run build` and `npm run preview` (also port 3000). Never run dev and preview together.
- Provider credentials belong only in main `.env.local`. The owner-authorized payOS reconciliation copied only the three payOS credential variables from the trusted former local configuration. Never copy reference Supabase credentials. See `payos-local-configuration.md` for current status and webhook limitations.
- No reset, production, staging or deployment is part of consolidation.
