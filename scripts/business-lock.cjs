const { existsSync } = require('node:fs')
const { spawnSync } = require('node:child_process')

// Keep both lists explicit: a renamed or removed test must fail the release gate.
// databaseTests is the complete supabase/tests/database suite.
const applicationTests = [
  'tests/registration-zalo-consent.test.cjs',
  'tests/counter-intake.test.cjs',
  'tests/momo-signature.test.mjs',
  'tests/payos-hardening.test.mjs',
  'tests/payos-registration.test.mjs',
  'tests/payos-sync.test.cjs',
  'tests/zalo-admin-ui.test.cjs',
  'tests/zalo-durable-recovery.test.cjs',
  'tests/zalo-phone-registration.test.cjs',
  'tests/zalo-pilot-outbound.test.cjs',
  'tests/zalo-recovery-controls.test.cjs',
  'tests/zalo-registration-recovery-action.test.cjs',
  'tests/zalo-template-readiness.test.cjs',
  'tests/zalo-webhook-foundation.test.cjs',
]

const databaseTests = [
  'supabase/tests/database/academic_engine_hardening_test.sql',
  'supabase/tests/database/academic_starting_grade_scope_test.sql',
  'supabase/tests/database/attendance_launcher_test.sql',
  'supabase/tests/database/attendance_qr_phase1_foundation_test.sql',
  'supabase/tests/database/attendance_qr_verification_payroll_test.sql',
  'supabase/tests/database/attendance_records_test.sql',
  'supabase/tests/database/authorization_foundation_test.sql',
  'supabase/tests/database/branch_relationship_scope_test.sql',
  'supabase/tests/database/cashier_cash_receipt_test.sql',
  'supabase/tests/database/class_teacher_temporal_test.sql',
  'supabase/tests/database/counter_intake_test.sql',
  'supabase/tests/database/create_makeup_session_occurrence_test.sql',
  'supabase/tests/database/crm_campaign_report_test.sql',
  'supabase/tests/database/crm_channel_state_test.sql',
  'supabase/tests/database/crm_conversion_test.sql',
  'supabase/tests/database/crm_foundation_test.sql',
  'supabase/tests/database/crm_pipeline_test.sql',
  'supabase/tests/database/crm_reactivation_test.sql',
  'supabase/tests/database/crm_security_test.sql',
  'supabase/tests/database/crm_shell_access_test.sql',
  'supabase/tests/database/customer_credit_ledger_test.sql',
  'supabase/tests/database/debt_engine_v1_test.sql',
  'supabase/tests/database/elearning_foundation_test.sql',
  'supabase/tests/database/employee_attendance_test.sql',
  'supabase/tests/database/employee_master_test.sql',
  'supabase/tests/database/enrollment_pause_attendance_test.sql',
  'supabase/tests/database/enrollment_pause_engine_test.sql',
  'supabase/tests/database/expense_claim_v2_itemized_test.sql',
  'supabase/tests/database/feedback_authorization_test.sql',
  'supabase/tests/database/finance_engine_v1_test.sql',
  'supabase/tests/database/finance_read_scope_test.sql',
  'supabase/tests/database/financial_approval_workflows_test.sql',
  'supabase/tests/database/financial_management_report_v1_test.sql',
  'supabase/tests/database/instrument_customer_care_test.sql',
  'supabase/tests/database/inventory_ledger_test.sql',
  'supabase/tests/database/invoice_cancellation_approval_test.sql',
  'supabase/tests/database/invoice_engine_v1_test.sql',
  'supabase/tests/database/learning_analytics_test.sql',
  'supabase/tests/database/learning_assessment_test.sql',
  'supabase/tests/database/learning_journals_test.sql',
  'supabase/tests/database/learning_observation_taxonomy_test.sql',
  'supabase/tests/database/learning_regrade_test.sql',
  'supabase/tests/database/learning_reports_test.sql',
  'supabase/tests/database/learning_shadow_mapping_test.sql',
  'supabase/tests/database/learning_theory_contents_test.sql',
  'supabase/tests/database/legacy_migration_review_test.sql',
  'supabase/tests/database/lesson_feedback_test.sql',
  'supabase/tests/database/lesson_operator_writes_test.sql',
  'supabase/tests/database/makeup_credit_ledger_test.sql',
  'supabase/tests/database/mixed_level_class_ops_test.sql',
  'supabase/tests/database/notification_infrastructure_test.sql',
  'supabase/tests/database/opening_balance_collections_test.sql',
  'supabase/tests/database/operating_expenses_v1_test.sql',
  'supabase/tests/database/pause_tuition_effective_end_test.sql',
  'supabase/tests/database/payment_cash_integrity_test.sql',
  'supabase/tests/database/payment_engine_v1_test.sql',
  'supabase/tests/database/payroll_disbursements_v2_test.sql',
  'supabase/tests/database/payroll_maker_checker_test.sql',
  'supabase/tests/database/payroll_scheduled_minutes_test.sql',
  'supabase/tests/database/payroll_self_read_security_test.sql',
  'supabase/tests/database/payroll_v2_preview_test.sql',
  'supabase/tests/database/refund_engine_v1_test.sql',
  'supabase/tests/database/registration_agreed_deposit_test.sql',
  'supabase/tests/database/registration_branch_payment_option_test.sql',
  'supabase/tests/database/registration_momo_deposit_test.sql',
  'supabase/tests/database/registration_payos_test.sql',
  'supabase/tests/database/registration_placement_test.sql',
  'supabase/tests/database/registration_zalo_consent_lifecycle_test.sql',
  'supabase/tests/database/relationship_read_authorization_test.sql',
  'supabase/tests/database/reschedule_makeup_foundation_test.sql',
  'supabase/tests/database/reschedule_session_occurrence_test.sql',
  'supabase/tests/database/revenue_forecast_v1_test.sql',
  'supabase/tests/database/security_catalogue_baseline_test.sql',
  'supabase/tests/database/security_consistency_test.sql',
  'supabase/tests/database/serialized_instruments_test.sql',
  'supabase/tests/database/session_occurrences_test.sql',
  'supabase/tests/database/session_status_workflow_test.sql',
  'supabase/tests/database/session_teacher_assignment_test.sql',
  'supabase/tests/database/staff_profile_badges_test.sql',
  'supabase/tests/database/student_code_sequence_test.sql',
  'supabase/tests/database/student_ops_shell_test.sql',
  'supabase/tests/database/student_parent_history_test.sql',
  'supabase/tests/database/system_roles_test.sql',
  'supabase/tests/database/teacher_historical_access_test.sql',
  'supabase/tests/database/teacher_payroll_test.sql',
  'supabase/tests/database/teacher_session_workspace_test.sql',
  'supabase/tests/database/training_placement_integrity_test.sql',
  'supabase/tests/database/tuition_branch_pricing_discounts_test.sql',
  'supabase/tests/database/tuition_discount_invoice_lock_test.sql',
  'supabase/tests/database/tuition_operations_rpc_test.sql',
  'supabase/tests/database/tuition_phase1_test.sql',
  'supabase/tests/database/tuition_reminders_test.sql',
  'supabase/tests/database/zalo_admin_read_test.sql',
  'supabase/tests/database/zalo_automatic_renewal_test.sql',
  'supabase/tests/database/zalo_channel_recovery_test.sql',
  'supabase/tests/database/zalo_durable_recovery_test.sql',
  'supabase/tests/database/zalo_payment_notification_z1_test.sql',
  'supabase/tests/database/zalo_template_readiness_test.sql',
  'supabase/tests/database/zalo_webhook_foundation_test.sql',
]


const mode = process.argv[2]
if (mode === 'app') {
  const result = spawnSync(process.execPath, ['--test', ...applicationTests], { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}
if (mode === 'db') {
  for (const file of databaseTests) {
    if (!existsSync(file)) {
      console.error(`Missing required database test: ${file}`)
      process.exit(1)
    }
  }
  console.log(`Regression: ${databaseTests.length} database tests`)
  const result = spawnSync('npx', ['--no-install', 'supabase', 'test', 'db'], { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}
console.error('Usage: node scripts/business-lock.cjs app|db')
process.exit(2)
