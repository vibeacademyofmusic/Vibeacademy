# Business / CRM data model V1

Sprint 2 shipped the new-customer lead foundation in `20260922180000_crm_lead_foundation_v1.sql`. Later local migrations add conversion review, campaigns, reactivation, instrument-customer care, and the business snapshot.

Business time is `Asia/Ho_Chi_Minh`. Status values stay English in the database.

## Left unchanged

- `students`, `parents`, `profiles`, and `student_parents` remain the identity records. `parents` still has no name or phone.
- `student_retention_alerts` remains the attendance retention queue.
- `customer_credits` remains a financial balance.
- Instrument sales remain `instrument_events` with `kind = 'SALE'`.
- `invoice_items.item_type` remains `TUITION` only.

## crm_leads

A prospective household. `converted_at`, `converted_student_id`, and `converted_parent_id` are written only by `review_crm_lead_conversion` after `WON`.

Columns: `id`, `branch_id`, `status`, `full_name`, `phone`, `email`, `phone_key`, `email_key`, `parent_name`, `student_name`, `student_date_of_birth`, `program_interest`, `instrument_interest`, `source_type`, `owner_user_id`, `first_contact_at`, `last_contact_at`, `next_follow_up_on`, `lost_reason`, the unused conversion columns, `version`, `created_by`, `created_at`, `updated_at`.

`campaign_id` is nullable and points at `crm_campaigns`. `external_source`, `external_lead_id`, `campaign_reference`, and `received_at` are optional and are not backfilled. Phone and email are not unique. The display value is stored as entered, after trimming. `phone_key` keeps digits only. `email_key` is lowercase and trimmed. At least one of `full_name`, `phone_key`, `email_key`, `parent_name`, or `student_name` is required. `version` is a positive integer. `lost_reason` is required when `status` is `LOST`.

`source_type` is `MANUAL`, `WALK_IN`, `REFERRAL`, `WEBSITE`, `ZALO`, `PHONE`, or `OTHER`.

Statuses: `NEW`, `CONTACTED`, `QUALIFIED`, `TRIAL_BOOKED`, `TRIAL_COMPLETED`, `PROPOSAL_SENT`, `NEGOTIATING`, `WON`, `LOST`.

Allowed moves are only the next step, or `LOST` from any status before `WON` or `LOST`:

- `NEW` → `CONTACTED` or `LOST`
- `CONTACTED` → `QUALIFIED` or `LOST`
- `QUALIFIED` → `TRIAL_BOOKED` or `LOST`
- `TRIAL_BOOKED` → `TRIAL_COMPLETED` or `LOST`
- `TRIAL_COMPLETED` → `PROPOSAL_SENT` or `LOST`
- `PROPOSAL_SENT` → `NEGOTIATING` or `LOST`
- `NEGOTIATING` → `WON` or `LOST`

`WON` and `LOST` are terminal. Clients cannot update `status` on the table. `transition_crm_lead` is the only status writer.

## Conversion review

`crm_lead_conversion_reviews` records `PENDING`, `LINKED`, or `BLOCKED`. `review_crm_lead_conversion` runs only after `WON`. `LINKED` stores an existing `students` id and may attach an existing `parents` id through `student_parents`. It does not create a student, parent, or enrollment. A name plus date of birth is the strong match. Any other explicit student requires a review note. A conflicting name and date of birth is rejected. Phone and email are not match keys. `crm_lead_match_candidates` returns that strong match only.

Event types added for this step: `CONVERSION_REVIEWED`, `CONVERTED`.

## crm_lead_events

Append-only history. Columns: `id`, `lead_id`, `event_type`, `from_status`, `to_status`, `actor_id`, `channel`, `note`, `metadata`, `created_at`.

Event types: `CREATED`, `UPDATED`, `ASSIGNED`, `CONTACTED`, `QUALIFIED`, `TRIAL_BOOKED`, `TRIAL_COMPLETED`, `PROPOSAL_SENT`, `NEGOTIATION_UPDATED`, `WON`, `LOST`, `NOTE_ADDED`, `FOLLOW_UP_SET`.

Entering `NEGOTIATING` writes `NEGOTIATION_UPDATED`. Assignment history is the `ASSIGNED` event. `metadata` stores `from_owner` and `to_owner`. There is no assignment table.

`channel` is `PHONE`, `ZALO`, `SMS`, `EMAIL`, `IN_PERSON`, or `OTHER`.

## RPCs

`create_crm_lead`, `update_crm_lead`, `assign_crm_lead`, `transition_crm_lead`, `add_crm_lead_note`, `set_crm_lead_follow_up`.

Create uses the request id as the lead id. Later actions use the request id as the event id. The same request and the same payload return the existing result. A reused request with a different payload raises `CRM_LEAD_REQUEST_MISMATCH`. Mutable actions require the current `version` and then increment it. A changed request with an old version raises `CRM_LEAD_STALE`.

## Indexes

- `crm_leads_branch_status_idx` on `(branch_id, status, created_at desc, id)`
- `crm_leads_owner_idx` on `(owner_user_id, status)` where an owner is set
- `crm_leads_follow_up_idx` on `(next_follow_up_on, id)` where a follow-up is set
- `crm_leads_phone_key_idx` and `crm_leads_email_key_idx` as partial search indexes
- `crm_lead_events_lead_idx` on `(lead_id, created_at desc, id)`
- `crm_leads_campaign_idx` on `campaign_id` where a campaign is set

## Campaigns

`20260922210000_crm_campaigns_v1.sql` adds `crm_campaigns`. A null `branch_id` is organization-wide and only a super admin can create or edit it. Branch campaigns use `crm.campaign.manage` on that branch. `budget_amount` and `currency` are both null or both present. A null or zero budget is not a cost. `set_crm_lead_campaign` attaches an active campaign without changing `source_type`.

`crm_cohort_funnel` counts leads created in the period and how far their events reached, including a win that happened later. `crm_activity_funnel` counts only the transition events whose timestamp falls in the period. The two populations are separate.

## Reactivation

`20260922220000_crm_reactivation_v1.sql` adds `crm_reactivation_cases` and `crm_reactivation_events`. This is not `student_retention_alerts`.

`refresh_crm_reactivation` opens a case only when:

- the student status is `INACTIVE`, the student has a branch, and there is no active enrollment; or
- an `ACTIVE` pause has `ends_on` before the current Ho Chi Minh date, the enrollment is `WITHDRAWN` or `COMPLETED`, and the student has no `ACTIVE` enrollment.

A pause whose `ends_on` is today or later does not open a case. An enrollment that is still `ACTIVE` after the pause end does not open a case. One non-returned case per student is kept, including `LOST` and `NOT_INTERESTED`, so a refresh does not reopen them. A later `ACTIVE` enrollment moves an open case to `RETURNED` and writes one `RETURNED` event. Grade is not stored because it is not a student column. The last teacher is not guessed when more than one active class teacher exists.

## Instrument customers

`20260922230000_instrument_customer_care_v1.sql` adds `instrument_sale_customer_links`, `instrument_warranty_cases`, `instrument_warranty_events`, and `instrument_customer_followups`. The link points at `instrument_events.movement_id` for a `SALE`. It does not copy serial, sale price, sale date, or `warranty_until`. A buyer can be an existing student, an existing parent, or a contact name without a login. The care list reads serial, price, and warranty from the sale and does not read acquisition cost or invoices.

## Business snapshot

`20260922240000_business_command_center_v1.sql` adds `crm_business_snapshot`. It aggregates the tables above for one branch, or every branch the caller can view when the branch argument is null. It does not write business data.
