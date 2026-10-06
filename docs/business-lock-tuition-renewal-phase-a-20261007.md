# Tuition Renewal Phase A Business Lock — 2026-10-07

Status: **ACCEPTED / LOCKED**

This document freezes the already-proven beginning of the VIBE tuition-renewal flow. Future changes must preserve these invariants unless the owner explicitly reopens the decision.

## Locked accepted path

1. New tuition renewal reminder uses ZBS template **645192**.
2. Parent selects **Tiếp tục học**.
3. The Vietnam gateway receives the callback and durably forwards it.
4. The application verifies the Zalo webhook signature before processing.
5. Provider capitalization aliases are canonicalized to **CONTINUE**.
6. Duplicate callbacks are idempotent and must not create duplicate business state.
7. A CONTINUE response may open exactly one tuition renewal case for the reminder.
8. That case may reference exactly one invoice.
9. The default automatic renewal contract is **VIBE_3_MONTHS + DEPOSIT_50**.
10. A click, ZBS send, checkout creation, browser redirect, or callback is **never a payment**.

Observed staging acceptance fixture:
- student: TEST-ZALO-E2E-02
- invoice: INV-2026-000108

The fixture is evidence only. Production must not depend on this specific record.

## Remaining production path

The remaining path is:

CONTINUE
→ renewal case/invoice
→ PayOS checkout creation
→ persist payment_link_id / checkout
→ send ZBS 645028
→ AWAITING_PAYMENT
→ verified PayOS webhook
→ POSTED finance payment
→ allocation to the invoice
→ DEPOSIT_PAID or PAID

## Production-only gates

- PayOS webhook processing is explicitly enabled with `PAYOS_WEBHOOK_ENABLED=true`; default is fail-closed.
- Only a valid PayOS signature and matching order/link/amount may post payment.
- A 50% option ends in `DEPOSIT_PAID`; full payment ends in `PAID`.
- Retry/idempotency must never create a second renewal case, invoice, PayOS order, 645028 notice, or finance payment.
- Provider failures must expose only sanitized diagnostic codes/descriptions and must not log credentials.
- Production deployment must use the production Supabase project and production application origin; staging database URLs must not be copied into production.
