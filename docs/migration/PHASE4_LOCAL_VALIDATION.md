# Phase 4 — local legacy review/import checkpoint

2026-09-16. Production HOLD. This is a local implementation checkpoint, not approval for real-data import or completion of every Phase 4 rollout gate.

## Owner decision implemented

A source with tuition/debt and no confirmed class remains NEEDS_REVIEW. Raw CSV and row payload are retained; normalization and mapping reviews are separate. No official student, enrollment, tuition, opening receivable, settlement, invoice or payment is created by validation. Once an active curriculum/grade and valid class are mapped and reviews complete, the whole student unit imports in one transaction. There is no classless financial business model.

`20260916130000_legacy_migration_review.sql` is new and local only. Earlier released migrations are unchanged. Staging was last verified at 59 migrations during Phase 3 and has not been changed here; local ledger is 60.

## Implemented contract

- Controlled UTF-8 CSV V1, 500 rows / 500 kB maximum, immutable original file hash/raw source, trimmed/NFC normalized fields, versioned mapping and review audit.
- Read-only dry-run summaries predict new student/enrollment/academic/tuition counts and opening amounts, with EXACT_MATCH, STRONG_MATCH, POSSIBLE_DUPLICATE and NO_MATCH categories. Exact class/curriculum/grade/plan mappings, original activation date, explicit current tuition start, exact price/discount/currency reconciliation. Unknown dates, price differences and possible duplicate identities block import.
- Identity and Academic approval, followed by Finance approval from someone other than the uploader or mapping authors. Current operator rollout is SUPER_ADMIN; this does not delegate access to raw financial payloads to other roles.
- Per-student atomic import; separate transactions in batches of at most 25 READY rows; stop on first failure; resumable rows and failure codes. Durable source crosswalk prevents duplicate imports across batches.
- Grade baseline via the existing Academic assignment engine, without fabricated earlier passes. Current pause and approved historical extension are distinct; expired/cancelled terms do not silently become active terms.
- Separate non-cash opening receivable and settlement, included in debt summaries, excluded from invoice counts, billed amounts, cash and revenue forecasts. A normal invoice cannot be issued again for the opening tuition.
- Rollback requires a second reviewer and no downstream activity or snapshot changes. It archives/withdraws the imported unit and posts a reversal, preserving audit and original amounts. Signed-off batches cannot be rolled back. Final sign-off requires exact reconciliation and no pending rows/rollback requests.
- Admin review route, filters/pagination, mapping, reviews, batch processing, reconciliation and controlled rollback; Finance shows opening debt separately.

## Verification

- pgTAP: 44 files / 935 assertions PASS, including 77 new legacy assertions.
- Application/bootstrap: 129 tests PASS, including 11 legacy UI/action/parser tests. Build, relevant ESLint and git diff check PASS.
- Full new migration replayed after temporarily removing only Phase 4 objects in a local subtransaction; replay succeeds and deliberately rolls back. No database reset or persistent deletion of existing local data was performed for this check.
- A security test caught loss of the established `public, pg_temp` search path in the copied effective-end function. The new migration preserves that hardened setting; the original security tests pass unchanged.
- Browser fixture initially used a branch UUID already reserved by an existing pgTAP suite. Only that newly-created local test branch was replaced with a random UUID before rerunning the suite; no test assertion was weakened.

## Browser evidence

Local synthetic CSV with missing class: NEEDS_REVIEW, no Import option. Mapping to the synthetic Grade 4 class succeeds. Uploader self-approval of Finance is denied; a second reviewer approves. Import succeeds with one enrollment and 5,500,000 VND = 3,000,000 opening paid + 2,500,000 debt; all differences zero. Running the batch again imports zero rows. Debt page shows the opening balance separately. Mobile 390×844 and desktop 1440×900 are usable. Rollback self-approval is denied; a different reviewer completes rollback. The local row is ROLLED_BACK, student ARCHIVED, all three net opening amounts are 0, and invoice/payment counts for the synthetic student remain 0. Both temporary local reviewers are INACTIVE and banned; their password file was deleted. Audit references remain intact. Browser console error log was empty.

## Remaining Phase 4 work / rollout gates

This checkpoint does not certify full Phase 4 PASS. These capabilities remain necessary before a general legacy rollout:

- A real source package, approved mapping dictionary, cutover/freeze metadata and source control totals have not been supplied; no real-data pilot or owner/domain sign-off is claimed.
- CSV V1 is supported; XLSX is not. Unknown columns are rejected rather than silently discarded. Optional identity/contact fields and arbitrary source layouts require an approved mapping adapter.
- Exact source crosswalk retries reuse imported records. Possible matches to pre-existing unrelated business students stay in review; a general manual merge/match workflow is not yet provided.
- Opening debt is visible, but post-cutover payment allocation to that separate opening ledger and audited correction after downstream activity are not yet implemented. Do not use this checkpoint for live collections/cutover. Existing ordinary invoice/payment workflows are not a workaround.
- Broader delegated domain reviewer UI, full exportable batch control reports and real staging pilot remain pending. Current raw migration data is restricted to the migration permission and current Admin route.
- No new Phase 4 staging authorization is inferred from the earlier authorization for exactly four Phase 1/2 migrations. Production and staging applications of this migration need their own explicit approval.

No Git push or deployment has been performed.
