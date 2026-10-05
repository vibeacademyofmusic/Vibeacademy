import assert from 'node:assert/strict'
import test from 'node:test'
import { pilotRecoveryEmail, previewRecoveryRedirect } from '../lib/auth/preview-recovery.ts'

const staging = 'https://owpfqwdrmyzcmjahehek.supabase.co'
const production = 'https://qhznfywwrhmcwbkujclm.supabase.co'

test('preview recovery stays on the staging project and preview origin', () => {
  const redirect = previewRecoveryRedirect(staging, 'https://vibeacademy-staging-example.vercel.app')
  assert.equal(redirect, 'https://vibeacademy-staging-example.vercel.app/auth/callback?next=/login/update-password')
})

test('only the four pilot accounts can open password setup without email', () => {
  assert.equal(pilotRecoveryEmail('ledang.gudi@gmail.com'), true)
  assert.equal(pilotRecoveryEmail('  NguyenThiTramy990@gmail.com '), true)
  assert.equal(pilotRecoveryEmail('someone@example.com'), false)
})

test('preview recovery refuses the production project', () => {
  assert.throws(() => previewRecoveryRedirect(production, 'https://vibeacademy-staging-example.vercel.app'), /PRODUCTION_AUTH_REFUSED/)
  assert.throws(() => previewRecoveryRedirect(staging, 'https://app.example.com'), /RECOVERY_TARGET_REFUSED/)
})
