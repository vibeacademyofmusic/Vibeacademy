# Phase 9 implementation plan

Production HOLD. Local only. Reuse canonical tuition reminder windows and report
approval state; do not post finance or change reminder status to pretend delivery.

1. Append-only audit + protected queue with recipient account, channel, immutable
   template/payload/entity/idempotency key, attempt lease and provider receipt.
2. Explicit admin enqueue for existing source entities. Template payloads are
   generic, server-authored notices linking to authenticated pages, never private
   notes, amounts or grades. Resolve linked recipients with active roles/relations.
3. IN_APP delivery commits an inbox item atomically. EMAIL/ZALO adapters remain
   unconfigured, fail closed; mock delivery is explicitly marked MOCK and absent
   from real inbox. No external send or scheduler deployment.
4. Retry reuses the same job/idempotency key; provider contract requires durable
   idempotency. Lease recovery cannot accept stale acknowledgements.
5. Admin queue filters/retry/cancel/generate/deliver-IN_APP and own inbox. Test
   authorization, source eligibility, duplicate/retry/failure/receipt semantics.
6. Full local validations and clean local commit before Phase 10.
