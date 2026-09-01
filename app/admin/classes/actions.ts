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

export async function createClass(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const branchId = String(
    formData.get('branch_id') ?? ''
  ).trim()

  const courseId = String(
    formData.get('course_id') ?? ''
  ).trim()

  const code = String(formData.get('code') ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase()

  const name = String(
    formData.get('name') ?? ''
  ).trim()

  const classType = String(
    formData.get('class_type') ?? ''
  ).trim()

  const capacityValue = String(
    formData.get('capacity') ?? ''
  ).trim()

  const capacity = Number(capacityValue)

  const startDateValue = String(
    formData.get('start_date') ?? ''
  ).trim()

  const endDateValue = String(
    formData.get('end_date') ?? ''
  ).trim()

  const notes = String(
    formData.get('notes') ?? ''
  ).trim()

  if (
    !branchId ||
    !courseId ||
    !code ||
    !name ||
    !classType
  ) {
    redirect(
      '/admin/classes?error=Branch%2C%20course%2C%20code%2C%20name%20and%20class%20type%20are%20required'
    )
  }

  if (!/^[A-Z0-9_-]{2,50}$/.test(code)) {
    redirect(
      '/admin/classes?error=Invalid%20class%20code'
    )
  }

  if (
    !['ONE_ON_ONE', 'GROUP'].includes(classType)
  ) {
    redirect(
      '/admin/classes?error=Invalid%20class%20type'
    )
  }

  if (
    !Number.isInteger(capacity) ||
    capacity <= 0
  ) {
    redirect(
      '/admin/classes?error=Invalid%20class%20capacity'
    )
  }

  if (
    classType === 'ONE_ON_ONE' &&
    capacity !== 1
  ) {
    redirect(
      '/admin/classes?error=One-on-one%20classes%20must%20have%20capacity%201'
    )
  }

  if (
    classType === 'GROUP' &&
    capacity < 2
  ) {
    redirect(
      '/admin/classes?error=Group%20classes%20must%20have%20capacity%20of%20at%20least%202'
    )
  }

  if (
    startDateValue &&
    endDateValue &&
    endDateValue < startDateValue
  ) {
    redirect(
      '/admin/classes?error=End%20date%20cannot%20be%20before%20start%20date'
    )
  }

  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('status', 'ACTIVE')
    .maybeSingle()

  if (!branch) {
    redirect(
      '/admin/classes?error=Invalid%20or%20inactive%20branch'
    )
  }

  const { data: course } = await supabase
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .eq('status', 'ACTIVE')
    .maybeSingle()

  if (!course) {
    redirect(
      '/admin/classes?error=Invalid%20or%20inactive%20course'
    )
  }

  const { error } = await supabase
    .from('classes')
    .insert({
      branch_id: branchId,
      course_id: courseId,
      code,
      name,
      class_type: classType,
      capacity,
      start_date: startDateValue || null,
      end_date: endDateValue || null,
      notes: notes || null,
      status: 'DRAFT',
    })

  if (error) {
    if (error.code === '23505') {
      redirect(
        '/admin/classes?error=This%20class%20code%20already%20exists%20at%20this%20branch'
      )
    }

    redirect(
      '/admin/classes?error=Could%20not%20create%20class'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/classes')

  redirect(
    '/admin/classes?success=Class%20created%20successfully'
  )
}

export async function setClassStatus(
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
      'DRAFT',
      'ACTIVE',
      'COMPLETED',
      'CANCELLED',
    ].includes(status)
  ) {
    redirect(
      '/admin/classes?error=Invalid%20class%20status'
    )
  }

  const { error } = await supabase
    .from('classes')
    .update({
      status,
    })
    .eq('id', id)

  if (error) {
    redirect(
      '/admin/classes?error=Could%20not%20change%20class%20status'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/classes')

  redirect(
    '/admin/classes?success=Class%20status%20updated'
  )
}