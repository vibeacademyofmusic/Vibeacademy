# VIBE Academy — Legacy Migration V1 Summary

Status: APPROVED

## Core Migration Principle

Import the trusted current/opening state at cutover.

Do not fabricate historical records.

## Canonical Rules

1. `enrollment.started_at` is the only activation anchor.
2. Do not use `enrolled_at` as fallback.
3. Current Grade becomes migration baseline.
4. Do not fabricate PASS records for earlier Grades.
5. Migration must be idempotent.
6. Business key:
   `(source_system, source_entity_type, source_reference)`
7. Each student migration is an atomic unit.
8. Batch processing should be resumable/chunked.
9. Dry-run must not write to business tables.
10. Opening financial state must reconcile 100%.

## Opening Finance

Use opening-state semantics such as:

- OPENING_RECEIVABLE
- OPENING_SETTLEMENT

Opening payments/settlements may reduce receivables but must not inflate post-cutover cash received or revenue forecast.

## Reconciliation

Required:
- student counts
- branch counts
- academic baseline
- tuition totals
- opening paid totals
- outstanding debt
- currency totals

Tolerance:
- counts: 0 difference
- VND: 0 đồng difference

Unexplained mismatch blocks sign-off.

## Rollback

Safe rollback is only allowed before post-cutover activity exists.

After post-cutover activity:
use correction/reversal workflow rather than destructive deletion.

## Security

Migration actions must use explicit permissions for:
- upload
- validate
- review
- import
- rollback
- sign-off

## Source Specification

See:
`VIBE_Legacy_Student_Migration_Specification_V1.docx`
