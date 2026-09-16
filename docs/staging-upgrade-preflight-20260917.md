# Phase 23 — current staging upgrade preflight

2026-09-17. **Preflight only; full staging validation is not PASS.**

Target explicitly verified: `owpfqwdrmyzcmjahehek`. Production
`qhznfywwrhmcwbkujclm` remains HOLD. No push/deploy.

Fresh read-only staging checks: 59 migrations, no remote-only versions; local 94.
Five students, five enrollments, one tuition row totaling 5,500,000 VND.
Invoices, payments, refunds, payroll periods, teacher payrolls and payroll
corrections all zero. This is a baseline, not a claim that every workflow passed.

## Ordered logical batches

| Batch | Scope | Expected ledger after batch |
|---|---|---:|
| 1 | Legacy review, opening collections, customer credit | 62 |
| 2 | Employee master, attendance, payroll extensions | 69 |
| 3 | Family and teacher portal scopes | 77 |
| 4 | Notifications and source/idempotency guards | 81 |
| 5 | Inventory and serialized instruments | 84 |
| 6 | Learning/assessment, Theory contract, analytics, anonymous privilege removal | 94 |

These migrations add schemas/tables/indexes, replace routines/views and constraints,
and seed permission/catalogue metadata. Scope review found no top-level generation
of invoice/payment/refund/payroll outcomes. Rule functions do contain financial
mutations when later explicitly invoked; those bodies are not migration-time
posting. Employee migration seeds three organization units; Theory seeds 87 source
metadata rows, not lessons. Role-permission additions must be reconciled and tested.
Dropping/replacing a constraint or index is not permission to delete business data.

## Preconditions and recovery

Before apply: verify staging target again, finish a private local recovery export
and validate a restoration into an isolated LOCAL database. No reset of the existing
local application database. Recovery export stays outside Git with restrictive
permissions; never include authentication data or credentials in reports.

Apply in timestamp order with normal ledger handling, no repair or cherry-pick.
After each batch compare ledger and representative counts/currency totals. Stop
for unexpected financial movement or authorization failure. Future modules not yet
implemented/content-reviewed remain out of full Phase 23 sign-off even if these
batches pass. Production backup/restore readiness is a separate unfulfilled gate.

## Exact missing migration manifest

SHA-256 pins the reviewed local files; re-review if any hash changes.

| Migration | SHA-256 |
|---|---|
| `20260916130000_legacy_migration_review.sql` | `d9304c9ad3a0ed3ff581aa0361c12ed269cfc8b5b696cc9372132517556ce9b2` |
| `20260916140000_opening_balance_collections.sql` | `08b77a26d256fadb18ac921e508db9b0dc5b9a9f54b3ee258d60fc2a61b0ba9c` |
| `20260916150000_customer_credit_ledger.sql` | `de52724a3eaa7a55c4d4660aefb95de450edb49ce5cc8e607eb2ef2e273e4069` |
| `20260916160000_employee_master.sql` | `015739a4eb41090ffcf781c1cd18296c0b1be33d4c0b3b2175e6847f7963de2f` |
| `20260916170000_employee_attendance.sql` | `06301e54b704ef30acc0afab531f249f258c5800c08e4a04512f4083145d6bd3` |
| `20260916180000_payroll_scheduled_minutes.sql` | `f1d9e9d7450ac18ee2478793ba3c3100591f40a71cdd6ce238589640a87a8f66` |
| `20260916181000_payroll_employee_recipients.sql` | `b080efdc47da6312c41d563aab88ff605e803da6e8bfc8c642353eacf53b63a0` |
| `20260916182000_payroll_evidence_adjustments.sql` | `e895af3768f62ffc9a0e14525916c6af14b65eb5ce67345747aafe23b8a51e08` |
| `20260916183000_payroll_employee_self_read.sql` | `c284e5ef9ea7f6321095cb1db71994e5d1f4f7dcb0ae6e3dbd0ec95163d4ed68` |
| `20260916184000_payroll_trip_cost_breakdown.sql` | `f3e883eac6a08af00786a3c3f499a8a6b084e5c0352b39c0e4f5eb1325a438e0` |
| `20260916190000_parent_finance_visibility.sql` | `795a67c565e5b2f6ee95ba2662608c9de4033c71937887192455bfe6ea5ea4fa` |
| `20260916191000_family_portal_projections.sql` | `34ea6daa863b159cc7b7e7739601d9de243ed8a3f0a49385f0007d4705d111e3` |
| `20260916192000_family_academic_permission.sql` | `3df6589024e7af344fa9cec9f8dc735836a6839ac508f3f84081cd10a978cda7` |
| `20260916193000_teacher_portal_reads.sql` | `ccc068e45224db4b6533b7fc4eb2ddb1e5a0a539119b6abb56b8559060a16d95` |
| `20260916194000_family_opening_credit_reads.sql` | `e508ce5ec977d410fb788e50e0c4938609faa2eef085876e835f5a75fb945046` |
| `20260916195000_teacher_current_academic_reads.sql` | `2a9d08ea41a39b4a16eb257adcaad70fa1491222ea661370f32a45d41bc9ed73` |
| `20260916200000_payroll_effective_employee_self_read.sql` | `bb131c3f055f8132581a1917c2105e996eea002346f2e278147ab9c764022c0f` |
| `20260916201000_teacher_attendance_projection.sql` | `e35b520d13e9c7c91adba23fc34261c0556ed7f5127f8f775738932ec2cb67c0` |
| `20260916210000_notification_infrastructure.sql` | `919196b008f60c7b5f7a58a119c76b5ecfcb113f58b35d51d6cd9f1964c8edd6` |
| `20260916211000_notification_delivery_revalidation.sql` | `263741bbfad509081a1e4af46ad35e03a606a2019f1abdcab7b133cb67a260fa` |
| `20260916212000_notification_source_contracts.sql` | `6cc01b6156a6efd3c835454996238242de0b333a77ccd096046ed4a194357a0a` |
| `20260916213000_notification_recipient_idempotency.sql` | `b30f55c68dd75ff1f3453603aa08e453b7a76fad38ffc6f8eb6fbb1fe9719984` |
| `20260916220000_inventory_ledger.sql` | `c592253bd8c5f36ad0215bfebbbb391c518a1bb3133961faca39ffc2b0af4262` |
| `20260916221000_inventory_catalogue_scope.sql` | `2dde43b0476f49016f95128a0c40ce76c664b2fa68029401043dc8f9056d0742` |
| `20260916223000_serialized_instruments.sql` | `67aef1f2f66627d9e34274a51b3830d8df860a32e6909d1fa54e72ee7030b02f` |
| `20260916230000_elearning_foundation.sql` | `1310225505b82955bd59a073c32a76a2847a039bc9c96fdb732e61de6574e57e` |
| `20260916231000_learning_course_delivery_window.sql` | `d51c720d5d7c699ddc5a402c23be918a217f67c5a35dd3f4a7e2eba136397333` |
| `20260916233000_learning_assessment_policies.sql` | `aa83d94c50e768cd35cdb05c37c23f04f3f3083a73b798e815dcef443512434e` |
| `20260916234000_learning_assessment_policy_guards.sql` | `f8da0e34f443cef63803b1c087862b742601f2b7c4b69d8ee7f15b78d8cc69fd` |
| `20260916235000_learning_manual_review_queue.sql` | `7dc763f6a180e37fb9ef96131393371baffe6637b5316ecde3017250c127f4bb` |
| `20260917000000_learning_assessment_regrades.sql` | `4cad6540d0cc7d4498877db9bad99c4cb164ced11e8063ce7cec7463e0f5a00a` |
| `20260917003000_learning_academic_shadow_mapping.sql` | `9b0ab083aee3edd273c6384247ee46fe458d1074a0d6188c8780eab199fa59e6` |
| `20260917010000_learning_theory_contents_contract.sql` | `83b0352ad11213c3eaffc2f763021a54f6db358f295ffebf4fed637c5a47c824` |
| `20260917013000_learning_progress_analytics.sql` | `713de1c6699c446439bca6224389122c5c50f15616c24b18986701f51ee16823` |
| `20260917020000_revoke_anonymous_business_grants.sql` | `b0d864b9e28766b12f2238216203e3d887490974b32f020afc437b36ab86cf5c` |

## Recovery rehearsal checkpoint

Owner explicitly approved business-data/ledger export to the restricted temporary
local directory, excluding Auth data. Schema and business export completed. The
schema restored transactionally into the separate LOCAL database
`vibe_staging_restore_20260917` after using the existing local administrative role
to preserve ownership and installing required `btree_gist`. The app database was
not reset. Schema-only attempts before those prerequisites rolled back.

No Auth user rows, passwords, tokens or email identities were exported. Following
explicit Owner authorization, 22 LOCAL-only locked placeholder identities were
created using foreign-key references from the business export. Business restore
passed: 57 tables / 407 rows matched exactly, with every foreign key checked before
commit. The isolated clone then upgraded through the normal migration runner from
59 to 94; full pgTAP passed (59 files / 1,533 tests).

After upgrade, 54 source tables remain identical; the only source-table additions
are 17 permissions, 9 role-permission mappings and 35 migration ledger rows. No
source rows were removed. All 22 identities remain banned indefinitely with no
email, phone or password. This verifies business-data recovery using synthetic
Auth references, **not real Auth or production recovery**. See
[local recovery evidence](backup-restore-validation-20260917.md).

Staging apply and full staging validation remain pending. The clone rehearsal does
not change the staging ledger or grant production deployment approval.
