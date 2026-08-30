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

export async function updateStudent(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const id = String(formData.get('id') ?? '').trim()

  const studentCode = String(
    formData.get('student_code') ?? ''
  )
    .trim()
    .toUpperCase()

  const fullName = String(
    formData.get('full_name') ?? ''
  ).trim()

  const preferredName = String(
    formData.get('preferred_name') ?? ''
  ).trim()

  const branchId = String(
    formData.get('default_branch_id') ?? ''
  ).trim()

  const dateOfBirth = String(
    formData.get('date_of_birth') ?? ''
  ).trim()

  const gender = String(
    formData.get('gender') ?? ''
  ).trim()

  const phone = String(
    formData.get('phone') ?? ''
  ).trim()

  const email = String(
    formData.get('email') ?? ''
  ).trim()

  const address = String(
    formData.get('address') ?? ''
  ).trim()

  const admissionDate = String(
    formData.get('admission_date') ?? ''
  ).trim()

  const notes = String(
    formData.get('notes') ?? ''
  ).trim()

  if (!id || !studentCode || !fullName || !branchId) {
    redirect(
      `/admin/students/${id}?error=Required%20information%20is%20missing`
    )
  }

  const { error } = await supabase
    .from('students')
    .update({
      student_code: studentCode,
      full_name: fullName,
      preferred_name: preferredName || null,
      default_branch_id: branchId,
      date_of_birth: dateOfBirth || null,
      gender: gender || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      admission_date: admissionDate || null,
      notes: notes || null,
    })
    .eq('id', id)

  if (error) {
    console.error('Update student error:', error)

    if (error.code === '23505') {
      redirect(
        `/admin/students/${id}?error=Student%20code%20already%20exists`
      )
    }

    redirect(
      `/admin/students/${id}?error=Could%20not%20update%20student`
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/students')
  revalidatePath(`/admin/students/${id}`)

  redirect(
    '/admin/students?success=Student%20updated%20successfully'
  )
}

export async function setStudentStatus(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const id = String(formData.get('id') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()

  if (!id || !['ACTIVE', 'INACTIVE'].includes(status)) {
    redirect(
      '/admin/students?error=Invalid%20student%20status'
    )
  }

  const { error } = await supabase
    .from('students')
    .update({ status })
    .eq('id', id)

  if (error) {
    console.error('Student status error:', error)

    redirect(
      '/admin/students?error=Could%20not%20change%20student%20status'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/students')
}