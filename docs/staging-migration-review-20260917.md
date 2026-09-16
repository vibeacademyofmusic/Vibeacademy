# Pending staging migrations — individual review record

2026-09-17. **Apply blocked pending exact batch approval.** All IDs below are
reviewed repository migrations; the full 35-file prefix upgrade passed against
the isolated restored staging snapshot, with 1,533 pgTAP assertions. No cloud apply.

Dependency rule: preserve the complete already-applied prefix and execute these
rows in order. This conservative sequence includes every earlier dependency; it
does not assert that every immediately preceding file is a direct SQL dependency.
Reconciliation checkpoints after batches: 62 / 69 / 77 / 81 / 84 / 94.

Recovery for every row: capture a new restricted backup before apply (the previous
rehearsal backup was cleaned), verify restore, freeze affected test workflows,
inspect before/after counts and permission changes. Prefer reviewed forward repair;
do not delete posted history or use untested down migrations. No production recovery
is authorized. Unexplained VND movement or security failure blocks the next batch.

| ID | Purpose | Dependency checkpoint | Apply-time data / Finance impact | Security impact |
|---|---|---|---|---|
| `20260916130000` | legacy migration review | Ordered after ledger 59 and earlier rows in batch | Permission seed; audited import/collection/credit only when invoked | Migration access, maker-checker, immutable financial originals |
| `20260916140000` | opening balance collections | Ordered after ledger 59 and earlier rows in batch | Permission seed; audited import/collection/credit only when invoked | Migration access, maker-checker, immutable financial originals |
| `20260916150000` | customer credit ledger | Ordered after ledger 59 and earlier rows in batch | Permission seed; audited import/collection/credit only when invoked | Migration access, maker-checker, immutable financial originals |
| `20260916160000` | employee master | Ordered after ledger 62 and earlier rows in batch | Seed 3 organization units; no employee/payroll backfill | Employee identity and unit access policies |
| `20260916170000` | employee attendance | Ordered after ledger 62 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Retain existing authenticated scope; regression suite required |
| `20260916180000` | payroll scheduled minutes | Ordered after ledger 62 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Own-payroll scope or immutable/evidence financial workflow |
| `20260916181000` | payroll employee recipients | Ordered after ledger 62 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Own-payroll scope or immutable/evidence financial workflow |
| `20260916182000` | payroll evidence adjustments | Ordered after ledger 62 and earlier rows in batch | Permission/role metadata seed; no financial generation | Own-payroll scope or immutable/evidence financial workflow |
| `20260916183000` | payroll employee self read | Ordered after ledger 62 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Own-payroll scope or immutable/evidence financial workflow |
| `20260916184000` | payroll trip cost breakdown | Ordered after ledger 62 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Own-payroll scope or immutable/evidence financial workflow |
| `20260916190000` | parent finance visibility | Ordered after ledger 69 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Related/own records, active identity and historical scope boundaries |
| `20260916191000` | family portal projections | Ordered after ledger 69 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Related/own records, active identity and historical scope boundaries |
| `20260916192000` | family academic permission | Ordered after ledger 69 and earlier rows in batch | Permission/role metadata seed; no financial generation | Related/own records, active identity and historical scope boundaries |
| `20260916193000` | teacher portal reads | Ordered after ledger 69 and earlier rows in batch | Permission/role metadata seed; no financial generation | Related/own records, active identity and historical scope boundaries |
| `20260916194000` | family opening credit reads | Ordered after ledger 69 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Related/own records, active identity and historical scope boundaries |
| `20260916195000` | teacher current academic reads | Ordered after ledger 69 and earlier rows in batch | Permission/role metadata seed; no financial generation | Related/own records, active identity and historical scope boundaries |
| `20260916200000` | payroll effective employee self read | Ordered after ledger 69 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Own-payroll scope or immutable/evidence financial workflow |
| `20260916201000` | teacher attendance projection | Ordered after ledger 69 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Related/own records, active identity and historical scope boundaries |
| `20260916210000` | notification infrastructure | Ordered after ledger 77 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Recipient revalidation and source/idempotency; no real external send |
| `20260916211000` | notification delivery revalidation | Ordered after ledger 77 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Recipient revalidation and source/idempotency; no real external send |
| `20260916212000` | notification source contracts | Ordered after ledger 77 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Recipient revalidation and source/idempotency; no real external send |
| `20260916213000` | notification recipient idempotency | Ordered after ledger 77 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Recipient revalidation and source/idempotency; no real external send |
| `20260916220000` | inventory ledger | Ordered after ledger 81 and earlier rows in batch | Permission catalogue seed; no stock/financial posting | Unit-scoped stock/serial access; no stock movement at apply |
| `20260916221000` | inventory catalogue scope | Ordered after ledger 81 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Unit-scoped stock/serial access; no stock movement at apply |
| `20260916223000` | serialized instruments | Ordered after ledger 81 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Unit-scoped stock/serial access; no stock movement at apply |
| `20260916230000` | elearning foundation | Ordered after ledger 84 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Authorized author/reviewer/learner scope; private answers and audit |
| `20260916231000` | learning course delivery window | Ordered after ledger 84 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Authorized author/reviewer/learner scope; private answers and audit |
| `20260916233000` | learning assessment policies | Ordered after ledger 84 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Authorized author/reviewer/learner scope; private answers and audit |
| `20260916234000` | learning assessment policy guards | Ordered after ledger 84 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Authorized author/reviewer/learner scope; private answers and audit |
| `20260916235000` | learning manual review queue | Ordered after ledger 84 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Authorized author/reviewer/learner scope; private answers and audit |
| `20260917000000` | learning assessment regrades | Ordered after ledger 84 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Authorized author/reviewer/learner scope; private answers and audit |
| `20260917003000` | learning academic shadow mapping | Ordered after ledger 84 and earlier rows in batch | Shadow mapping only; no Academic promotion/write | Authorized author/reviewer/learner scope; private answers and audit |
| `20260917010000` | learning theory contents contract | Ordered after ledger 84 and earlier rows in batch | Seed 87 source catalogue rows; no published lessons | Authorized author/reviewer/learner scope; private answers and audit |
| `20260917013000` | learning progress analytics | Ordered after ledger 84 and earlier rows in batch | DDL/RPC only; no expected monetary posting | Authorized author/reviewer/learner scope; private answers and audit |
| `20260917020000` | revoke anonymous business grants | Ordered after ledger 84 and earlier rows in batch | Grant/default change only; no business row mutation | Revoke anon/PUBLIC relation/sequence privileges and defaults |

Exact file hashes: [gap register](migration-gap-register-20260917.md).
The local post-upgrade evidence records 17 permission and 9 role-permission additions,
zero source rows removed, unchanged user-role assignments, and zero financial postings.
This is evidence for this staging fixture, not proof for arbitrary production contents.
