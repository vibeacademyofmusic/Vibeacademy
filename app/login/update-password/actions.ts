'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function updatePassword(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  if (password.length < 8 || password !== confirm) {
    redirect('/login/update-password?error=' + encodeURIComponent('Mật khẩu cần ít nhất 8 ký tự và phải trùng nhau.'))
  }
  const supabase = await createClient()
  const { data, error: userError } = await supabase.auth.getUser()
  if (userError || !data.user) {
    redirect('/login/recover?error=' + encodeURIComponent('Mở liên kết trong email trước khi đặt mật khẩu.'))
  }
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    redirect('/login/update-password?error=' + encodeURIComponent('Chưa lưu được mật khẩu. Mở lại liên kết trong email.'))
  }
  redirect('/login?error=' + encodeURIComponent('Mật khẩu đã được lưu. Đăng nhập bằng mật khẩu mới.'))
}
