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

export async function createCourse(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const curriculumId = String(
    formData.get('curriculum_id') ?? ''
  ).trim()

  const levelIdValue = String(
    formData.get('level_id') ?? ''
  ).trim()

  const levelId = levelIdValue || null

  const code = String(formData.get('code') ?? '')
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .trim()
  .replace(/\s+/g, '_')
  .toUpperCase()

  const name = String(formData.get('name') ?? '').trim()

  const description = String(
    formData.get('description') ?? ''
  ).trim()

  if (!curriculumId || !code || !name) {
    redirect(
      '/admin/courses?error=Curriculum%2C%20course%20code%20and%20name%20are%20required'
    )
  }

  if (!/^[A-Z0-9_-]{2,50}$/.test(code)) {
    redirect(
      '/admin/courses?error=Invalid%20course%20code'
    )
  }

  const { data: curriculum } = await supabase
    .from('curriculums')
    .select('id')
    .eq('id', curriculumId)
    .eq('status', 'ACTIVE')
    .maybeSingle()

  if (!curriculum) {
    redirect(
      '/admin/courses?error=Invalid%20curriculum'
    )
  }

  if (levelId) {
    const { data: level } = await supabase
      .from('curriculum_levels')
      .select('id')
      .eq('id', levelId)
      .eq('curriculum_id', curriculumId)
      .maybeSingle()

    if (!level) {
      redirect(
        '/admin/courses?error=Selected%20level%20does%20not%20belong%20to%20this%20curriculum'
      )
    }
  }

  const { error } = await supabase
    .from('courses')
    .insert({
      curriculum_id: curriculumId,
      level_id: levelId,
      code,
      name,
      description: description || null,
      status: 'ACTIVE',
    })

  if (error) {
    if (error.code === '23505') {
      redirect(
        '/admin/courses?error=This%20course%20code%20already%20exists'
      )
    }

    redirect(
      '/admin/courses?error=Could%20not%20create%20course'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/courses')

  redirect(
    '/admin/courses?success=Course%20created%20successfully'
  )
}

export async function setCourseStatus(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const id = String(formData.get('id') ?? '').trim()
  const status = String(
    formData.get('status') ?? ''
  ).trim()

  if (
    !id ||
    !['ACTIVE', 'INACTIVE'].includes(status)
  ) {
    redirect(
      '/admin/courses?error=Invalid%20course%20status'
    )
  }

  const { error } = await supabase
    .from('courses')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    redirect(
      '/admin/courses?error=Could%20not%20change%20course%20status'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/courses')

  redirect(
    '/admin/courses?success=Course%20status%20updated'
  )
}