# Phase 21 — local privilege catalogue checkpoint

2026-09-17. **PARTIAL overall audit; catalogue hardening PASS.** No cloud access,
production mutation, deployment or push. Independent audit work proceeded while
the instructional content review remains open; this does not skip other exit gates.

## Finding and correction

Local catalogue inspection found 59 public business tables/views still carrying
anonymous default grants (356 privilege rows). Inspected accessible base tables
had RLS, accessible views were SECURITY INVOKER, and no public SECURITY DEFINER
function was anonymously executable. Thus the grants alone were **not evidence of
an observed data leak**; nevertheless they unnecessarily depended on every RLS
boundary remaining correct and included non-row privileges such as REFERENCES.

`20260917020000_revoke_anonymous_business_grants.sql` revokes anonymous/PUBLIC
relation and sequence privileges in the business `public` schema, and removes
anonymous table/sequence defaults for the postgres migration owner. It preserves
authenticated and service-role grants, policies, data, routines and all auth/storage
schemas. Supabase platform-role defaults remain untouched. Future migrations must
continue explicitly revoking function execution; the regression suite detects
anonymous SECURITY DEFINER exposure, including functions from future modules.

Login uses Supabase Auth; business role/profile lookups happen after authentication.
No approved anonymous business-data consumer or anonymous/public RLS policy was
found. An intentionally public future feature needs its own reviewed projection;
do not restore wholesale anonymous grants.

## Local evidence

- After migration: **94** migration ledger entries, **0** anonymous/PUBLIC business
  relation privilege rows; **172** public SECURITY DEFINER functions, all pinned to
  `public, pg_temp`, none executable by anonymous users.
- No anonymously/authenticated-writable `public` schema; no authenticated TRUNCATE
  on business base tables; authenticated-readable views preserve caller privileges.
- New 16-case catalogue pgTAP file verifies these invariants and anonymous denial
  on student/finance queries, preserves authenticated read grants, and creates a
  transaction-rolled-back fixture to test future migration defaults.
- Full pgTAP **59 files / 1,533 PASS**. Application/bootstrap **266 PASS**.
- Latest unchanged application tree: Webpack build and relevant ESLint PASS from
  analytics validation. Only SQL/test/docs changed for this privilege correction.
  Default Turbopack environment restriction remains; not reported as PASS.
- Browser: fresh synthetic-admin login succeeded, Finance dashboard read its cash,
  receivable, forecast and transaction sections without source warnings or console
  errors. No financial write. Account then disabled; credential/script deleted and
  temporary tab closed.

## Limits and deployment hold

This is not a complete whole-system security sign-off. Full role/browser staging
rehearsal, later module boundaries (CRM/Aural/Report Card), public RPC reachability
review and deployment-specific configuration still require evidence. Existing
role-specific regression tests passed locally, but no fresh staging/production
claim is made. All migrations remain LOCAL ONLY. Production HOLD continues.

Recovery for an unexpected authorized public consumer would be a reviewed narrow
grant on its dedicated safe projection, not a rollback of RLS or broad grant
restoration. The migration neither deletes nor rewrites business data.
