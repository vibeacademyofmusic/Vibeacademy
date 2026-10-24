# Notification and Zalo outbound preflight V1

Status: foundation only. No Zalo message is sent. No access token, refresh token, or app secret is stored.

## What already exists

`notification_jobs` is the outbox. `notification_events` is the audit trail. `notification_inbox` is the delivered in-app mailbox. Channels are already `IN_APP`, `EMAIL`, and `ZALO`.

Existing fields cover channel, template key, payload, status, attempts, provider receipt, error code, and timestamps. `PENDING` is the queued state for the current in-app worker. `SENT` requires `sent_at` and a provider receipt. `SENT` is not delivery.

`enqueue_notification_event` already creates portal notices for onboarding, tuition reminders, approved learning reports, schedule changes, attendance, and feedback. It addresses a portal profile. It does not know a Zalo user.

`claim_notification` leases only `PENDING` jobs. `complete_notification` can mark those jobs sent or failed. Live Zalo and email providers are not configured. `customer_channel_links` is the Zalo identity record. An active link has `provider = ZALO`, a provider user id, and consent timestamps.

Payment authority is a posted `payments` row allocated onto an issued invoice until `invoice_receivables.receivable_status` is `PAID`. Registration completion is `registration_applications.status = COMPLETED`. Class assignment is a committed `student_placement_events` row of type `CLASS_ASSIGNED` with the placement `SCHEDULED`. A learning report is family-facing only at `PUBLISHED`, after approval has frozen the snapshot.

## Classification

| Piece | Decision |
| --- | --- |
| `notification_jobs` | REUSE. Do not add a second outbox. |
| `notification_events` | REUSE for created, retry, cancel, and outbound results. |
| `PENDING` | REUSE as the in-app queue. New Zalo jobs use `QUEUED` so the current worker does not claim them. |
| `PROCESSING`, `SENT`, `FAILED`, `CANCELLED` | REUSE. |
| `DELIVERED`, `RETRYING`, `SKIPPED_NO_CHANNEL` | EXTEND. `DELIVERED` is separate from `SENT`. |
| `provider_receipt` | REUSE as the provider confirmation. `provider_message_id` is the future Zalo message id and stays empty while sending is off. |
| `attempts`, `error_code`, `sent_at`, `created_at` | REUSE for attempt count, last error, send time, and creation time. |
| `next_attempt_at`, `channel_link_id`, recipient subject | EXTEND. |
| `notification_templates` | CREATE. Provider template ids stay null. |
| Domain hooks for payment, registration, placement, and published reports | CREATE as triggers that call `enqueue_domain_notification`. |
| `FIRST_CLASS_UPCOMING`, `COURSE_EXPIRING`, and a new automatic tuition or schedule sender | Not created. The names are accepted and return no job until one source of truth is wired. Existing tuition and schedule notices stay on the older portal function. |
| Zalo network sender | Not created. `sendZaloTemplateMessage` returns `ZALO_OUTBOUND_NOT_CONFIGURED`. |

## Recipient rule

A Zalo job resolves only an `ACTIVE` `customer_channel_links` row for the registration, parent, or student on the source record. No phone number, email address, or student-name match is used. When no active link exists, the business change still commits and the job is `SKIPPED_NO_CHANNEL`.
