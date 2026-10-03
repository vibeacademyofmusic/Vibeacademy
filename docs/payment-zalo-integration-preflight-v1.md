# Payment and Zalo integration preflight V1

Status: read-only. No provider was connected. No secret was added. No remote call was made.

## Answers

1. Authoritative proof that tuition is paid is a posted `payments` row whose amount is allocated to an issued invoice through `payment_allocations`. `invoice_receivables.outstanding_balance` is then zero and its derived state is `PAID`. `registration_applications.payment_confirmed_at` is a completion timestamp written only when that receivable is settled. It is not itself the cash ledger.

2. `invoice_receivables` is a view. Outstanding balance is `greatest(invoice.total_amount - allocated_amount, 0)` for the invoice. Draft and cancelled invoices keep their own labels. An issued invoice with a zero balance is `PAID`. A past due date with a remaining balance is `OVERDUE`. A partial allocation is `PARTIALLY_PAID`.

3. `create_payment_once` is the idempotent entry point. It calls `create_payment`. Applying that cash to an invoice is a second call, `allocate_payment_to_invoice`. Both currently require `SUPER_ADMIN`.

4. `payment_entry_requests.request_id` is the idempotency key. The function takes an advisory transaction lock, returns the existing payment when the key and payload match, and rejects the same key with a different payload. `payment_allocations` also rejects a second allocation of the same payment to the same invoice.

5. A provider webhook cannot safely call `create_payment_once` as the provider. That function checks the signed-in super admin. There is no webhook route. A future webhook must verify the signature on the server, then call a new definer RPC that posts cash without trusting the browser user.

6. A registration points at `registration_applications.invoice_id`. Completion calls `registration_invoice_settled`, which is true only when `invoice_receivables` shows that invoice as `ISSUED` with outstanding balance zero. No invoice means no payment confirmation. An attached unsettled invoice blocks completion.

7. Learning reports move `DRAFT` → `READY_FOR_REVIEW` → `APPROVED` → `PUBLISHED`. Approval freezes `snapshot_data`, `approved_at`, and `approved_by`. Publish sets `PUBLISHED` and `sent_at` without rewriting that snapshot. The family-facing moment is `PUBLISHED`, not `APPROVED`.

8. Yes. `notification_jobs` is the outbox, with `notification_events` for the audit trail and `notification_inbox` for delivered in-app rows. Channels are already `IN_APP`, `EMAIL`, and `ZALO`. Statuses are `PENDING`, `PROCESSING`, `SENT`, `FAILED`, and `CANCELLED`. `SENT` requires `sent_at` and a provider receipt. There is no separate `DELIVERED` state.

9. Yes, as a library and SQL lease, not as a running hosted worker. `claim_notification` leases a pending job for five minutes. `complete_notification` records a receipt or a closed error code. `manage_notification` can retry a failed or expired lease, or cancel a pending or failed job. `lib/notifications/worker.ts` dispatches one claimed job through a provider adapter. Live Zalo and email providers are not configured. The admin screen says so, and the report page disables Send Zalo.

10. No safe automatic link exists. Parent phone on a registration application is contact data, not proof of a Zalo account. Students and parents become portal users only when `students.user_id` or `parents.user_id` is set. Zalo must be an explicit link to that person.

11. Link metadata belongs in a new customer-channel table keyed by the VIBE profile or parent/student account, not in `notification_jobs` and not beside access tokens. Tokens stay in server environment variables.

12. The outbox can already emit `ONBOARDING`, `TUITION_REMINDER`, `LEARNING_REPORT`, `SCHEDULE_CHANGED`, `ATTENDANCE_NOTICE`, and `FEEDBACK_FOLLOW_UP`. Registration submitted, payment confirmed, registration completed, class assigned, and first class upcoming are not events yet.

13. Cash stays in `payments` and `payment_allocations`. Receivable state stays in `invoice_receivables`. Registration progress stays in `registration_applications`. Class membership stays in `enrollments`. Report content stays in `learning_reports`. Notification delivery stays in `notification_jobs`. A failed Zalo send must not roll any of those back.

## Provider adapter

Add `payment_provider_transactions` rather than overloading `payments`. One row per provider attempt:

- internal id
- provider code
- provider transaction id, unique per provider
- registration or invoice reference
- requested amount and currency
- status: `REQUESTED`, `WEBHOOK_RECEIVED`, `VERIFIED`, `POSTED`, `REJECTED`
- verified amount, reference, and signature timestamp
- resulting `payments.id` once posted
- raw provider reference stored for audit, without secrets

Flow: create the request, receive the webhook, verify signature, amount, currency, and reference, enforce the provider transaction id, call the internal post RPC, then set `POSTED`. A QR display and a browser return URL never enter `VERIFIED`.

`PAYMENT_CONFIRMED` is the domain event after `payments` and the allocation exist. Registration completion may then proceed through the existing complete RPC. Notification enqueue happens after that commit. If enqueue fails, the payment remains.

## Notification design

Reuse `notification_jobs`. Do not add a second outbox. Extend it only where the current model is short:

- templates can remain `template_key` until a template table is actually needed
- add `DELIVERED` only when a provider can prove delivery; do not treat `SENT` as delivered
- add registration and placement event names beside the current six
- payload stays a title and an authenticated portal path, not a tuition amount or report body

Suggested next events, each pointing at the existing source row:

| Event | Source of truth |
| --- | --- |
| `REGISTRATION_SUBMITTED` | registration status `SUBMITTED` |
| `PAYMENT_CONFIRMED` | posted payment allocated to the registration invoice |
| `REGISTRATION_COMPLETED` | registration status `COMPLETED` |
| `CLASS_ASSIGNED` | placement event `CLASS_ASSIGNED` |
| `FIRST_CLASS_UPCOMING` | enrollment `started_at` and the class schedule |
| `SCHEDULE_CHANGED` | already an occurrence revision |
| `LEARNING_REPORT_PUBLISHED` | report status `PUBLISHED` |
| `TUITION_REMINDER` | existing tuition reminder row |
| `END_OF_COURSE_REPORT_PUBLISHED` | published end-of-course report |

## Zalo identity

A link row, not a phone guess:

- person reference: `profiles.id` of the parent or student account
- provider = `ZALO`
- `provider_user_id`
- `linked_at`, `consent_at`, consent version and source
- status: `PENDING`, `ACTIVE`, `REVOKED`
- `last_verified_at`

No access token on that row. Provider credentials stay in server environment variables, following the existing `NEXT_PUBLIC_*` public-config split: anything secret is server-only and never `NEXT_PUBLIC_`.

## Next migrations and RPCs

1. `payment_provider_transactions` plus `post_verified_provider_payment`, callable only by a server secret path, which writes `create_payment` and `allocate_payment_to_invoice` and is idempotent on the provider transaction id.
2. Webhook route that verifies a signature and calls that RPC. No live provider in that migration.
3. `customer_channel_links` for Zalo consent.
4. Extend `enqueue_notification_event` with the registration and placement events, still super-admin or a definer called after the domain commit.
5. Optional `DELIVERED` status when a real receipt type exists.

Do not connect live Zalo or ZaloPay in that work.
