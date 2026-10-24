import type { Metadata } from 'next'
import AuthShell from '@/app/_components/auth/AuthShell'
import { recoveryRedirectUrl } from '@/lib/auth/site-url'
import ForgotPasswordForm from './ForgotPasswordForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Quên mật khẩu | VIBE Academy', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default function ForgotPasswordPage() {
  let redirectTo: string | null = null
  try { redirectTo = recoveryRedirectUrl() } catch { /* Fail closed if the public domain is not configured. */ }
  return <AuthShell title="Quên mật khẩu" description="Nhập email đăng nhập để nhận liên kết đặt lại mật khẩu.">
    <ForgotPasswordForm redirectTo={redirectTo}/>
  </AuthShell>
}
