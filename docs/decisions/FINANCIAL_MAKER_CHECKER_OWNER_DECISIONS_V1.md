# Financial maker-checker — owner decisions V1

Status: OWNER_APPROVED (implementation pending)
Approved: 2026-09-16, Master Execution Plan V3.

## Required separation

Refunds, payment voids, payroll approval/finalization, sensitive financial
corrections, manual debt adjustments and finalized-record corrections/reversals
require maker-checker control. A maker cannot approve their own request.
A different FINANCE user may approve when their active assignment, action
permission and branch scope permit it. BRANCH_ADMIN cannot approve refunds or
payment voids, or finalize payroll. There is no monetary threshold in V1.

The payroll generator/maker cannot be the final approver. Approval permissions
must remain separate from preparation permissions; a read grant is not an
approval grant.

## Emergency override

An active, authorized SUPER_ADMIN may explicitly use an emergency override.
It requires a reason, override_type, performed_by, performed_at, before/after
snapshots and a dedicated audit event. Ordinary self-approval is not an override.
An override cannot change finalized source records in place or bypass existing
correction/reversal invariants.

## Implementation boundaries

Use existing ledger calculations and immutable payroll history. Reuse existing
audit infrastructure where applicable. Protect legacy RPC entry points as well
as new approval workflows; a UI-only approval is insufficient.

Production database/data changes remain on HOLD. Local and explicitly targeted
staging implementation and rehearsal are authorized under Master Plan V3.

This decision supersedes the pending maker-checker threshold/override decision
noted in the earlier staging rehearsal report. It does not certify the new
workflow as implemented or tested.
