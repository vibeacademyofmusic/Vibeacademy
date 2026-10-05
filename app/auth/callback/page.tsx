'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const PASSWORD_NEXT = '/login/update-password'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState('Đang mở liên kết...')

  useEffect(() => {
    const finish = async () => {
      const current = new URL(window.location.href)
      const hash = new URLSearchParams(current.hash.replace(/^#/, ''))
      const type = hash.get('type')
      const requested = current.searchParams.get('next')
      const next = requested === PASSWORD_NEXT || type === 'recovery' ? PASSWORD_NEXT : '/login'
      const supabase = createClient()
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')
      const code = current.searchParams.get('code')
      const error = accessToken && refreshToken
        ? (await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })).error
        : code
          ? (await supabase.auth.exchangeCodeForSession(code)).error
          : new Error('missing')
      if (error) {
        setMessage('Liên kết không còn hiệu lực.')
        router.replace('/login/recover?error=' + encodeURIComponent('Liên kết không còn hiệu lực.'))
        return
      }
      router.replace(next)
    }
    void finish()
  }, [router])

  return (
    <main className="vibe-admin flex min-h-screen items-center justify-center px-4">
      <p className="text-sm text-[var(--vibe-navy)]">{message}</p>
    </main>
  )
}
