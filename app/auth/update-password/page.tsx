import type { Metadata } from 'next'
import AuthShell from '@/app/_components/auth/AuthShell'
import UpdatePasswordForm from './UpdatePasswordForm'

export const metadata: Metadata = { title: 'Đặt mật khẩu mới | VIBE Academy', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default function UpdatePasswordPage() {
  return <AuthShell title="Đặt mật khẩu mới" description="Tạo mật khẩu mới cho tài khoản VIBE của bạn.">
    <UpdatePasswordForm/>
  </AuthShell>
}
