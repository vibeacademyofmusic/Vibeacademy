const { spawnSync } = require('node:child_process')

// Reviewed registration-at-counter and Zalo-phone contract. Keep this list explicit:
// a renamed or removed test must fail the release gate instead of disappearing.
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
  'tests/zalo-recovery-controls.test.cjs',
  'tests/zalo-registration-recovery-action.test.cjs',
  'tests/zalo-template-readiness.test.cjs',
  'tests/zalo-webhook-foundation.test.cjs',
]

const databaseTests = [
  'supabase/tests/database/registration_agreed_deposit_test.sql',
  'supabase/tests/database/registration_branch_payment_option_test.sql',
  'supabase/tests/database/registration_momo_deposit_test.sql',
  'supabase/tests/database/registration_payos_test.sql',
  'supabase/tests/database/registration_zalo_consent_lifecycle_test.sql',
  'supabase/tests/database/counter_intake_test.sql',
  'supabase/tests/database/zalo_channel_recovery_test.sql',
  'supabase/tests/database/zalo_durable_recovery_test.sql',
  'supabase/tests/database/zalo_template_readiness_test.sql',
]

const mode = process.argv[2]
if (mode === 'app') {
  const result = spawnSync(process.execPath, ['--test', ...applicationTests], { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}
if (mode === 'db') {
  for (const file of databaseTests) {
    console.log(`\nRegression: ${file}`)
    const result = spawnSync('npx', ['--no-install', 'supabase', 'test', 'db', file], { stdio: 'inherit' })
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  process.exit(0)
}
console.error('Usage: node scripts/business-lock.cjs app|db')
process.exit(2)
