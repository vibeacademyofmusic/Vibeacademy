# Compensation and operational documents — local validation, 2026-09-17

Status: PARTIAL. Operational workflow and local automated gates verified; native A4 print-preview validation remains unverified. Do not promote this report to production readiness PASS.

## Scope

- Employee detail links to `/admin/employees/[id]/compensation`: identity/current assignment, existing employment-edit link, current effective rates, complete compensation history, attendance link, latest payroll records and payslips.
- MONTHLY amount, currency, date range and reason are saved through `configure_employee_compensation`, delegating to the existing employee/monthly RPC. PER_SESSION and HOURLY use the linked teacher and existing canonical RPCs. Branch and class type use selectors. No duplicate salary table, calculation engine, payout or authorization role introduced.
- New migration `20260917100000_operational_payroll_documents.sql`: nullable compensation reason for legacy rows, atomic operational wrapper, curated approved/finalized payslip projection. Applied only to localhost. No historical migration modified.
- Existing open-ended compensation rules still block overlapping additions. No historical rate is overwritten. Ending an open-ended rule is not introduced by this task; bounded rates can be followed by a new nonoverlapping rate. Legacy routes remain compatible and legacy reasons may be absent.
- Separate printable routes: `/documents/payslips/[id]`, `/documents/finance/{invoices,payments,refunds,credits}/[id]`. Admin, Finance and employee own-payroll screens link to relevant documents. Parent/student financial portal scope is not expanded.

## Document semantics

Payslip uses approved/finalized earning lines and adjustments, preserved rates, required/payable minutes and attendance ratio. Positive/negative amounts are itemized and reconciled against the canonical payroll total before rendering; a mismatch refuses display. No current compensation query recalculates historical salary. Employee code is the existing immutable code; name is payroll's saved name. Branch and approver use stable internal references where no historical display-name snapshot exists. Adjustments include only the fields already visible through payroll self-read; private attendance source payloads are omitted. Finalized correction runs remain distinct from the immutable original payslip.

Invoice uses existing number, item amounts, locked tuition discount and `invoice_receivables` current paid/outstanding values. Engine subtotal is already after discount and is labelled accordingly, avoiding double subtraction. Current student labels are explanatory, not newly issued identity snapshots; parent/customer names are not fabricated if unavailable in the established read contract.

Receipt uses existing payment number, original amount, method/reference, recorder and allocation history, with current linked-invoice balances. VOIDED status does not rewrite original amount/history. Opening-debt details remain available through the existing operations screen; invoice balances on the receipt are not presented as total customer debt.

Refund uses existing number and posted maker-checker record. Historical refunds without accessible approval metadata explicitly say it is unavailable; no maker/checker is invented. Credit statements read canonical balances and full use history, retaining references to reversed refunds. Unapplied credit is not revenue.

No numbering engine added: existing invoice/payment/refund numbers reused; full UUID is stable V1 payslip/credit reference. Friendly payroll numbering deferred pending a convention.

## Security

- Payslip RPC requires active account and APPROVED/FINALIZED period, then existing SUPER_ADMIN / scoped FINANCE payroll.view / employee-own / teacher-own predicates. It does not rely on period access alone.
- Finance documents require existing Finance/Admin entry gate and session-bound Supabase RLS. No service-role client, public document link, mutation, or portal salary exposure.
- Compensation action requires existing admin guard; wrapper rechecks role and delegates overlap/recipient/date resolution to canonical engine. Historical updates are not exposed.
- Refund/void/credit links lead to existing workflows. No new approval bypass.
- Two previously authorized synthetic local admins were temporarily reactivated for browser maker/checker verification; both were locked and profile/role deactivated afterwards. Temporary credential removed. No real accounts or cloud Auth changed.

## Evidence

Browser localhost synthetic employee VIBE-ST-0001, July 2026:

1. Added 12,000,000 VND MONTHLY rule with July 1–31 effective dates and audit reason from employee compensation UI.
2. Generation correctly refused missing approved attendance. Fixture was completed through canonical request/review RPCs (the initial fixture accidentally filtered REQUIRED instead of canonical SCHEDULED; no engine change).
3. Browser generation => REVIEW => independent APPROVED => FINALIZED PASS. Required/payable 12,060/12,060 minutes, 100%, net 12,000,000 VND. Finalized screen disables regeneration/financial edits.
4. Payslip displays immutable earning rate, approval/finalization evidence and exact total. Local synthetic records retained with audit.
5. Invoice INV-2026-000042: total/outstanding 4,500,000 VND.
6. Receipt PAY-2026-000047: original 600,000 VND retained while VOIDED, with reversal status and invoice balances.
7. Refund REF-2026-000204: 200,000 VND, maker/checker and dates displayed, status VOIDED.
8. Credit: original 1,000,000; applied 400,000; refunded current 0 after reversal; remaining 600,000 VND. History preserves original 200,000 refund reference.
9. Desktop 1440×1000 and mobile 390×844 document checks: no page overflow after correcting document shell width. Compensation page mobile also 390/390. Console error log empty.

Print/PDF: canonical HTML uses `window.print()`, A4/15mm print CSS, repeating table headers, hidden action controls, standalone shell without admin sidebar, wrapping table columns. Browser Save as PDF is the intended export; no generated PDF file is claimed. Clicking Print in the in-app browser did not expose a native preview. Native Codex UI access was unavailable and Chrome browser provider was unavailable. Actual A4 pagination/preview and saved-PDF visual inspection remain PENDING. CSS checks and on-screen desktop/mobile checks do not replace this gate.

Automated final totals are recorded below after the last run. Added tests exercise rate wrapper, overlap, historical payslip stability, own approved/finalized access, unrelated/inactive/cross-branch/anonymous denial, rendering, accounting totals and print-shell rules. Existing full suite retains effective-date hourly/session resolution, immutable finalized data, refund maker-checker, allocation/reversal and customer-credit reconciliation coverage.

## Limits and deferred integrations

- Native A4/Save as PDF verification still required before task PASS.
- No server PDF generation, bank transfer, tax/statutory engine, general ledger or government e-invoice integration.
- HOURLY/PER_SESSION require a linked teacher; arbitrary nonteaching employee hourly/session payroll was not invented.
- Historical references are used where immutable human-name snapshots are absent. No rewriting of old payroll/finance facts.
- No new delegated HR permission. Existing Super Admin compensation authority retained.
- Build verification uses webpack as at the previous checkpoint; default Turbopack was previously environment-blocked and is not certified by this report.
- Local schema now 95 migrations. Last observed cloud counts remain staging 59, production 28; this new migration adds one to each previously documented gap (inferred 36/67, not a new cloud audit). Staging batch approval and broader preproduction blockers remain unresolved. Production HOLD; no push/deploy/cloud migration performed.

## Final local quality gates

- Full pgTAP: **59 files / 1,563 assertions PASS** (20 additional assertions versus the preceding 1,543 baseline).
- Full application/bootstrap: **295 tests PASS**, zero failures/skips (14 new document/compensation tests).
- Production build using `npm run build -- --webpack`: **PASS**.
- Whole repository ESLint: **PASS**.
- `git diff --check`: **PASS**.
- Local ledger: **95** verified. Finalized synthetic payroll lines 12,000,000 VND vs header 12,000,000 VND: **difference 0 VND**.
- Cleanup query: **2/2** synthetic accounts banned, profiles inactive, SUPER_ADMIN assignments inactive; credential file removed.
- Native A4 preview: **NOT VERIFIED**, so overall task remains **PARTIAL**, not a completed print/release gate. No production actions follow this checkpoint.
