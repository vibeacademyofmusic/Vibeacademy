import assert from 'node:assert/strict'
import test from 'node:test'
import { passwordSaveMessage, pilotRecoveryEmail, previewRecoveryRedirect } from '../lib/auth/preview-recovery.ts'

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

test('password save explains a rejected password instead of sending the user back to email', () => {
  assert.equal(passwordSaveMessage('New password should be different from the old password.'), 'Mật khẩu mới phải khác mật khẩu hiện tại.')
  assert.equal(passwordSaveMessage('Password should be at least 6 characters.'), 'Mật khẩu cần ít nhất 8 ký tự.')
  assert.equal(passwordSaveMessage('Auth session missing!'), 'Phiên đặt mật khẩu đã hết. Mở lại trang thiết lập và nhập email một lần nữa.')
  assert.equal(passwordSaveMessage('Password is known to be weak and easy to guess, please choose a different one.'), 'Mật khẩu này quá dễ đoán. Hãy chọn mật khẩu khác.')
})

test('preview recovery refuses the production project', () => {
  assert.throws(() => previewRecoveryRedirect(production, 'https://vibeacademy-staging-example.vercel.app'), /PRODUCTION_AUTH_REFUSED/)
  assert.throws(() => previewRecoveryRedirect(staging, 'https://app.example.com'), /RECOVERY_TARGET_REFUSED/)
})
