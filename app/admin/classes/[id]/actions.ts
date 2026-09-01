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

export async function assignTeacher(
  formData: FormData
) {
  const supabase = await requireSuperAdmin()

  const classId = String(
    formData.get('class_id') ?? ''
  ).trim()

  const teacherId = String(
    formData.get('teacher_id') ?? ''
  ).trim()

  const teacherRole = String(
    formData.get('teacher_role') ?? ''
  ).trim()

  if (
    !classId ||
    !teacherId ||
    !['PRIMARY', 'ASSISTANT'].includes(teacherRole)
  ) {
    redirect(
      `/admin/classes/${classId}?error=Invalid%20teacher%20assignment`
    )
  }

  const { data: classItem } = await supabase
    .from('classes')
    .select('id')
    .eq('id', classId)
    .maybeSingle()

  if (!classItem) {
    redirect('/admin/classes?error=Class%20not%20found')
  }

  const { data: teacher } = await supabase
    .from('teachers')
    .select('id, status')
    .eq('id', teacherId)
    .maybeSingle()

  if (!teacher || teacher.status !== 'ACTIVE') {
    redirect(
      `/admin/classes/${classId}?error=Teacher%20is%20not%20active`
    )
  }

  const today = new Date()
    .toISOString()
    .slice(0, 10)

  const { error } = await supabase
    .from('class_teachers')
    .upsert(
      {
        class_id: classId,
        teacher_id: teacherId,
        teacher_role: teacherRole,
        is_active: true,
        assigned_at: today,
        ended_at: null,
      },
      {
        onConflict: 'class_id,teacher_id',
      }
    )

  if (error) {
    console.error(
      'Assign teacher error:',
      error
    )

    if (error.code === '23505') {
      redirect(
        `/admin/classes/${classId}?error=This%20class%20already%20has%20an%20active%20primary%20teacher`
      )
    }

    redirect(
      `/admin/classes/${classId}?error=Could%20not%20assign%20teacher`
    )
  }

  revalidatePath('/admin/classes')
  revalidatePath(`/admin/classes/${classId}`)

  redirect(
    `/admin/classes/${classId}?success=Teacher%20assigned%20successfully`
  )
}

export async function removeTeacher(
  formData: FormData
) {
  const supabase = await requireSuperAdmin()

  const assignmentId = String(
    formData.get('assignment_id') ?? ''
  ).trim()

  const classId = String(
    formData.get('class_id') ?? ''
  ).trim()

  if (!assignmentId || !classId) {
    redirect(
      `/admin/classes/${classId}?error=Invalid%20teacher%20assignment`
    )
  }

  const today = new Date()
    .toISOString()
    .slice(0, 10)

  const { error } = await supabase
    .from('class_teachers')
    .update({
      is_active: false,
      ended_at: today,
    })
    .eq('id', assignmentId)
    .eq('class_id', classId)

  if (error) {
    console.error(
      'Remove teacher error:',
      error
    )

    redirect(
      `/admin/classes/${classId}?error=Could%20not%20remove%20teacher`
    )
  }

  revalidatePath('/admin/classes')
  revalidatePath(`/admin/classes/${classId}`)

  redirect(
    `/admin/classes/${classId}?success=Teacher%20removed%20successfully`
  )
}