const STAGING_HOST = 'owpfqwdrmyzcmjahehek.supabase.co'
const PRODUCTION_REF = 'qhznfywwrhmcwbkujclm'

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
