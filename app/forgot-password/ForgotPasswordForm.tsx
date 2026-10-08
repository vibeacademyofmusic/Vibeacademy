'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { FormField, InlineNotice } from '@/app/admin/_components/vibe'
import { createRecoveryClient } from '@/lib/supabase/recovery-client'
import { recoveryEmailMessage, recoveryError, requestPasswordRecovery } from '@/lib/auth/password-recovery'

export default function ForgotPasswordForm({ redirectTo }: { redirectTo: string | null }) {
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !redirectTo) return
    const data = new FormData(event.currentTarget)
    setPending(true); setError(null)
    try {
      const result = await requestPasswordRecovery(createRecoveryClient().auth, String(data.get('email') ?? ''), redirectTo)
      setError(result.error); setSent(!result.error)
    } catch { setError(recoveryError(null)) } finally { setPending(false) }
  }
  return <div className="space-y-5">
    {!redirectTo && <InlineNotice tone="error">Chưa thể gửi liên kết lúc này. Vui lòng liên hệ quản trị viên để kiểm tra địa chỉ khôi phục mật khẩu.</InlineNotice>}
    {error && <InlineNotice tone="error">{error}</InlineNotice>}
    {sent ? <InlineNotice>{recoveryEmailMessage}</InlineNotice> : <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
      <FormField label="Email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending}/>
      <button className="vibe-button vibe-button-primary w-full" disabled={pending || !redirectTo}>{pending ? 'Đang gửi liên kết…' : 'Gửi liên kết đặt lại mật khẩu'}</button>
    </form>}
    <Link href="/login" className="vibe-button w-full">Quay lại đăng nhập</Link>
  </div>
}
