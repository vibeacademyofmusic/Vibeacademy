const STAGING_HOST = 'owpfqwdrmyzcmjahehek.supabase.co'
const PRODUCTION_REF = 'qhznfywwrhmcwbkujclm'

export function pilotRecoveryEmail(email: string) {
  const allowed = process.env.VIBE_PREVIEW_RECOVERY_EMAIL_ALLOWLIST
  if (!allowed) return false
  const candidate = email.trim().toLowerCase()
  if (!candidate) return false
  return allowed.split(/[\s,;]+/).some(value => value.toLowerCase() === candidate)
}

export function passwordSaveMessage(message: string) {
  const text = message.toLowerCase()
  if (text.includes('different from the old') || text.includes('should be different')) {
    return 'Mật khẩu mới phải khác mật khẩu hiện tại.'
  }
  if (text.includes('at least') || text.includes('too short') || text.includes('password should be')) {
    return 'Mật khẩu cần ít nhất 8 ký tự.'
  }
  if (text.includes('weak') || text.includes('easy to guess') || text.includes('known') || text.includes('pwned') || text.includes('leaked')) {
    return 'Mật khẩu này quá dễ đoán. Hãy chọn mật khẩu khác.'
  }
  if (text.includes('session') || text.includes('jwt') || text.includes('not authenticated')) {
    return 'Phiên đặt mật khẩu đã hết. Mở lại trang thiết lập và nhập email một lần nữa.'
  }
  return 'Chưa lưu được mật khẩu. Hãy chọn mật khẩu khác rồi thử lại.'
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
