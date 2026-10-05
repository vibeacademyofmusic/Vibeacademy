import assert from 'node:assert/strict'
import test from 'node:test'
import { previewRecoveryRedirect } from '../lib/auth/preview-recovery.ts'

const staging = 'https://owpfqwdrmyzcmjahehek.supabase.co'
const production = 'https://qhznfywwrhmcwbkujclm.supabase.co'

test('preview recovery stays on the staging project and preview origin', () => {
  const redirect = previewRecoveryRedirect(staging, 'https://vibeacademy-staging-example.vercel.app')
  assert.equal(redirect, 'https://vibeacademy-staging-example.vercel.app/auth/callback?next=/login/update-password')
})

test('preview recovery refuses the production project', () => {
  assert.throws(() => previewRecoveryRedirect(production, 'https://vibeacademy-staging-example.vercel.app'), /PRODUCTION_AUTH_REFUSED/)
  assert.throws(() => previewRecoveryRedirect(staging, 'https://app.example.com'), /RECOVERY_TARGET_REFUSED/)
})
