'use client'

import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { passwordSaveMessage } from '@/lib/auth/preview-recovery'
import { createClient } from '@/lib/supabase/client'

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
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {error ? <p className="text-sm text-[var(--vibe-danger,#9b2c2c)]">{error}</p> : null}
      {client ? <p className="text-sm text-[var(--vibe-muted)]">Phiên đặt mật khẩu còn hiệu lực. Mật khẩu mới phải khác mật khẩu hiện tại.</p> : null}
      <label className="block text-sm font-semibold text-[var(--vibe-navy)]" htmlFor="password">
        Mật khẩu mới
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="mt-2 w-full border px-3 py-2" />
      </label>
      <label className="block text-sm font-semibold text-[var(--vibe-navy)]" htmlFor="confirm">
        Nhập lại mật khẩu
        <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="mt-2 w-full border px-3 py-2" />
      </label>
      <button className="vibe-button vibe-button-primary w-full" type="submit" disabled={pending}>
        {pending ? 'Đang lưu...' : 'Lưu mật khẩu'}
      </button>
    </form>
  )
}
