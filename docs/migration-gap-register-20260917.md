# Exact migration gap and risk register — 2026-09-17

Fresh read-only cloud ledger audit revalidated during final closure: LOCAL 95, STAGING 94, PRODUCTION 28.
STAGING is missing 1; PRODUCTION is missing 67. No remote-only versions.
Production HOLD: this is a planning inventory, not authorization to apply.

The 35 staging upgrades passed on the restored local business snapshot. Earlier
production-only gaps have not been rehearsed against a fresh production backup.
Security tags include authorization-sensitive modules, not only migration names.
No CRM migration exists. No missing migration is classified as a CRM implementation.

Risk legend: **review** = constraints/policies/routines can reject or change existing
behavior; no data-destructive intent identified, but no automatic down migration.
**metadata** = expected permission/catalogue seed; **backfill** = existing business
rows may be materialized/recomputed; **DDL/RPC** = no expected immediate monetary
posting, but callable workflows may post. All require forward recovery planning.

| Migration | Missing on | Domains (all include schema) | Apply-time data / destructive risk | SHA-256 |
|---|---|---|---|---|
| `20260914201223_future_academic_start_scheduling.sql` | PRODUCTION | academic/operations | DDL/RPC; review | `0f85704d1c03d372686672d8ce78a29cb7bab6b7cecc7c3dfa9bf1144616e2b3` |
| `20260915050000_edit_academic_program_start_date.sql` | PRODUCTION | academic/operations | DDL/RPC; review | `f79cafb6931a87d06767f48643a0256b11d096730f89ae9eab865badcfe6b4e7` |
| `20260915060000_pause_tuition_effective_end.sql` | PRODUCTION | finance | tuition behavior/recalculation review before production | `50b7116f1e6d138b2d53e1a597bbf9034858a8f001db2824cf44bc9e58fb30c6` |
| `20260915070000_invoice_engine_v1.sql` | PRODUCTION | finance | DDL/RPC; review | `680bea089b9b20c9d2f98119c546063e3e3155beee70ca2426a2a800efddfb20` |
| `20260915080000_payment_engine_v1.sql` | PRODUCTION | finance | DDL/RPC; review | `07a41932124f975971a803a1b878ce5c53b572b325807c8c0220333500bfd1d2` |
| `20260915090000_debt_engine_v1.sql` | PRODUCTION | finance | DDL/RPC; review | `ea63d4913f3c0bb6899def373dd5aea87d76487528e9396b75da61074b623800` |
| `20260915100000_lock_tuition_discount_after_invoice.sql` | PRODUCTION | finance | DDL/RPC; review | `6f4013d8e67b9d2389d69f068dd06573b2a64693953c73de1c4e28e55f434858` |
| `20260915110000_refund_engine_v1.sql` | PRODUCTION | finance | DDL/RPC; review | `98083dacdf4bad0add2565028cce115a19052d446c1aaf1ed4193b727c053c1e` |
| `20260915120000_finance_engine_v1.sql` | PRODUCTION | finance | DDL/RPC; review | `5393b4a1c6707f57d19eefe32d701f03c9f6b3096469873b765e904c4e99775a` |
| `20260915130000_revenue_forecast_v1.sql` | PRODUCTION | finance | DDL/RPC; review | `068330f57e73cc7330c78da22b0903184e7d829de2cbf15eca7bbc975e8f1e98` |
| `20260915140000_tuition_operations_rpc.sql` | PRODUCTION | finance | DDL/RPC; review | `f2a1a81acd83aeb9b1f967781aa694982d6d07189296cbe13c86116891e38378` |
| `20260915141000_tuition_reminder_engine_v1.sql` | PRODUCTION | finance | DDL/RPC; review | `fd2405f6282d6dd55d9e5b5be96a942b64f72eedcf7b29c98debd27a690fa88e` |
| `20260915150000_learning_reports_v1.sql` | PRODUCTION | academic/operations | DDL/RPC; review | `7a5386f4847b0111910b86545fd81769212cf7b4433729ee96d0ebc7e824a010` |
| `20260915160000_lesson_feedback_v1.sql` | PRODUCTION | academic/operations | DDL/RPC; review | `e5db36313b7b302b95357af36e1a4f5933170479422de15691aef40386ee366b` |
| `20260915170000_session_teacher_assignment_v1.sql` | PRODUCTION | academic/operations | session-teacher snapshot backfill; review | `c6322a5d78e91a2d2dfd4ac29a1d46f71db14975724839d11eba8ed03fe0a6a7` |
| `20260915180000_teacher_payroll_v1.sql` | PRODUCTION | payroll | DDL/RPC; review | `a8c2482375f68a33d90ae77980ca366362771e89179e4fe43414e31d1d122ed5` |
| `20260915181000_payroll_history_guards.sql` | PRODUCTION | security/RLS, payroll | DDL/RPC; review | `606d85dca27a345315116cad258931f7d503e52a639be178562e91b02175d09e` |
| `20260915190000_security_rpc_surface.sql` | PRODUCTION | security/RLS | DDL/RPC; review | `5491322391f45488793c47531eace43ce795b485cbac555c1ba4f7cd260fbc32` |
| `20260915191000_authorization_foundation.sql` | PRODUCTION | security/RLS | metadata; review | `65e104542c928a1ab3cbdf7e81823290874ed1b00e06e0e9ef15a5ce0ff9b15a` |
| `20260915192000_security_unused_grants.sql` | PRODUCTION | security/RLS | DDL/RPC; review | `fa4b13e1d5999606915a67e5e44b18938c278d3678533f00751cd04224e3cfb7` |
| `20260915200000_branch_relationship_scope.sql` | PRODUCTION | security/RLS | metadata; review | `0cfdbd87f176a44fd7ca43c84a1de8facc51efabde5882db8f24a66802547135` |
| `20260916090000_harden_payroll_self_read.sql` | PRODUCTION | security/RLS, payroll | DDL/RPC; review | `752c5e129f9e4d294836980c17241c9f2d639ec137365d6af2a9e4af4e626481` |
| `20260916091000_harden_feedback_respondent_authorization.sql` | PRODUCTION | security/RLS | metadata; review | `174dac7ddbc3620c019712893ae70a92f5a30dfa328cb4bdb49a3ac262f9c99a` |
| `20260916092000_align_relationship_read_authorization.sql` | PRODUCTION | security/RLS | DDL/RPC; review | `fc06f90f458b12fbb15a364010047c3b87501b59c2e381e3c62f994b8f7b3385` |
| `20260916093000_bound_teacher_historical_access.sql` | PRODUCTION | security/RLS | DDL/RPC; review | `66f68a6e24509d46fd1cba27b06f501a4afe29369b95fb1f31f7244a8a8ccc7b` |
| `20260916094000_student_parent_history_reads.sql` | PRODUCTION | security/RLS | metadata; review | `11745c8db106dfddec23187d6ee781b6c47a2bb4c2b6bcb14d5c6c1f8d951978` |
| `20260916095000_scoped_finance_payroll_reads.sql` | PRODUCTION | security/RLS, finance, payroll | metadata; review | `91de3552fd641c412b220d493803cbaa03c005c59506a0ca1890f7d69471132e` |
| `20260916100000_payroll_maker_checker.sql` | PRODUCTION | security/RLS, payroll | metadata; review | `425b7e72dfbd4251f478648d1787d032617c7c8a9d57ea4494255da7ca917653` |
| `20260916110000_financial_approval_workflows.sql` | PRODUCTION | security/RLS, finance | metadata; review | `355d7c4ee1799de566143cd94d4e522deaf5126969cb560ac62e0ea48f2bcf33` |
| `20260916111000_invoice_cancellation_approval.sql` | PRODUCTION | security/RLS, finance | metadata; review | `b1b24514f80420c16011c1c69a3974e03884be3dbc7ce2c2eec9e748af0b4c41` |
| `20260916120000_security_consistency_hardening.sql` | PRODUCTION | security/RLS | DDL/RPC; review | `3e6207096fb2f4dd599caaa2ff5aa74a94a277c1f44649a6397585d92fa204a8` |
| `20260916130000_legacy_migration_review.sql` | PRODUCTION | finance | metadata; review | `d9304c9ad3a0ed3ff581aa0361c12ed269cfc8b5b696cc9372132517556ce9b2` |
| `20260916140000_opening_balance_collections.sql` | PRODUCTION | finance | metadata; review | `08b77a26d256fadb18ac921e508db9b0dc5b9a9f54b3ee258d60fc2a61b0ba9c` |
| `20260916150000_customer_credit_ledger.sql` | PRODUCTION | finance | metadata; review | `de52724a3eaa7a55c4d4660aefb95de450edb49ce5cc8e607eb2ef2e273e4069` |
| `20260916160000_employee_master.sql` | PRODUCTION | HR | metadata; review | `015739a4eb41090ffcf781c1cd18296c0b1be33d4c0b3b2175e6847f7963de2f` |
| `20260916170000_employee_attendance.sql` | PRODUCTION | HR | DDL/RPC; review | `06301e54b704ef30acc0afab531f249f258c5800c08e4a04512f4083145d6bd3` |
| `20260916180000_payroll_scheduled_minutes.sql` | PRODUCTION | payroll | DDL/RPC; review | `f1d9e9d7450ac18ee2478793ba3c3100591f40a71cdd6ce238589640a87a8f66` |
| `20260916181000_payroll_employee_recipients.sql` | PRODUCTION | payroll, HR | DDL/RPC; review | `b080efdc47da6312c41d563aab88ff605e803da6e8bfc8c642353eacf53b63a0` |
| `20260916182000_payroll_evidence_adjustments.sql` | PRODUCTION | payroll | metadata; review | `e895af3768f62ffc9a0e14525916c6af14b65eb5ce67345747aafe23b8a51e08` |
| `20260916183000_payroll_employee_self_read.sql` | PRODUCTION | security/RLS, payroll, HR | DDL/RPC; review | `c284e5ef9ea7f6321095cb1db71994e5d1f4f7dcb0ae6e3dbd0ec95163d4ed68` |
| `20260916184000_payroll_trip_cost_breakdown.sql` | PRODUCTION | payroll, HR | DDL/RPC; review | `f3e883eac6a08af00786a3c3f499a8a6b084e5c0352b39c0e4f5eb1325a438e0` |
| `20260916190000_parent_finance_visibility.sql` | PRODUCTION | security/RLS, finance | DDL/RPC; review | `795a67c565e5b2f6ee95ba2662608c9de4033c71937887192455bfe6ea5ea4fa` |
| `20260916191000_family_portal_projections.sql` | PRODUCTION | security/RLS | DDL/RPC; review | `34ea6daa863b159cc7b7e7739601d9de243ed8a3f0a49385f0007d4705d111e3` |
| `20260916192000_family_academic_permission.sql` | PRODUCTION | security/RLS | metadata; review | `3df6589024e7af344fa9cec9f8dc735836a6839ac508f3f84081cd10a978cda7` |
| `20260916193000_teacher_portal_reads.sql` | PRODUCTION | security/RLS | metadata; review | `ccc068e45224db4b6533b7fc4eb2ddb1e5a0a539119b6abb56b8559060a16d95` |
| `20260916194000_family_opening_credit_reads.sql` | PRODUCTION | finance | DDL/RPC; review | `e508ce5ec977d410fb788e50e0c4938609faa2eef085876e835f5a75fb945046` |
| `20260916195000_teacher_current_academic_reads.sql` | PRODUCTION | security/RLS | metadata; review | `2a9d08ea41a39b4a16eb257adcaad70fa1491222ea661370f32a45d41bc9ed73` |
| `20260916200000_payroll_effective_employee_self_read.sql` | PRODUCTION | security/RLS, payroll, HR | DDL/RPC; review | `bb131c3f055f8132581a1917c2105e996eea002346f2e278147ab9c764022c0f` |
| `20260916201000_teacher_attendance_projection.sql` | PRODUCTION | security/RLS | DDL/RPC; review | `e35b520d13e9c7c91adba23fc34261c0556ed7f5127f8f775738932ec2cb67c0` |
| `20260916210000_notification_infrastructure.sql` | PRODUCTION | notifications/security | DDL/RPC; review | `919196b008f60c7b5f7a58a119c76b5ecfcb113f58b35d51d6cd9f1964c8edd6` |
| `20260916211000_notification_delivery_revalidation.sql` | PRODUCTION | notifications/security | DDL/RPC; review | `263741bbfad509081a1e4af46ad35e03a606a2019f1abdcab7b133cb67a260fa` |
| `20260916212000_notification_source_contracts.sql` | PRODUCTION | notifications/security | DDL/RPC; review | `6cc01b6156a6efd3c835454996238242de0b333a77ccd096046ed4a194357a0a` |
| `20260916213000_notification_recipient_idempotency.sql` | PRODUCTION | notifications/security | DDL/RPC; review | `b30f55c68dd75ff1f3453603aa08e453b7a76fad38ffc6f8eb6fbb1fe9719984` |
| `20260916220000_inventory_ledger.sql` | PRODUCTION | inventory | metadata; review | `c592253bd8c5f36ad0215bfebbbb391c518a1bb3133961faca39ffc2b0af4262` |
| `20260916221000_inventory_catalogue_scope.sql` | PRODUCTION | security/RLS, inventory | DDL/RPC; review | `2dde43b0476f49016f95128a0c40ce76c664b2fa68029401043dc8f9056d0742` |
| `20260916223000_serialized_instruments.sql` | PRODUCTION | inventory | DDL/RPC; review | `67aef1f2f66627d9e34274a51b3830d8df860a32e6909d1fa54e72ee7030b02f` |
| `20260916230000_elearning_foundation.sql` | PRODUCTION | e-learning | DDL/RPC; review | `1310225505b82955bd59a073c32a76a2847a039bc9c96fdb732e61de6574e57e` |
| `20260916231000_learning_course_delivery_window.sql` | PRODUCTION | e-learning | DDL/RPC; review | `d51c720d5d7c699ddc5a402c23be918a217f67c5a35dd3f4a7e2eba136397333` |
| `20260916233000_learning_assessment_policies.sql` | PRODUCTION | e-learning | DDL/RPC; review | `aa83d94c50e768cd35cdb05c37c23f04f3f3083a73b798e815dcef443512434e` |
| `20260916234000_learning_assessment_policy_guards.sql` | PRODUCTION | e-learning | DDL/RPC; review | `f8da0e34f443cef63803b1c087862b742601f2b7c4b69d8ee7f15b78d8cc69fd` |
| `20260916235000_learning_manual_review_queue.sql` | PRODUCTION | e-learning | DDL/RPC; review | `7dc763f6a180e37fb9ef96131393371baffe6637b5316ecde3017250c127f4bb` |
| `20260917000000_learning_assessment_regrades.sql` | PRODUCTION | e-learning | DDL/RPC; review | `4cad6540d0cc7d4498877db9bad99c4cb164ced11e8063ce7cec7463e0f5a00a` |
| `20260917003000_learning_academic_shadow_mapping.sql` | PRODUCTION | e-learning | DDL/RPC; review | `9b0ab083aee3edd273c6384247ee46fe458d1074a0d6188c8780eab199fa59e6` |
| `20260917010000_learning_theory_contents_contract.sql` | PRODUCTION | e-learning | metadata; review | `83b0352ad11213c3eaffc2f763021a54f6db358f295ffebf4fed637c5a47c824` |
| `20260917013000_learning_progress_analytics.sql` | PRODUCTION | e-learning | DDL/RPC; review | `713de1c6699c446439bca6224389122c5c50f15616c24b18986701f51ee16823` |
| `20260917020000_revoke_anonymous_business_grants.sql` | PRODUCTION | security/RLS | DDL/RPC; review | `b0d864b9e28766b12f2238216203e3d887490974b32f020afc437b36ab86cf5c` |
| `20260917100000_operational_payroll_documents.sql` | STAGING/PRODUCTION | payroll, security/HR | Non-destructive nullable reason and scoped audited RPCs; no monetary posting | `75c52f95444e5b9fc23de784ad326c1b053c1d8836aa45c6551de484456d19cb` |

Staging dependency batches: 59→62 legacy/credit (applied and database-validated); 62→69 HR/payroll;
69→77 portals; 77→81 notifications; 81→84 inventory; 84→94 learning/security; 94→95 payroll documents.
Exact batch manifest and recovery conditions: [preflight](staging-upgrade-preflight-20260917.md).

The zero-byte `20260910201008` remains untouched. Cần Thơ seed `20260909100000`
already appears in both freshly-read cloud ledgers; no repair/timestamp change is
needed for that version based on this audit. This does not authorize production apply.

## Closure classification clarification

Every listed migration changes schema/routines/policies unless it is explicitly a
seed. Finance/payroll/HR/e-learning tags are workflow domains, not a claim that DDL
posts money. `metadata` means seed/data-mutating catalogue or permission writes;
`backfill` means business data may be inserted/recomputed at apply time. Review
flags include potentially breaking constraints/grants and replaced objects, not
confirmed destructive deletion. No pending CRM migration exists. Notification
migrations form their own domain; assessment-named learning migrations are the
assessment subset. Legacy review/opening/customer-credit migrations belong to the
migration module as well as Finance. A complete application rollback cannot undo
these changes; recovery requires preserved data plus an approved forward fix or
isolated restore.

The pending production-only migrations before staging's current version require
fresh production-snapshot impact rehearsal; their absence from staging's pending
list does not certify their production data effects. No destructive production
operation or migration repair is proposed.
