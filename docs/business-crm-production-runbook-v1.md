# Business CRM production rollout runbook

Status: NOT EXECUTED. Do not run these steps until a later message contains a separate production authorization and names the production project ref.

The current Supabase link is not production authority. Do not use it as the production target.

## Before any production command

1. Record the production project name, ref, organization, and domain.
2. Show that this ref is different from the staging ref.
3. Record the commit SHA that passed local and staging validation.
4. Take a production backup and record its id.

## Order, when authorized

1. Verify the commit.
2. Verify the migration set ends at `20260922250000_crm_shell_access_v1.sql` and includes the seven Business migrations, without rewriting `20260919115041` or `20260910201008`.
3. Apply the repository migrations to the confirmed production ref only.
4. Verify tables, RPCs, RLS, grants, and the business shell function.
5. Deploy the application with production environment variables that point only at that project.
6. Confirm Auth site URL and redirects use the production domain.
7. Smoke-test super admin and branch admin, including a cross-branch denial and an unaudited admin denial.
8. Reconcile one known Business report fixture, or the first live day if no fixture is loaded.
9. Watch authorization failures and report mismatches.
10. Decide go or rollback from the backup id.

Finance and payroll changes are outside this Business rollout unless they have their own approval.
