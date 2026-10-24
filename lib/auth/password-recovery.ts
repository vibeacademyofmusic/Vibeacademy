import type { SupabaseClient } from '@supabase/supabase-js'

type Auth = SupabaseClient['auth']
export type RecoveryProofStore = { get: () => string | null; set: (sessionId: string) => void }
const recoverySessions = new WeakMap<Auth, string>()
export const expiredRecoveryMessage = 'Liên kết đặt lại mật khẩu đã hết hạn hoặc đã được sử dụng.'
export const recoveryEmailMessage = 'Nếu email thuộc một tài khoản VIBE, bạn sẽ nhận được liên kết đặt lại mật khẩu. Vui lòng kiểm tra cả thư rác và mở liên kết trong trình duyệt này.'
export const recoverySuccessMessage = 'Mật khẩu đã được cập nhật.'

export function passwordValidation(password: string, confirmation: string) {
  if (!password || !confirmation) return 'Vui lòng nhập đầy đủ mật khẩu mới và xác nhận mật khẩu.'
  if (password !== confirmation) return 'Mật khẩu xác nhận chưa khớp.'
  // Supabase enforces the project's current length/strength/breached-password policy.
  if (password.length < 6) return 'Mật khẩu cần có ít nhất 6 ký tự.'
  return null
}

export function recoveryError(error: { code?: string; status?: number } | null | undefined) {
  if (error?.code === 'weak_password') return 'Mật khẩu chưa đáp ứng yêu cầu bảo mật. Hãy dùng mật khẩu dài hơn, kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt; tránh mật khẩu đã bị lộ.'
  if (error?.code === 'same_password') return 'Mật khẩu mới phải khác mật khẩu hiện tại.'
  if (error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit' || error?.status === 429) return 'Bạn đã thử quá nhiều lần. Vui lòng chờ ít phút rồi thử lại.'
  if (['otp_expired', 'access_denied', 'session_not_found', 'session_expired', 'refresh_token_not_found', 'bad_jwt'].includes(error?.code ?? '')) return expiredRecoveryMessage
  return 'Chưa thể kết nối để hoàn tất yêu cầu. Vui lòng kiểm tra mạng và thử lại.'
}

export async function requestPasswordRecovery(auth: Auth, email: string, redirectTo: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return { error: 'Vui lòng nhập email hợp lệ.' }
  const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo })
  // The same success text is used for existing and unknown addresses.
  return { error: error ? recoveryError(error) : null }
}

async function verifiedIdentity(auth: Auth) {
  const user = await auth.getUser()
  if (user.error || !user.data.user) return null
  const verified = await auth.getClaims()
  const claims = verified.data?.claims
  if (verified.error || !claims || claims.sub !== user.data.user.id || typeof claims.session_id !== 'string') return null
  return { user: user.data.user, claims }
}

export async function verifiedRecoveryUser(auth: Auth) {
  const identity = await verifiedIdentity(auth)
  return identity && recoverySessions.get(auth) === identity.claims.session_id ? identity.user : null
}

export async function beginPasswordRecovery(auth: Auth, url: URL, proofStore?: RecoveryProofStore) {
  recoverySessions.delete(auth)
  const hash = new URLSearchParams(url.hash.slice(1))
  if (['error', 'error_code', 'error_description'].some(key => url.searchParams.has(key) || hash.has(key))) return false
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  let recoveryVerified = false
  if (code) {
    const flowId = url.searchParams.get('sb_flow_id')
    const { data, error } = await auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
    // auth-js returns redirectType from the PKCE verifier's recovery marker.
    // The installed SDK's public return type omits this runtime field.
    if (error || (data as { redirectType?: string }).redirectType !== 'recovery') return false
    recoveryVerified = true
  } else if (tokenHash && url.searchParams.get('type') === 'recovery') {
    const { error } = await auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    if (error) return false
    recoveryVerified = true
  } else if (hash.get('type') === 'recovery' && hash.get('access_token') && hash.get('refresh_token')) {
    // Fresh implicit links from Supabase email/dashboard are isolated from the portal.
    const { error } = await auth.setSession({ access_token: hash.get('access_token')!, refresh_token: hash.get('refresh_token')! })
    if (error) return false
    const identity = await verifiedIdentity(auth)
    if (!identity || !identity.claims.amr?.some(method => typeof method === 'object' && ['recovery', 'otp'].includes(method.method))) return false
    recoveryVerified = true
  }
  const identity = await verifiedIdentity(auth)
  if (!identity) return false
  const sessionId = identity.claims.session_id
  // A reload must match the session previously verified in this recovery tab.
  // The marker contains no bearer credential and is not application authorization.
  if (!recoveryVerified && proofStore?.get() !== sessionId) return false
  recoverySessions.set(auth, sessionId)
  proofStore?.set(sessionId)
  return true
}

export async function changeRecoveredPassword(auth: Auth, password: string, confirmation: string) {
  const validation = passwordValidation(password, confirmation)
  if (validation) return { error: validation }
  if (!await verifiedRecoveryUser(auth)) return { error: expiredRecoveryMessage }
  const { error } = await auth.updateUser({ password })
  return { error: error ? recoveryError(error) : null }
}
