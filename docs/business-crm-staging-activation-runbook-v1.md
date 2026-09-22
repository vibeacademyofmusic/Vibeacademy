# Business CRM staging activation runbook

Status: the Owner confirmed on 2026-09-22 that `vibe-academy-staging`, ref `owpfqwdrmyzcmjahehek`, is official VIBE Staging and is not Production. No remote read or mutation has been run. The next step needs the exact phrase `AUTHORIZED: READ-ONLY STAGING COMPARISON ONLY`. Production stays untouched.

The local project id in `supabase/config.toml` is `vibe-academy-system`. The link name is not, by itself, approval to push migrations.

## Staging project

Confirmed by the Owner on 2026-09-22:

- Project name: `vibe-academy-staging`
- Project ref: `owpfqwdrmyzcmjahehek`
- Purpose: official VIBE Staging
- Distinct from Production: yes

That confirmation identifies the target. It does not authorize a remote read, a migration, or a deploy.

- Dedicated Supabase project, named and owned separately from production.
- Region and Postgres version compatible with the local stack used for `npx supabase db reset --local`.
- No production data. Load only the branches, roles, and labeled test people required for the pilot.
- Database password, service-role key, and publishable key stored in the staging host, not in git.

## Vercel and URL

- A Vercel project or environment named staging, attached to this repository.
- A staging URL that is not the production domain.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` point at the staging project only.
- Server secrets for that environment are the staging keys only.

## Auth redirects

- Supabase Auth site URL is the staging origin.
- Redirect allow-list includes the staging `/login` and the staging auth callback, and does not include production.
- Email confirmations and password recovery use the staging URL.
- Pilot accounts are created in the staging project: one Owner / `SUPER_ADMIN`, one `BRANCH_ADMIN` with `crm.view` on the pilot branch, and a CRM operator only if that role is granted `crm.view` on the same branch.

## Branch fixture

- One real pilot branch.
- A second branch used only to prove a branch admin cannot read it.
- No copied production students, invoices, payroll, or instrument serials.

## Access protection

- Staging responses send `X-Robots-Tag: noindex` or an equivalent noindex header.
- The deployment is not linked from the public site.
- Optional HTTP basic auth or Vercel deployment protection in front of the staging URL.

## Outbound messages

- Email, Zalo, SMS, and notification providers are disabled or pointed at an allow-list of pilot addresses.
- A failed provider must not be treated as a successful send.

## Migration

1. Owner confirmed `vibe-academy-staging`, ref `owpfqwdrmyzcmjahehek`, is Staging and is not Production. Done on 2026-09-22.
2. After `AUTHORIZED: READ-ONLY STAGING COMPARISON ONLY`, read the remote migration history. Do not repair or push yet.
3. Apply the local migration chain, including `20260922250000_crm_shell_access_v1.sql`, only after that confirmation.
4. Do not rewrite or delete `20260919115041` or `20260910201008` if they are already in remote history.

## Reset

Reset the staging database only when the Owner confirms it contains no data that must be kept. `db reset --linked` is a remote mutation and is out of scope until that confirmation. Local reset remains `npx supabase db reset --local --yes`.

## Test

- Staging sign-in for the Owner, the branch admin, and a user with no CRM permission.
- The local UAT script in `docs/business-crm-pilot-script-v1.md` on the pilot branch.
- Cross-branch denial, direct-write denial, and the business command center counters.
- Confirm finance and payroll pages still reject the branch admin.

## Rollback

- Restore the staging database from the backup taken before the migration.
- Redeploy the previous Vercel staging build.
- Do not roll production back, because production was not changed.

## Evidence checklist

- Target project name recorded by the Owner.
- Migration list before and after, with no production project in the command.
- Build URL and commit.
- Role matrix on the staging URL.
- Outbound provider shown disabled or allow-listed.
- noindex response header.
- Backup id taken before the migration.

Stop here until the Owner authorizes the staging mutation.
