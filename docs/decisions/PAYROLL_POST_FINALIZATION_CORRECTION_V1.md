# Payroll post-finalization correction

Status: OWNER_APPROVED — 2026-09-16.

Default: record the delta as a CORRECTION earning/adjustment in the next OPEN
payroll period. Link the original finalized payroll and original earning or
adjustment line where applicable. Store reason, original/corrected amounts,
delta, maker, checker and timestamps. Never mutate the finalized source.

Urgent exception: an audited OFF-CYCLE CORRECTION RUN linked to that source,
with maker-checker and full audit. Off-cycle is not an automatic approval or
an instruction to reopen a finalized payroll.

Implementation mapping: existing regular periods are open while DRAFT,
GENERATED or REVIEW. A normal correction is posted only once its target period
has generated payroll (GENERATED/REVIEW); it cannot be lost to regeneration.
The earliest existing open period after the original period is the destination.
If none exists, the caller must create the next period first. Repeated corrections
retain the immutable original amount and deduct previously posted deltas, avoiding
double correction. Pending approvals are revalidated before posting.

Production database/data remains HOLD.
