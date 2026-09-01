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
export async function enrollStudent(
    formData: FormData
  ) {
    const supabase = await requireSuperAdmin()
  
    const classId = String(
      formData.get('class_id') ?? ''
    ).trim()
  
    const studentId = String(
      formData.get('student_id') ?? ''
    ).trim()
  
    if (!classId || !studentId) {
      redirect(
        `/admin/classes/${classId}?error=Invalid%20student%20enrollment`
      )
    }
  
    const { data: classItem } = await supabase
      .from('classes')
      .select(`
        id,
        course_id,
        capacity,
        status
      `)
      .eq('id', classId)
      .maybeSingle()
  
    if (!classItem) {
      redirect(
        '/admin/classes?error=Class%20not%20found'
      )
    }
  
    if (
      ['COMPLETED', 'CANCELLED'].includes(
        classItem.status
      )
    ) {
      redirect(
        `/admin/classes/${classId}?error=Students%20cannot%20be%20enrolled%20in%20a%20completed%20or%20cancelled%20class`
      )
    }
  
    const { data: student } = await supabase
      .from('students')
      .select('id, status')
      .eq('id', studentId)
      .maybeSingle()
  
    if (!student || student.status !== 'ACTIVE') {
      redirect(
        `/admin/classes/${classId}?error=Student%20is%20not%20active`
      )
    }
  
    const { data: existingEnrollment } =
      await supabase
        .from('enrollments')
        .select(`
          id,
          status,
          student_curriculum_enrollment_id
        `)
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .maybeSingle()
  
    if (
      existingEnrollment &&
      ['ACTIVE', 'PAUSED'].includes(
        existingEnrollment.status
      )
    ) {
      redirect(
        `/admin/classes/${classId}?error=Student%20is%20already%20enrolled%20in%20this%20class`
      )
    }
  
    const {
      count: occupiedSeats,
      error: capacityError,
    } = await supabase
      .from('enrollments')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('class_id', classId)
      .in('status', ['ACTIVE', 'PAUSED'])
  
    if (capacityError) {
      console.error(
        'Capacity check error:',
        capacityError
      )
  
      redirect(
        `/admin/classes/${classId}?error=Could%20not%20check%20class%20capacity`
      )
    }
  
    if (
      (occupiedSeats ?? 0) >= classItem.capacity
    ) {
      redirect(
        `/admin/classes/${classId}?error=Class%20is%20already%20full`
      )
    }
  
    const { data: course } = await supabase
      .from('courses')
      .select('id, curriculum_id')
      .eq('id', classItem.course_id)
      .maybeSingle()
  
    let academicEnrollmentId: string | null =
      existingEnrollment
        ?.student_curriculum_enrollment_id ?? null
  
    if (course?.curriculum_id) {
      const {
        data: academicEnrollments,
      } = await supabase
        .from('student_curriculum_enrollments')
        .select('id, is_primary')
        .eq('student_id', studentId)
        .eq(
          'curriculum_id',
          course.curriculum_id
        )
        .eq('status', 'ACTIVE')
        .order('is_primary', {
          ascending: false,
        })
        .limit(1)
  
      academicEnrollmentId =
        academicEnrollments?.[0]?.id ?? null
    }
  
    const today = new Date()
      .toISOString()
      .slice(0, 10)
  
    if (existingEnrollment) {
      const { error } = await supabase
        .from('enrollments')
        .update({
          student_curriculum_enrollment_id:
            academicEnrollmentId,
          status: 'ACTIVE',
          started_at: today,
          ended_at: null,
        })
        .eq('id', existingEnrollment.id)
  
      if (error) {
        console.error(
          'Reactivate enrollment error:',
          error
        )
  
        redirect(
          `/admin/classes/${classId}?error=Could%20not%20enroll%20student`
        )
      }
    } else {
      const { error } = await supabase
        .from('enrollments')
        .insert({
          student_id: studentId,
          class_id: classId,
          student_curriculum_enrollment_id:
            academicEnrollmentId,
          enrolled_at: today,
          started_at: today,
          status: 'ACTIVE',
        })
  
      if (error) {
        console.error(
          'Enroll student error:',
          error
        )
  
        if (error.code === '23505') {
          redirect(
            `/admin/classes/${classId}?error=Student%20is%20already%20enrolled`
          )
        }
  
        redirect(
          `/admin/classes/${classId}?error=Could%20not%20enroll%20student`
        )
      }
    }
  
    revalidatePath('/admin/classes')
    revalidatePath(`/admin/classes/${classId}`)
    revalidatePath(`/admin/students/${studentId}`)
  
    redirect(
      `/admin/classes/${classId}?success=Student%20enrolled%20successfully`
    )
  }
  
  export async function withdrawStudent(
    formData: FormData
  ) {
    const supabase = await requireSuperAdmin()
  
    const enrollmentId = String(
      formData.get('enrollment_id') ?? ''
    ).trim()
  
    const classId = String(
      formData.get('class_id') ?? ''
    ).trim()
  
    const studentId = String(
      formData.get('student_id') ?? ''
    ).trim()
  
    if (
      !enrollmentId ||
      !classId ||
      !studentId
    ) {
      redirect(
        `/admin/classes/${classId}?error=Invalid%20student%20enrollment`
      )
    }
  
    const today = new Date()
      .toISOString()
      .slice(0, 10)
  
    const { error } = await supabase
      .from('enrollments')
      .update({
        status: 'WITHDRAWN',
        ended_at: today,
      })
      .eq('id', enrollmentId)
      .eq('class_id', classId)
      .eq('student_id', studentId)
      .in('status', ['ACTIVE', 'PAUSED'])
  
    if (error) {
      console.error(
        'Withdraw student error:',
        error
      )
  
      redirect(
        `/admin/classes/${classId}?error=Could%20not%20withdraw%20student`
      )
    }
  
    revalidatePath('/admin/classes')
    revalidatePath(`/admin/classes/${classId}`)
    revalidatePath(`/admin/students/${studentId}`)
  
    redirect(
      `/admin/classes/${classId}?success=Student%20withdrawn%20successfully`
    )
  }