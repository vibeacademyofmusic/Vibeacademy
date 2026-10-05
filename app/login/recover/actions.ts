'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { previewRecoveryRedirect } from '@/lib/auth/preview-recovery'
import { createClient } from '@/lib/supabase/server'

export async function sendPasswordSetup(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect('/login/recover?error=' + encodeURIComponent('Nhập email hợp lệ.'))
  }
  const headerStore = await headers()
  const proto = headerStore.get('x-forwarded-proto') || 'https'
  const host = headerStore.get('x-forwarded-host') || headerStore.get('host') || ''
  let redirectTo = ''
  try {
    redirectTo = previewRecoveryRedirect(process.env.NEXT_PUBLIC_SUPABASE_URL || '', `${proto}://${host}`)
  } catch {
    redirect('/login/recover?error=' + encodeURIComponent('Môi trường này không gửi email đặt mật khẩu.'))
  }
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) {
    redirect('/login/recover?error=' + encodeURIComponent('Chưa gửi được email. Thử lại sau.'))
  }
  redirect('/login/recover?sent=1')
}
