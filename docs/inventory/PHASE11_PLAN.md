# Phase 11 — inventory ledger

Production HOLD. Local implementation only; no push. CRM conversion remains
deferred pending the trial/LOST decision, per unattended execution authorization.

Use an append-only quantity ledger, not a mutable stock field. One movement
transaction records receipt, outbound, paired transfer or signed adjustment.
Request UUID plus exact payload comparison prevents duplicate postings and
rejects accidental reuse for another operation. Serialize writes by item to
prevent concurrent overdrafts, including transfers. Reject negative stock.
Corrections use new reasoned adjustments; posted history is immutable.

Use existing ACTIVE account/permission helpers. Introduce inventory view/manage
permission codes without assigning them to existing non-admin roles. Global
SUPER_ADMIN inherits through the canonical helper. Branch-scoped callers must
hold the permission at both ends of a transfer. Catalogue maintenance is global
SUPER_ADMIN only. No sales revenue, invoices, payments, tax, costing or finance
posting is inferred from a stock movement. Monetary sales are a separate scope.

Admin UI: catalogue, branch balances, item history, receipt/outbound/transfer/
adjustment forms and month reconciliation in Vietnam time. Bounded reads and
explicit errors. Monthly opening + inbound - outbound = closing.

Validate quantities, missing/inactive references, immutable history, idempotency,
stock underflow, paired transfers, branch denial, inactive/expired accounts,
monthly reconciliation, rollback and concurrent withdrawals. Then all database
and application tests, build, relevant lint, diff/secret review and browser
desktop/mobile. Only commit a phase after these gates pass.
