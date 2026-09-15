# VIBE Academy — Deployment V1 Summary

Status: APPROVED

## Environment Model

Use three clearly separated environments:

- LOCAL
- STAGING
- PRODUCTION

Staging and Production must use separate Supabase projects.

## Domain Strategy

Use a dedicated management subdomain such as:

manage.vibe.edu.vn

Do not replace or disrupt the existing public website at:

vibe.edu.vn

Protect current SEO and existing public URLs.

## Deployment Architecture

Recommended:

GitHub
→ Vercel
→ Supabase Cloud

Web application:
Next.js

Backend:
Supabase PostgreSQL + Auth + Storage/RPC as applicable

## Production Rules

1. Production changes must come from version-controlled migrations.
2. Do not manually patch production schema as the normal workflow.
3. Environment variables and secrets must be separated by environment.
4. Supabase Auth Site URL and redirect URLs must match the deployed environment.
5. Backup and restore capability must be verified before go-live.
6. Security/RLS gate must pass before production rollout.
7. Financial reconciliation must pass before cutover sign-off.
8. Production rollout must be reversible where technically safe.

## Staging

Staging is required before production.

Use staging for:
- migrations
- security testing
- imported legacy data trials
- user acceptance testing
- browser/mobile validation
- pilot workflows

Do not use production data unnecessarily.

## Legacy Migration

Migration sequence:

source preparation
→ dry-run
→ validation
→ review queue
→ staging import
→ reconciliation
→ sign-off
→ production cutover

Do not perform production import without successful staging rehearsal.

## Pilot Rollout

Do not rollout all three branches at once.

Recommended sequence:

1. 2–5 internal users
2. one branch
3. 7–10 working day pilot
4. resolve issues
5. expand branch by branch

## Production Blockers

Do not open production if any of these remain:

- unresolved RLS/security issue
- unexplained financial reconciliation mismatch
- failed backup restore verification
- critical migration error
- critical authentication/authorization issue

## Cutover Principle

During final migration:
- define a cutover time
- freeze legacy-source changes where needed
- perform final export/import
- reconcile
- obtain sign-off
- activate the new system

## Monitoring

Prepare for:
- application errors
- database health
- auth failures
- migration failures
- financial discrepancies
- backup/recovery status

## Source Specification

See:
`VIBE_Internal_Production_Deployment_Specification_V1.docx`
