'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

async function requireSuperAdmin() {
  const supabase = await createClient()

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()

  if (claimsError || !claimsData?.claims) {
    redirect('/login')
  }

  const { data: isSuperAdmin, error: roleError } =
    await supabase.rpc('has_role', {
      role_code: 'SUPER_ADMIN',
    })

  if (roleError || !isSuperAdmin) {
    redirect('/login?error=Unauthorized')
  }

  return supabase
}

export async function createStudent(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const studentCode = String(
    formData.get('student_code') ?? ''
  )
    .trim()
    .toUpperCase()

  const fullName = String(
    formData.get('full_name') ?? ''
  ).trim()

  const branchId = String(
    formData.get('default_branch_id') ?? ''
  ).trim()

  if (!studentCode || !fullName || !branchId) {
    redirect(
      '/admin/students?error=Student%20code%2C%20name%20and%20branch%20are%20required'
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  const { error } = await supabase
    .from('students')
    .insert({
      student_code: studentCode,
      full_name: fullName,
      default_branch_id: branchId,
      admission_date: today,
      status: 'ACTIVE',
    })

  if (error) {
    console.error('Create student error:', error)

    if (error.code === '23505') {
      redirect(
        '/admin/students?error=Student%20code%20already%20exists'
      )
    }

    redirect(
      '/admin/students?error=Could%20not%20create%20student'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/students')

  redirect(
    '/admin/students?success=Student%20created%20successfully'
  )
}