# Business CRM pilot readiness V1

No remote database was changed. `supabase/config.toml` names the local project `vibe-academy-system` and does not identify a dedicated staging project. The linked remote was not treated as staging and was not migrated.

## Decisions

| Surface | Decision | Reason |
| --- | --- | --- |
| Super-admin local UAT | CONDITIONAL GO | Schema, branch checks, and the super-admin shell are in place. UAT still has to be walked with the pilot script on a freshly reset local database. |
| 2–5 user staging pilot | HOLD | No staging project is explicitly configured. Do not apply migrations to the linked remote. |
| 1-branch pilot | HOLD | `ADMIN_SHELL_ROLE_GATE`: `BRANCH_ADMIN` cannot open `/admin` until that shell is audited or Business moves to its own layout. |
| Production | HOLD | Not requested and not safe. |

## Blockers

- `ADMIN_SHELL_ROLE_GATE` is unresolved. See `docs/admin-shell-role-gate-v1.md`.
- Staging apply needs an explicit staging project and a separate owner approval.
- Conversion does not create a student or parent. A won lead stays in human review until someone links an existing student.
- Campaign cost stays blank unless a positive budget was entered.
- Reactivation does not use a 90-day pause rule. A pause still inside its end date is not a case.

## Staging runbook, do not execute yet

1. Confirm the target project ref in the Supabase dashboard and write it down. Reject the currently linked remote unless that written ref matches it.
2. Take a backup.
3. Run the local `npx supabase db reset --local` gate again and keep the log.
4. Apply only the CRM migrations `20260922180000` through `20260922240000` to that confirmed staging database with owner approval.
5. Repeat the database tests there. Do not point the pilot at production.
