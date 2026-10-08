'use server'

import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { pilotRecoveryEmail, previewRecoveryRedirect } from '@/lib/auth/preview-recovery'

const STAGING_VERIFY = 'https://owpfqwdrmyzcmjahehek.supabase.co/auth/v1/verify'

export async function sendPasswordSetup(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect('/login/recover?error=' + encodeURIComponent('Nhập email hợp lệ.'))
  }
  if (!pilotRecoveryEmail(email)) {
    redirect('/login/recover?error=' + encodeURIComponent('Email này không thuộc tài khoản thí điểm.'))
  }
  const headerStore = await headers()
  const proto = headerStore.get('x-forwarded-proto') || 'https'
  const host = headerStore.get('x-forwarded-host') || headerStore.get('host') || ''
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  let redirectTo = ''
  try {
    redirectTo = previewRecoveryRedirect(supabaseUrl, `${proto}://${host}`)
  } catch {
    redirect('/login/recover?error=' + encodeURIComponent('Môi trường này không mở được trang đặt mật khẩu.'))
  }
  if (!serviceKey) {
    redirect('/login/recover?error=' + encodeURIComponent('Chưa mở được trang đặt mật khẩu. Thử lại sau.'))
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })
  const actionLink = data?.properties?.action_link
  if (error || !actionLink?.startsWith(STAGING_VERIFY)) {
    redirect('/login/recover?error=' + encodeURIComponent('Chưa mở được trang đặt mật khẩu. Thử lại sau.'))
  }
  redirect(actionLink)
}
