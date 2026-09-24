# MoMo deposit registration — staging gate

## Business rule

The tuition quote uses the active tuition plan price for the application branch, snapshotted in VND. The deposit threshold is `ceil(tuition_amount / 2)` in whole VND. Separate exact-amount MoMo orders may pay the remaining deposit. A signed MoMo IPN with `resultCode = 0` is required for each order. A partial deposit keeps the application pending. Only the transaction reaching the threshold can complete registration; a possible duplicate identity remains paid but requires staff review.

`registration_momo_orders` is the pre-admission receipt source. On completion each paid order is mirrored once to `payments` with `finance_payment_id` and the MoMo transaction reference. Do not create a second manual payment for the same transaction. The remaining tuition is `tuition_amount - sum(paid MoMo orders)`. Once a class and enrollment exist, finance must reconcile these receipts against the issued tuition invoice; this allocation workflow is **not yet automated** and must be verified before financial rollout.

After any successful partial deposit, cancellation/rejection/expiry is blocked at the database boundary. Finance must first establish and implement a documented refund or credit procedure; this change does not perform refunds. A failed or ambiguous MoMo create response can leave a reserved order, so staff must inspect the provider order before retrying. No browser redirect counts as proof of payment.

## Required staging configuration

- `MOMO_ENV=test` — the create action intentionally rejects any other value.
- `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY` — MoMo **test merchant** credentials. Never use personal wallet QR or expose these in the browser.
- `MOMO_PUBLIC_ORIGIN` — public HTTPS staging origin registered with MoMo; no trailing slash. MoMo sends IPN to `/api/integrations/momo/ipn`.
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — existing backend configuration; service key only on server.

Do not configure production credentials or enable the Zalo sender from this change. The approved ZBS template ID is 640377, but the outbound sender remains disabled pending real OA credentials, recipient eligibility and a controlled test.

## Test sequence

1. Apply migrations to isolated staging and run `registration_momo_deposit_test.sql` and the existing registration/security tests. Review any historical completed applications and quote prices.
2. Create a registration, submit and verify identity. Choose an active tuition plan with an active branch price. Confirm the 50% threshold and that no student exists yet.
3. Create a MoMo test order below the threshold. Pay with a MoMo test wallet and verify signed IPN, partial status, no student and no Zalo dispatch.
4. Create an order for the remaining deposit. Verify exactly one student code, one waiting placement, one finance payment per MoMo transaction, and one registration notification job. Replay both IPNs.
5. Test a suspected duplicate name/date of birth. Keep the received deposit and flag for staff review; manually link the confirmed identity, then confirm receipts are mirrored once.
6. Test forged HMAC, wrong partner/order/request/amount, nonzero/9000 result codes, concurrent callbacks, timeout and retry. Compare MoMo transaction IDs with internal receipts.

## Incomplete gates

- No MoMo test merchant keys were available here. Neither a real checkout nor an end-to-end IPN has been exercised.
- Database tests require a running isolated Supabase/Postgres instance and were not run in this workspace.
- Production MoMo QR/deeplink permissions and settlement account must be confirmed with MoMo. The personal wallet screenshot is not merchant access.
- Automatic invoice allocation, refund/chargeback reconciliation, discount approval and Zalo API delivery remain separate gates. Do not describe an unallocated deposit as a settled tuition invoice or a queued notification as delivered.
