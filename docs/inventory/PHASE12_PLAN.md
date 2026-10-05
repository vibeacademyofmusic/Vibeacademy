# Phase 12 — serialized instruments

Extend the Phase 11 quantity ledger; no second inventory balance engine.
Each instrument has an inventory item, serial, brand/model and supplier reference.
Serial movement links trace receipt, transfer and outbound/sale on the same ledger.
Generic stock posting must reject serialized items unless a matching serial link
is present in the transaction. Quantity is one per serial; location derives from
the last committed serial movement. Serialize writes using the existing item lock.

Acquisition cost, asking price and sale metadata are SUPER_ADMIN-only in V1; do
not broaden current staff permissions. No accounting revenue/cash/tax postings or
bank integration. A sale record is stock-disposal evidence, not a paid invoice.
Store an explicit warranty end date when provided; do not invent a warranty term.

Create/read instrument and post transfer/sale through protected atomic RPCs with
request identity and payload equality. Preserve history, reject double sale and
negative stock, and reject generic adjustments of serial stock without serial
evidence. Invalid operations roll back both serial metadata and ledger entries.
Tests cover traceability, bypass prevention, duplicate safety, cost visibility,
sale/transfer reconciliation and expired/inactive access. Browser desktop/mobile,
full tests, build/lint/diff and secret review before local commit.
