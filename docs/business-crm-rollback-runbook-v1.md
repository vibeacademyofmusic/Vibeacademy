# Business CRM rollback runbook

Status: NOT EXECUTED. Use this only after an authorized production or staging change.

## When to roll back

Roll back on a P0: branch data leak, direct-write bypass, corrupted lead or instrument history, or a migration that cannot be verified.

## Steps

1. Stop new Business writes at the application, or take the deployment offline.
2. Restore the database backup taken before the migration. Do not invent a backup id.
3. Redeploy the previous application build recorded at deploy time.
4. Confirm Auth URLs still match the restored environment.
5. Sign in as super admin and as branch admin. Confirm the business pages match the restored schema.
6. Record the restored migration version, the backup id, and the build SHA.

## Do not

- Point the restored application at a different Supabase project.
- Delete `20260919115041` or `20260910201008` from history.
- Use a staging backup to restore production, or the reverse.
- Treat a staging rollback as permission to change production.
