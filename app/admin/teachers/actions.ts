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

export async function createTeacher(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const teacherCode = String(
    formData.get('teacher_code') ?? ''
  )
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase()

  const fullName = String(
    formData.get('full_name') ?? ''
  ).trim()

  const preferredName = String(
    formData.get('preferred_name') ?? ''
  ).trim()

  const phone = String(
    formData.get('phone') ?? ''
  ).trim()

  const email = String(
    formData.get('email') ?? ''
  ).trim()

  const qualification = String(
    formData.get('qualification') ?? ''
  ).trim()

  const hireDate = String(
    formData.get('hire_date') ?? ''
  ).trim()

  const notes = String(
    formData.get('notes') ?? ''
  ).trim()

  if (!teacherCode || !fullName) {
    redirect(
      '/admin/teachers?error=Teacher%20code%20and%20full%20name%20are%20required'
    )
  }

  if (!/^[A-Z0-9_-]{2,50}$/.test(teacherCode)) {
    redirect(
      '/admin/teachers?error=Invalid%20teacher%20code'
    )
  }

  const { error } = await supabase
    .from('teachers')
    .insert({
      teacher_code: teacherCode,
      full_name: fullName,
      preferred_name: preferredName || null,
      phone: phone || null,
      email: email || null,
      qualification: qualification || null,
      hire_date: hireDate || null,
      notes: notes || null,
      status: 'ACTIVE',
    })

  if (error) {
    console.error('Create teacher error:', error)

    if (error.code === '23505') {
      redirect(
        '/admin/teachers?error=Teacher%20code%20already%20exists'
      )
    }

    redirect(
      '/admin/teachers?error=Could%20not%20create%20teacher'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/teachers')

  redirect(
    '/admin/teachers?success=Teacher%20created%20successfully'
  )
}

export async function setTeacherStatus(
  formData: FormData
) {
  const supabase = await requireSuperAdmin()

  const id = String(
    formData.get('id') ?? ''
  ).trim()

  const status = String(
    formData.get('status') ?? ''
  ).trim()

  if (
    !id ||
    ![
      'ACTIVE',
      'INACTIVE',
      'ON_LEAVE',
      'ARCHIVED',
    ].includes(status)
  ) {
    redirect(
      '/admin/teachers?error=Invalid%20teacher%20status'
    )
  }

  const { error } = await supabase
    .from('teachers')
    .update({ status })
    .eq('id', id)

  if (error) {
    console.error('Teacher status error:', error)

    redirect(
      '/admin/teachers?error=Could%20not%20change%20teacher%20status'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/teachers')

  redirect(
    '/admin/teachers?success=Teacher%20status%20updated'
  )
}