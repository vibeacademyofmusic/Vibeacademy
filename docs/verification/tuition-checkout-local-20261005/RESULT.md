# Local tuition-renewal checkout — actual results, 2026-10-05

Authenticated Safari submission created, persisted and automatically opened a real payOS checkout in the same tab. Merchant VIBE ACADEMY, account holder LE KHOA DANG, amount 2,750,000 VND visually verified. No money transferred. Do not label the entire workflow unconditional PASS: clipboard verification remains incomplete.

## Scope

Verified port 3000: Node PID 807, cwd /Users/macbookair/vibe-academy-system, Next 16.3.3. Runtime database http://127.0.0.1:54321, Docker supabase_db_vibe-academy-system. Chrome and Safari showed authenticated Local Developer Admin / SUPER_ADMIN. Human signed in directly; no cookies copied or credentials changed. Existing uncommitted work preserved. These are local results, not deployed Preview evidence.

## Actual database and provider

Reminder dea2ce6f-b45c-4ebc-a91d-0c4d3c50702f, Vibe Academy Cần Thơ. VIBE_3_MONTHS, list price 5,500,000 VND, DEPOSIT_50, due 2,750,000 VND; starts 2026-11-01, invoice deadline 2026-10-31.

Before submission no renewal case, invoice or payOS order existed for this reminder. A matching SCHEDULED period already existed: 99f9ff5a-fe6d-4458-a77f-b756d6cb9be0, November 1–January 31, created October 2. The function rejected it with TUITION_RENEWAL_ALREADY_SCHEDULED. It was safely reused, not deleted, activated or duplicated.

- Renewal: 17ccbbe6-433b-4b28-9a0b-037bb5a6ad01, AWAITING_TEMPLATE, paid_amount=0.
- Invoice: fe7572bb-5114-4f29-8160-ff66999db35c, INV-2026-000347, ISSUED, total 5,500,000 VND.
- checkoutUrl: https://pay.payos.vn/web/6b73bf4a7b2e4be1bbdb1823c4988005
- paymentLinkId: 6b73bf4a7b2e4be1bbdb1823c4988005
- orderCode: 1790532932726; local/provider status PENDING.
- Signed provider GET: HTTP 200, signature verified; amount 2,750,000, paid 0, remaining 2,750,000, zero transactions. CreatedAt 2026-10-05T19:29:01+07:00; checkedAt 2026-10-05T12:30:41.924Z. Evidence: provider-actual.json.
- Provider expiry was not returned. Invoice deadline is not evidence of provider expiry.

Final read-only local SQL verified exactly one case and one order for this reminder, linked invoice above, zero payment allocations, unchanged source ACTIVE period and unchanged reused SCHEDULED period. No enrollment activation, payment posting or fabricated callback occurred.

## Code changes

renewal-actions.ts redirects after persisted canonical URL/order/amount validation instead of returning PAYMENT_TEMPLATE_REQUEST. Failures retain selected reminder. Granted has_permission with tuition.renewal.prepare checks branch authorization before provider/service operations. Price validation and SQL authorization remain. Notification/template status cannot withhold a persisted link.

renewal-payos.ts / payos/client.ts distinguish fresh creation from reconciliation. Existing links are reused. Retry and ambiguous POST outcomes reconcile the same order through signed GET without blind second POST. Wrong order/amount/signature, partial payments, terminal states and ambiguous lookup failures stay blocked. checkout-link.ts validates payment-link-bound canonical URLs.

page.tsx loads selected detail independently of list filters/pagination through RLS and retains selections. CheckoutLink.tsx adds Mở payOS, Sao chép liên kết, visible URL and accessible clipboard status/fallback with shared VIBE styles. Return/cancel URLs retain selected reminder.

Migration 20261005210000_tuition_reuse_matching_scheduled_term.sql was applied ONLY to the verified local Docker database in a targeted transaction recorded in local migration history. Enrollment lock and exact single unbilled SCHEDULED period checks preserve branch/plan/date/currency/price/no-discount requirements and reject existing linked invoice/renewal. Audit event SCHEDULED_TERM_REUSED records reuse. Original denial remains for mismatches. No permission change, manual function skipping, unrelated migration batch, shared database migration or deployment.

## Evidence

Affected regression tests: 36/36 PASS; typecheck, focused ESLint and whitespace checks PASS. Tests cover authorization denial before provider calls, pending-link reuse, notification failure, selected-case persistence errors, forged prices, canonical URLs, signed reconciliation and ambiguous creation outcomes. These are local/mock evidence.

New migration verified in a rolled-back local transaction: unauthorized denial, wrong plan denial, forged price denial, matching-period reuse, repeated invocation returning duplicate, unchanged period count and SCHEDULED status. Evidence: reconciliation-rollback-test.sql. This script tests the pre-creation fixture; do not rerun blindly against the now-created case. It is not a cleanup/reset procedure.

Actual Safari UI submission automatically opened payOS in the same tab; payos-actual.png shows VIBE ACADEMY and 2,750,000 VND. Back/reload retained invoice, zero paid amount, exact URL and both link actions despite AWAITING_TEMPLATE. Native accessibility verified selected plan/deposit/dates and authenticated actor. Rendered local detail matched existing white cards, navy typography and shared VIBE button styles. No unrelated redesign.

## Remaining limitations and next action

Sao chép liên kết is visible, but native clicks did not produce an observable success/failure result. User switched browser tabs during final verification; clipboard PASS is not claimed. Reopening the saved link using the new detail action was not independently completed after reload; automatic submission navigation and the actual payOS page were verified. Provider expiry is unavailable in the actual response. No checkout-generation blocker remains.

Owner next action: use this real paymentLinkId for template 645028 review. Do not pay the test order. No Zalo messages, staging/production writes, credential changes, permission changes or deployment performed.
