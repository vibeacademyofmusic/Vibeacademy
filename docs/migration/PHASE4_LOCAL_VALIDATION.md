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
- The original checkpoint did not include post-cutover collection/correction. See the continuation below for the uncommitted implementation and its remaining decision/browser gates. Do not use it for live cutover yet.
- Broader delegated domain reviewer UI, full exportable batch control reports and real staging pilot remain pending. Current raw migration data is restricted to the migration permission and current Admin route.
- No new Phase 4 staging authorization is inferred from the earlier authorization for exactly four Phase 1/2 migrations. Production and staging applications of this migration need their own explicit approval.

No Git push or deployment has been performed.

## Phase 4 closure — collections, corrections and customer credit

Owner decision implemented on 2026-09-16: an approved downward correction is allowed even when receipts exceed the valid obligation. Release the excess into traceable customer credit; do not rewrite the original opening/payment, create revenue, or leave negative receivable.

New migrations, local only:

- `20260916140000_opening_balance_collections.sql`: canonical Payment/Refund allocations may target an opening receivable; immutable originals and approved opening corrections.
- `20260916150000_customer_credit_ledger.sql`: append-only credit origins and uses; effective allocations subtract released credit. Explicit credit application/refund operations reuse financial requests and the canonical payment/refund tables.

The latter supersedes the provisional customer-credit rejection in the former. No production-applied migration was edited. Local ledger is **62**, latest **20260916150000**. Staging remains **last verified 59**, unchanged in this work; production remains HOLD.

### Financial and security contract

- Credit traces student, branch, currency, original payment/allocation, opening receivable, original correction and causative approval request. Uses trace the new allocation/refund and approval request.
- Application is explicit, independently approved, partial and idempotent; same student/branch/currency and valid issued invoice or unreversed opening obligation. No silent transfer. Existing financial approval emergency override rules remain in force.
- Refunds use the existing Refund Engine and maker-checker. Ordinary refunds cannot consume reserved credit; a credit refund cannot also allocate into a receivable. Refund reversal restores credit. Payment void invalidates its allocations/credit and restores affected obligations without deleting history.
- Reversing a correction by a new approved positive correction restores the obligation. It does not take back credit already applied elsewhere; unapplied credit is available for an explicit approved allocation back to the original obligation.
- All original payments, opening amounts, settlements, credits and credit uses are immutable. Source snapshots are revalidated under locks at approval. Cross-branch access, stale approval, fractional VND, double spending and direct service writes are tested.
- Pre-cutover settlement excess is retained as separately labelled historical credit, linked to the settlement, with no invented payment/cash. It remains unapplied pending reliable source-payment review; application/refund without a source payment is refused. This is not a production import adapter or permission to fabricate historical cash.
- An ordinary posted refund must be attributed or voided before its original opening allocation can be released into credit. This preserves the existing two-step refund workflow and prevents double use of returned cash.

### Browser evidence (new local workflow)

Synthetic source `CREDIT-BROWSER`, row `CREDIT-BROWSER-1`, batch `9a566eb2-ee31-42c7-86a2-322673021a91`:

1. Missing class stays in review, dry-run shows zero new business units. Map `LEGACY-SMOKE-CLASS`, review identity/Grade 4, second reviewer approves finance, atomic import succeeds.
2. Original opening 5,500,000 VND, pre-cutover paid 0, original debt 5,500,000; all import differences 0.
3. Create and allocate actual local test payment 4,000,000. Approve correction to 3,000,000 with a different user; self approval visibly denied.
4. Opening applied = 3,000,000; outstanding = 0; customer credit = 1,000,000; cash remains 4,000,000.
5. A future valid invoice was prepared through existing tuition/invoice RPCs for the same synthetic student. Browser request/independent approval applies 400,000; invoice debt 5,100,000 and credit 600,000.
6. Mobile request/independent approval refunds 200,000 through canonical Refund Engine; credit 400,000. Separate approved refund void restores credit to 600,000.
7. Browser inspection found and fixed misleading refund reallocation controls: credit refunds now show their credit provenance and offer no duplicate debt allocation form.
8. Desktop 1440×900 and mobile 390×844 inspected; no page-level horizontal overflow and no browser console errors. Tables scroll within their own container. Forms are usable on mobile.
9. Browser rollback request followed by independent review displays the explicit downstream-activity block; original imported student remains intact.

Final local reconciliation of this fixture:

| Dimension | VND |
|---|---:|
| Original opening (preserved) | 5,500,000 |
| Approved correction | -2,500,000 |
| Applied to corrected opening | 3,000,000 |
| Opening outstanding | 0 |
| Applied to future invoice | 400,000 |
| Unapplied credit | 600,000 |
| Actual receipt | 4,000,000 |
| Active refund after reversal | 0 |
| Cash minus effective applications minus credit | **0** |

All three original import reconciliation differences remain **0**. Synthetic records remain local as auditable evidence; rollback was deliberately blocked rather than deleting financial history. Both temporary reviewers were returned to INACTIVE and banned; temporary password file deleted. No real credentials, payments, external messages or production data were used.

### Validation and exit status

Final verification completed successfully. The original 44-file/935 and 129-test figures above describe the earlier foundation checkpoint only.

- Full pgTAP: **46 files / 1,016 PASS** (40 opening-collection assertions and 41 customer-credit assertions, in addition to the 935-test foundation).
- Application/bootstrap: **140 PASS**.
- Build, relevant ESLint and git diff check: **PASS**.
- Browser required Phase 4 workflows: **PASS**, with limitations above.

**Phase 4 engineering exit gate: PASS (local).** Real-source mapping, de-identified representative pilot data, domain sign-off and staging migration rehearsal remain later rollout gates, not an authorization to use this on production. No push or deploy.
