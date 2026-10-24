'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import styles from '@/app/_components/auth/auth-shell.module.css'
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
  return <div>
    {!redirectTo && <p className={styles.alert} role="alert">Chưa thể gửi liên kết lúc này. Vui lòng liên hệ quản trị viên để kiểm tra địa chỉ khôi phục mật khẩu.</p>}
    {error && <p className={styles.alert} role="alert">{error}</p>}
    {sent ? <p className={styles.success} role="status">{recoveryEmailMessage}</p> : <form onSubmit={submit} className={styles.form} aria-busy={pending}>
      <label className={styles.field} htmlFor="email">
        <span>Email</span>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending}/>
      </label>
      <button className={styles.submit} disabled={pending || !redirectTo}>{pending ? 'Đang gửi liên kết…' : 'Gửi liên kết đặt lại mật khẩu'}</button>
    </form>}
    <p className={styles.secondary}><Link href="/login">Quay lại đăng nhập</Link></p>
  </div>
}
