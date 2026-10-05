const STAGING_HOST = 'owpfqwdrmyzcmjahehek.supabase.co'
const PRODUCTION_REF = 'qhznfywwrhmcwbkujclm'
const PILOT_EMAILS = new Set([
  'ledang.gudi@gmail.com',
  'nguyenthitramy990@gmail.com',
  'thachthihuynh25@gmail.com',
  'tranhuyphuong28@gmail.com',
])

export function pilotRecoveryEmail(email: string) {
  return PILOT_EMAILS.has(email.trim().toLowerCase())
}

export function previewRecoveryRedirect(supabaseUrl: string, appOrigin: string) {
  const supabase = new URL(supabaseUrl)
  const app = new URL(appOrigin)
  if (supabase.hostname.includes(PRODUCTION_REF) || app.hostname.includes(PRODUCTION_REF)) {
    throw new Error('PRODUCTION_AUTH_REFUSED')
  }
  const local = app.hostname === 'localhost' || app.hostname === '127.0.0.1'
  const preview = app.protocol === 'https:' && app.hostname.endsWith('.vercel.app')
  if (supabase.hostname !== STAGING_HOST || (!local && !preview)) {
    throw new Error('RECOVERY_TARGET_REFUSED')
  }
  return new URL('/auth/callback?next=/login/update-password', app.origin).toString()
}
