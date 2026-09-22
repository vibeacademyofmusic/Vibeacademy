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

  if (!roleError && !isSuperAdmin) {
    const roles = await Promise.all(['FINANCE', 'BRANCH_ADMIN', 'TEACHER'].map(role_code => supabase.rpc('has_role', { role_code })))
    if (!roles[0].error && roles[0].data === true) {
      revalidatePath('/', 'layout')
      redirect('/finance')
    }
    const branchAdmin = !roles[1].error && roles[1].data === true
    if (branchAdmin) {
      const shell = await supabase.rpc('crm_shell_may_enter')
      if (!shell.error && shell.data === true) {
        revalidatePath('/', 'layout')
        redirect('/admin/business')
      }
      const students = await supabase.rpc('student_ops_may_enter')
      if (!students.error && students.data === true) {
        revalidatePath('/', 'layout')
        redirect('/admin/students')
      }
    }
    if (roles.slice(1).some(role => !role.error && role.data === true)) {
      revalidatePath('/', 'layout')
      redirect('/operations')
    }
  }

  if (!roleError && !isSuperAdmin) {
    const {data:staff,error:staffError}=await supabase.rpc('has_role',{role_code:'STAFF'})
    if (!staffError && staff === true) {
      revalidatePath('/', 'layout')
      redirect('/my-payroll')
    }
  }

  if (roleError || !isSuperAdmin) {
    if (!roleError) {
      const family = await Promise.all(['STUDENT', 'PARENT'].map(role_code => supabase.rpc('has_role', { role_code })))
      if (family.some(role => !role.error && role.data === true)) {
        revalidatePath('/', 'layout')
        redirect('/my-learning')
      }
    }
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
