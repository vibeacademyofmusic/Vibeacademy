'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FormField, InlineNotice } from '@/app/admin/_components/vibe'
import { createRecoveryClient, endRecoverySession, recoveryProofStore } from '@/lib/supabase/recovery-client'
import { beginPasswordRecovery, changeRecoveredPassword, expiredRecoveryMessage, recoveryError, recoverySuccessMessage } from '@/lib/auth/password-recovery'

export default function UpdatePasswordForm() {
  const [state, setState] = useState<'checking' | 'ready' | 'invalid' | 'success'>('checking')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initialization = useRef<Promise<boolean> | null>(null)
  useEffect(() => {
    let active = true
    if (!initialization.current) {
      const url = new URL(window.location.href)
      // Strip credentials/errors before rendering links or making further requests.
      window.history.replaceState(window.history.state, '', '/auth/update-password')
      initialization.current = beginPasswordRecovery(createRecoveryClient().auth, url, recoveryProofStore).catch(() => false)
    }
    void initialization.current.then(async valid => {
      if (!active) return
      if (!valid) await endRecoverySession().catch(() => undefined)
      if (active) setState(valid ? 'ready' : 'invalid')
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (state !== 'success') return
    const timer = window.setTimeout(() => window.location.replace('/login?recovery=success'), 1800)
    return () => window.clearTimeout(timer)
  }, [state])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || state !== 'ready') return
    const form = event.currentTarget
    const data = new FormData(form)
    setPending(true); setError(null)
    try {
      const result = await changeRecoveredPassword(createRecoveryClient().auth, String(data.get('password') ?? ''), String(data.get('confirmation') ?? ''))
      if (result.error) { setError(result.error); if (result.error === expiredRecoveryMessage) setState('invalid'); return }
      form.reset()
      await endRecoverySession().catch(() => undefined)
      setState('success')
    } catch { setError(recoveryError(null)) } finally { setPending(false) }
  }
  if (state === 'checking') return <InlineNotice>Đang kiểm tra liên kết khôi phục…</InlineNotice>
  if (state === 'invalid') return <div className="space-y-5"><InlineNotice tone="error">{expiredRecoveryMessage}</InlineNotice><Link href="/forgot-password" className="vibe-button vibe-button-primary w-full">Gửi lại liên kết</Link><Link href="/login" className="vibe-button w-full">Quay lại đăng nhập</Link></div>
  if (state === 'success') return <div className="space-y-5"><InlineNotice>{recoverySuccessMessage} Bạn sẽ được chuyển về trang đăng nhập.</InlineNotice><Link href="/login?recovery=success" className="vibe-button w-full">Đăng nhập</Link></div>
  return <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
    {error && <InlineNotice tone="error">{error}</InlineNotice>}
    <FormField label="Mật khẩu mới" name="password" type="password" autoComplete="new-password" required minLength={6} disabled={pending}/>
    <FormField label="Xác nhận mật khẩu" name="confirmation" type="password" autoComplete="new-password" required minLength={6} disabled={pending}/>
    <p className="text-xs text-[var(--vibe-muted)]">Dùng mật khẩu dài, khó đoán và chưa dùng cho tài khoản khác.</p>
    <button className="vibe-button vibe-button-primary w-full" disabled={pending}>{pending ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}</button>
  </form>
}
