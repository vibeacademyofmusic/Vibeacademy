'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    redirect('/login?error=Please%20enter%20email%20and%20password')
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    redirect('/login?error=Invalid%20email%20or%20password')
  }

  // Kiểm tra đây có phải SUPER_ADMIN không
  const { data: isSuperAdmin, error: roleError } = await supabase.rpc(
    'has_role',
    {
      role_code: 'SUPER_ADMIN',
    }
  )

  if (roleError || !isSuperAdmin) {
    await supabase.auth.signOut()

    redirect(
      '/login?error=This%20account%20does%20not%20have%20admin%20access'
    )
  }

  revalidatePath('/', 'layout')
  redirect('/admin')
}

export async function logout() {
  const supabase = await createClient()

  await supabase.auth.signOut()

  revalidatePath('/', 'layout')
  redirect('/login')
}