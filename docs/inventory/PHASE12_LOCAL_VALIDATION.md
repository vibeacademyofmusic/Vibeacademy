# Phase 12 — serialized instrument V1 local validation

2026-09-16. Local supported scope PASS; production HOLD. No push/deploy/cloud
mutation. Instrument movements reuse the canonical Phase 11 quantity ledger.

## Model and protection

Instrument model extends an inventory item with brand/model. Individual serials
are unique within the model and link to supplier, acquisition cost, asking price
and currency in a separate protected commercial table. Instrument receipt,
transfer and sale events link one-to-one to inventory movements. A deferred FK
allows atomic serial evidence + canonical stock posting. Generic movement calls
cannot bypass the serial workflow. Per-item serialization prevents competing
serial dispositions. Retry checks the complete payload and original actor.

Only existing global ACTIVE SUPER_ADMIN has commercial access in V1. No new
staff grants. All direct client/service writes revoked; RLS restricts reads;
immutable events and acquisition metadata. Sold units cannot be sold/transferred
again. Warranty is an explicit optional end date, never an inferred duration.

## Validation

- pgTAP: **52 files / 1,309 PASS**; serialized tests **26 PASS**.
- Application/bootstrap: **196 PASS**, including 5 new instrument action tests.
- Build and relevant ESLint: PASS. Diff check and staged secret review required
  before commit; no credentials are stored in repository files.
- Browser local: create synthetic model; receive `LOCAL-SERIAL-001`, cost
  1,000,000 VND / asking 1,500,000 VND; transfer to a second synthetic branch;
  record stock sale at 1,400,000 VND with explicit 2027-09-16 warranty end.
  Location followed actual transfer; sale showed sold/out-of-stock and removed
  further mutation controls. All three events remained visible.
- Desktop 1440×900 and mobile 390×844 inspected. Mobile document width 390;
  no horizontal overflow; browser console errors absent.
- Database readback: three serial events and canonical aggregate stock zero.
- Local migration count **84**, latest `20260916223000`.

## Scope and limitations

This is serialized stock/sales-history evidence, **not a checkout/accounting
engine**. No invoice, payment, cash or revenue entry is posted. UI explicitly
states that recording sale does not mean payment received. Integration into an
approved instrument billing workflow, returns, repairs and commercial corrections
are not provided by this V1; immutable historical fields cannot be edited to
simulate those operations. No automatic warranty duration or exchange-rate rule.
Serial uniqueness is per model; no claim of globally unique manufacturer serials.

Model/serial/history reads are paginated at 25; branch selection bounded to 500.
Temporary synthetic admin is reused within authorized localhost testing only;
credential remains outside repository with mode 0600 until browser work cleanup.
Synthetic history is retained as local audit evidence; do not delete ledger rows.
Recovery: hide route/revoke access while retaining posted evidence; never drop
populated ledger tables as an application rollback.
