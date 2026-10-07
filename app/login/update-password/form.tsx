'use client'

import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { passwordSaveMessage } from '@/lib/auth/preview-recovery'
import { createClient } from '@/lib/supabase/client'
import styles from '@/app/_components/auth/auth-shell.module.css'

export function UpdatePasswordForm({ client }: { client?: SupabaseClient }) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    const confirm = String(form.get('confirm') ?? '')
    if (password.length < 8 || password !== confirm) {
      setError('Mật khẩu cần ít nhất 8 ký tự và phải trùng nhau.')
      return
    }
    setPending(true)
    setError('')
    const supabase = client ?? createClient()
    if (!client) {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setPending(false)
        setError('Phiên đặt mật khẩu đã hết. Mở lại trang thiết lập và nhập email một lần nữa.')
        return
      }
    }
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setPending(false)
      setError(passwordSaveMessage(updateError.message))
      return
    }
    try {
      await supabase.auth.signOut()
    } catch {
      // The password is already stored. Sign-in starts from a clean session.
    }
    window.location.assign('/login?notice=' + encodeURIComponent('Mật khẩu đã được lưu. Đăng nhập bằng mật khẩu mới.'))
  }

  return (
    <form onSubmit={onSubmit} className={styles.form}>
      {error ? <p className={styles.alert} role="alert">{error}</p> : null}
      {client ? <p className="text-sm text-[var(--vibe-muted)]">Phiên đặt mật khẩu còn hiệu lực. Mật khẩu mới phải khác mật khẩu hiện tại.</p> : null}
      <label className={styles.field} htmlFor="password">
        <span>Mật khẩu mới</span>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      <label className={styles.field} htmlFor="confirm">
        <span>Nhập lại mật khẩu</span>
        <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? 'Đang lưu...' : 'Lưu mật khẩu'}
      </button>
    </form>
  )
}
