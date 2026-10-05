# Business CRM pilot readiness V2

Date: 2026-09-22. These statuses are separate. Local validation does not make staging or production ready.

| Decision | Status | Why |
| --- | --- | --- |
| Super-admin local UAT | GO | Password sign-in, rendered business pages, and database checks passed. See `docs/business-crm-local-uat-result-v1.md`. |
| Multi-role local UAT | GO | A signed-in branch admin opened the six business routes, was denied the unaudited admin routes, and could not read or change branch B. Teacher, no-role, disabled, and anonymous sessions were denied. See `docs/business-crm-local-uat-result-v1.md`. |
| 2–5 user staging pilot | HOLD | The local link cache names `vibe-academy-staging`. No staging migration, deploy, or user session has been run. Owner authorization is required first. |
| One-branch pilot | HOLD | Start only after the staging pilot is up, with one branch, 2–5 people, for 7–10 operational days. |
| Production | HOLD | Production was not changed. |

## Recommended pilot, after staging is authorized

- People: Owner / `SUPER_ADMIN`, one branch admin with `crm.view`, and a CRM operator only when that account has `crm.view` on the same branch.
- Scope: leads, follow-ups, pipeline, campaign attribution, reports, reactivation, instrument customer care, and the business dashboard.
- Place: one branch first, 7–10 operational days, 2–5 users.
- Outside the pilot: finance and payroll production effects, unless those domains are approved on their own.

## Not ready to call the pilot open

Staging has not been migrated or protected. The branch-admin screen walkthrough is still outstanding. Finance and payroll remain outside this pilot.
