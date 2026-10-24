'use client'

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { UpdatePasswordForm } from '@/app/login/update-password/form'
import { createClient } from '@/lib/supabase/client'

const PASSWORD_NEXT = '/login/update-password'

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('Đang mở liên kết...')
  const [client, setClient] = useState<SupabaseClient | null>(null)

  useEffect(() => {
    const finish = async () => {
      const current = new URL(window.location.href)
      const hash = new URLSearchParams(current.hash.replace(/^#/, ''))
      const type = hash.get('type')
      const requested = current.searchParams.get('next')
      const next = requested === PASSWORD_NEXT || type === 'recovery' ? PASSWORD_NEXT : '/login'
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')
      const code = current.searchParams.get('code')
      const supabase = createClient()
      const result = accessToken && refreshToken
        ? await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        : code
          ? await supabase.auth.exchangeCodeForSession(code)
          : { data: { session: null }, error: new Error('missing') }
      if (result.error || !result.data.session) {
        setMessage('Liên kết không còn hiệu lực.')
        window.location.replace('/login/recover?error=' + encodeURIComponent('Liên kết không còn hiệu lực.'))
        return
      }
      if (next === PASSWORD_NEXT) {
        window.history.replaceState(null, '', PASSWORD_NEXT)
        setClient(supabase)
        return
      }
      window.location.replace(next)
    }
    void finish()
  }, [])

  if (!client) {
    return (
      <main className="vibe-admin flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-[var(--vibe-navy)]">{message}</p>
      </main>
    )
  }

  return (
    <main className="vibe-admin flex min-h-screen items-center justify-center px-4 py-10">
      <section className="vibe-card w-full max-w-md">
        <h1>Đặt mật khẩu mới</h1>
        <p className="mt-2 text-sm text-[var(--vibe-muted)]">Nhập mật khẩu mới cho tài khoản thí điểm. Mật khẩu này dùng để đăng nhập bản xem trước.</p>
        <UpdatePasswordForm client={client} />
        <p className="mt-6 text-sm"><Link className="underline" href="/login">Quay lại đăng nhập</Link></p>
      </section>
    </main>
  )
}
