# Business CRM one-branch pilot plan

Status: NOT STARTED. This is a plan only. No one-branch pilot has been executed. Production is not authorized.

## Preconditions still open

- Owner confirms the staging project and authorizes staging migration and deployment.
- Staging validation, security checks, and the 2–5 user internal pilot finish with no open P0.
- The Owner then chooses the environment. This plan does not authorize production.

## When it starts

| Item | Plan |
| --- | --- |
| Branch | One branch named by the Owner. Not selected yet |
| Users | Owner / `SUPER_ADMIN`, the branch admin for that branch, and at most three more internal users. Total 2–5 |
| Permissions | `crm.view` plus the lead, campaign, reactivation, and instrument-customer permissions already granted to `BRANCH_ADMIN` |
| Duration | 7–10 operating days after a start date the Owner sets |
| Support owner | The Owner, or a person the Owner names |
| Escalation | P0 stops the pilot the same day and returns to the last staging or production backup |

## Enabled

New leads, follow-ups, pipeline, campaign attribution, monthly reports, human-review conversion, reactivation, instrument customer care, warranty, and after-sales follow-up.

## Excluded

Ads APIs, automated Zalo, SMS, or marketing email, automatic discounts, commissions, warranty approval, finance posting, and payroll posting.

## Watch

Lead counts, overdue follow-ups, failed transitions, conversion-review mistakes, duplicate reactivation cases, report mismatches, cross-branch attempts, authorization failures, and warranty questions.

## Backup and rollback

Take the environment backup named in the staging or production runbook before the first pilot day. Rollback is restore that backup and redeploy the previous application build. Do not add outbound messaging during the pilot.
