# Staging migration pilot — execution worksheet

2026-09-17. **PENDING; not executed.** Target `owpfqwdrmyzcmjahehek` only.
Staging upgrade is blocked on exact batch approval. No Production import.

## Required source gates

No 20–30-row de-identified representative source package or signed control totals
was found in the repository. Synthetic data cannot substitute for representative
source evidence. Owner/source steward must supply the approved de-identified source,
unit/class/curriculum/Grade mapping and expected totals. No extraction of production
legacy data is authorized here. Keep source files outside Git with restricted access.

## Three runs

1. Ten synthetic rows for one test unit: valid active student, higher starting Grade,
   fully paid opening, partially paid opening, unpaid opening, missing class,
   invalid date, duplicate source key, unresolved identity, paused/expired state.
   Assign approved fixture-specific expected outcomes before executing; never mark
   every row importable. NEEDS_REVIEW rows must create no business finance/enrollment.
2. Twenty–thirty de-identified representative rows from the supplied source, with
   approved control totals. Do not invent records to reach the count.
3. One-unit batch after mapping/review: dry-run → independent reviews → atomic
   import → retry/resume → reconciliation → sign-off. Chunk size at most 25 READY
   rows; preserve crosswalk, source identity and audit.

For each run record batch ID, source hash, total/READY/NEEDS_REVIEW/rejected/imported
counts, reviewer IDs (no credentials), beginning and ending business counts, currency
totals and source-to-target differences. Re-run must add zero duplicate students,
enrollments and openings. Missing class must remain review-only until mapped.

Verify baseline Academic Grade without invented prior PASS; original start date;
opening settlement is not new cash/revenue; down-correction excess is customer credit;
explicit allocation/refund and maker-checker; zero negative receivable; cash history
unchanged; zero unexplained VND difference. An unexpected mismatch stops the run.

Use reviewed rollback only before downstream activity. Otherwise correction/reversal
with audit. Preserve financial audit rows, disable test accounts, delete credential
and raw export artifacts after evidence capture. Do not erase existing staging data
or report old local workflow evidence as this staging pilot.

## Sign-off worksheet

| Run | Source ready | Batch | Counts | VND difference | Retry | Review/cleanup |
|---|---|---|---|---|---|---|
| 10 synthetic | Plan only | Pending | Pending | Not measured | Pending | Pending |
| 20–30 representative | Missing approved source | Pending | Pending | Not measured | Pending | Pending |
| One unit | Unit/source mapping pending | Pending | Pending | Not measured | Pending | Pending |
