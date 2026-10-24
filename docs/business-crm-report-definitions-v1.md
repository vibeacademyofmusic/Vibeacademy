# Business / CRM report definitions V1

Business dates use `Asia/Ho_Chi_Minh`. A missing denominator is shown as “Chưa đủ dữ liệu”. A missing or zero campaign budget is shown as “Chưa có dữ liệu chi phí”. Zero is not treated as a measured cost.

## Cohort funnel

Population: `crm_leads` whose `created_at` falls in the selected period. A lead created in August and won in September stays in the August cohort and is counted as won there, because the win is read from `crm_lead_events`, not from the current status alone. A later `LOST` still counts the stages the lead had already reached.

Stages, in order: New, Contacted, Qualified, Trial Booked, Trial Completed, Proposal, Negotiating, Won, Lost.

- Qualification rate = qualified cohort leads / new cohort leads.
- Qualified → won rate = won cohort leads / qualified cohort leads.
- Overall conversion = won cohort leads / new cohort leads.
- Average time to first contact = `first_contact_at - created_at`, only for leads that have `first_contact_at`.
- Average days to close = the `WON` event time minus `created_at`. `converted_at` is the later human-review time and is not the close time.

“Trial hôm nay” on the operating queue means status `TRIAL_BOOKED` and `next_follow_up_on` equal to the current business date. There is no separate trial timestamp.

## Activity funnel

Population: `crm_lead_events` whose `created_at` falls in the selected period. It counts contacted, qualified, trial, proposal, negotiating, won, and lost transitions that happened in the period. It does not count leads merely because they were created then.

The August cohort can therefore show a win while the August activity funnel shows none, when the win event is in September.

## Reactivation

Opened cohort: `crm_reactivation_cases.opened_at` in the period. Reactivation rate = returned cases in that cohort / opened cases. A future pause end is not overdue. An enrollment that is still `ACTIVE` after the pause end is not eligible.

## Campaign cost

Cost per lead = `budget_amount / cohort new leads` only when the selected campaign has `budget_amount > 0` and the lead count is greater than zero. Cost per acquisition uses won cohort leads the same way. Campaigns with a null budget stay unlabeled as cost.

## Filters

Month or custom period, branch, campaign, source, owner, and program interest are applied inside the funnel functions. A branch the caller cannot view contributes nothing, even if the branch id is supplied.
