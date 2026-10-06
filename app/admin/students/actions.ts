'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requestOperationalAdmin } from '@/lib/auth/request'
import { createClient } from '@/lib/supabase/server'
import { requireOperationsStaff } from '../../../lib/authorization'

async function requireSuperAdmin() {
  const supabase = await createClient()

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()

  if (claimsError || !claimsData?.claims) {
    redirect('/login')
  }

  const { data: isSuperAdmin, error: roleError } =
    await requestOperationalAdmin()

  if (roleError || !isSuperAdmin) {
    redirect('/login?error=B%E1%BA%A1n%20kh%C3%B4ng%20c%C3%B3%20quy%E1%BB%81n%20truy%20c%E1%BA%ADp')
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

  const admissionDate = String(
    formData.get('admission_date') ?? ''
  ).trim()

  if (
    !studentCode ||
    !fullName ||
    !branchId ||
    !admissionDate
  ) {
    redirect(
      '/admin/students?error=' +
        encodeURIComponent(
          'Mã học sinh, họ tên, chi nhánh và ngày đăng ký là bắt buộc'
        )
    )
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      admissionDate
    )
  ) {
    redirect(
      '/admin/students?error=' +
        encodeURIComponent(
          'Ngày đăng ký không hợp lệ'
        )
    )
  }

  const { error } = await supabase
    .from('students')
    .insert({
      student_code: studentCode,
      full_name: fullName,
      default_branch_id: branchId,
      admission_date: admissionDate,
      status: 'ACTIVE',
    })

  if (error) {
    console.error(
      'Create student error:',
      error
    )

    if (error.code === '23505') {
      redirect(
        '/admin/students?error=' +
          encodeURIComponent(
            'Mã học sinh đã tồn tại'
          )
      )
    }

    redirect(
      '/admin/students?error=' +
        encodeURIComponent(
          'Không thể tạo học sinh'
        )
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/students')

  redirect(
    '/admin/students?success=' +
      encodeURIComponent(
        'Đã tạo học sinh thành công'
      )
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
        `/admin/students/${id}?error=M%C3%A3%20h%E1%BB%8Dc%20vi%C3%AAn%20%C4%91%C3%A3%20t%E1%BB%93n%20t%E1%BA%A1i`
      )
    }

    redirect(
      `/admin/students/${id}?error=Kh%C3%B4ng%20th%E1%BB%83%20c%E1%BA%ADp%20nh%E1%BA%ADt%20h%E1%BB%8Dc%20vi%C3%AAn`
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/students')
  revalidatePath(`/admin/students/${id}`)

  redirect(
    '/admin/students?success=%C4%90%C3%A3%20c%E1%BA%ADp%20nh%E1%BA%ADt%20h%E1%BB%8Dc%20vi%C3%AAn'
  )
}

export async function setStudentStatus(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const id = String(formData.get('id') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()



  if (!id || !['ACTIVE', 'INACTIVE'].includes(status)) {
    redirect(
      '/admin/students?error=Tr%E1%BA%A1ng%20th%C3%A1i%20h%E1%BB%8Dc%20vi%C3%AAn%20kh%C3%B4ng%20h%E1%BB%A3p%20l%E1%BB%87'
    )
  }

  const { error } = await supabase
    .from('students')
    .update({ status })
    .eq('id', id)

  if (error) {
    console.error('Student status error:', error)

    redirect(
      '/admin/students?error=Kh%C3%B4ng%20th%E1%BB%83%20thay%20%C4%91%E1%BB%95i%20tr%E1%BA%A1ng%20th%C3%A1i%20h%E1%BB%8Dc%20vi%C3%AAn'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/students')
}
const ACADEMIC_PROGRESS_STATUSES = [
    'NOT_STARTED',
    'IN_PROGRESS',
    'PASS',
    'MERIT',
    'DISTINCTION',
  ] as const

  const COMPONENT_PROGRESS_STATUSES = [
    'IN_PROGRESS',
    'PASS',
  ] as const

  export async function updateComponentProgressStatus(
    formData: FormData
  ) {
    const supabase = await requireSuperAdmin()

    const progressId = String(
      formData.get('progress_id') ?? ''
    ).trim()

    const studentId = String(
      formData.get('student_id') ?? ''
    ).trim()

    const status = String(
      formData.get('status') ?? ''
    ).trim()



    if (
      !progressId ||
      !studentId ||
      !COMPONENT_PROGRESS_STATUSES.includes(
        status as (typeof COMPONENT_PROGRESS_STATUSES)[number]
      )
    ) {
      throw new Error("Thông tin cập nhật tiến độ môn học không hợp lệ")
    }

    const { error } = await supabase
      .from('student_component_progress')
      .update({ status })
      .eq('id', progressId)

    if (error) {
      console.error(
        'Component progress update error:',
        error
      )

      throw new Error(
        "Không thể cập nhật tiến độ học phần"
      )
    }

    revalidatePath(`/admin/students/${studentId}`)
  }

  export async function updateLessonProgressStatus(
    formData: FormData
  ) {
    const supabase = await requireSuperAdmin()
    const progressId = String(formData.get('progress_id') ?? '').trim()
    const levelProgressId = String(formData.get('level_progress_id') ?? '').trim()
    const subjectId = String(formData.get('subject_id') ?? '').trim()
    const componentId = String(formData.get('component_id') ?? '').trim()
    const itemId = String(formData.get('item_id') ?? '').trim()
    const studentId = String(formData.get('student_id') ?? '').trim()
    const status = String(formData.get('status') ?? '').trim()
    const path = `/admin/students/${studentId}`
    const invalid = (): never => {
      redirect(`${path}?error=${encodeURIComponent('Thông tin cập nhật bài học không hợp lệ')}`)
      throw new Error('redirect')
    }

    if (
      !studentId ||
      !COMPONENT_PROGRESS_STATUSES.includes(status as (typeof COMPONENT_PROGRESS_STATUSES)[number]) ||
      (!progressId && !(levelProgressId && subjectId && componentId && itemId))
    ) return invalid()

    let targetId = progressId
    if (!targetId) {
      const { data: level, error: levelError } = await supabase
        .from('student_level_progress')
        .select('id, enrollment_id, level_id')
        .eq('id', levelProgressId)
        .maybeSingle()
      if (levelError || !level) return invalid()
      const { data: enrollment, error: enrollmentError } = await supabase
        .from('student_curriculum_enrollments')
        .select('student_id')
        .eq('id', level.enrollment_id)
        .maybeSingle()
      const { data: subject, error: subjectError } = await supabase
        .from('curriculum_subjects')
        .select('id, level_id')
        .eq('id', subjectId)
        .maybeSingle()
      const { data: component, error: componentError } = await supabase
        .from('curriculum_subject_components')
        .select('id, subject_id')
        .eq('id', componentId)
        .maybeSingle()
      const { data: lesson, error: lessonError } = await supabase
        .from('curriculum_component_items')
        .select('id, component_id')
        .eq('id', itemId)
        .maybeSingle()
      if (
        enrollmentError || subjectError || componentError || lessonError ||
        enrollment?.student_id !== studentId ||
        subject?.level_id !== level.level_id ||
        component?.subject_id !== subjectId ||
        lesson?.component_id !== componentId
      ) return invalid()

      const { data: subjectProgress, error: subjectProgressError } = await supabase
        .from('student_subject_progress')
        .select('id')
        .eq('level_progress_id', levelProgressId)
        .eq('subject_id', subjectId)
        .maybeSingle()
      if (subjectProgressError) return invalid()
      let subjectProgressId = subjectProgress?.id
      if (!subjectProgressId) {
        const inserted = await supabase.from('student_subject_progress')
          .insert({ level_progress_id: levelProgressId, subject_id: subjectId, status: 'NOT_STARTED' })
          .select('id').single()
        if (inserted.error || !inserted.data) return invalid()
        subjectProgressId = inserted.data.id
      }

      const { data: componentProgress, error: componentProgressError } = await supabase
        .from('student_component_progress')
        .select('id')
        .eq('subject_progress_id', subjectProgressId)
        .eq('component_id', componentId)
        .maybeSingle()
      if (componentProgressError) return invalid()
      let componentProgressId = componentProgress?.id
      if (!componentProgressId) {
        const inserted = await supabase.from('student_component_progress')
          .insert({ subject_progress_id: subjectProgressId, component_id: componentId, status: 'NOT_STARTED' })
          .select('id').single()
        if (inserted.error || !inserted.data) return invalid()
        componentProgressId = inserted.data.id
      }

      const { data: lessonProgress, error: lessonProgressError } = await supabase
        .from('student_component_item_progress')
        .select('id')
        .eq('component_progress_id', componentProgressId)
        .eq('item_id', itemId)
        .maybeSingle()
      if (lessonProgressError) return invalid()
      targetId = lessonProgress?.id
      if (!targetId) {
        const inserted = await supabase.from('student_component_item_progress')
          .insert({ component_progress_id: componentProgressId, item_id: itemId, status })
          .select('id').single()
        if (!inserted.error) {
          revalidatePath(path)
          return
        }
        if (inserted.error.code !== '23505') {
          const scheduled = inserted.error.message.includes('scheduled start')
          redirect(`${path}?error=${encodeURIComponent(scheduled
            ? 'Academic progress cannot be updated before the scheduled start date'
            : 'Không thể cập nhật tiến độ bài học')}`)
        }
        const existing = await supabase.from('student_component_item_progress')
          .select('id')
          .eq('component_progress_id', componentProgressId)
          .eq('item_id', itemId)
          .maybeSingle()
        targetId = existing.data?.id
        if (!targetId) return invalid()
      }
    }

    if (!targetId) return invalid()
    const write = await supabase.from('student_component_item_progress').update({ status }).eq('id', targetId)

    if (write.error) {
      const scheduled = write.error.message.includes('scheduled start')
      redirect(`${path}?error=${encodeURIComponent(scheduled
        ? 'Academic progress cannot be updated before the scheduled start date'
        : 'Không thể cập nhật tiến độ bài học')}`)
    }

    revalidatePath(path)
  }

  export async function updateDirectSubjectProgressStatus(
    formData: FormData
  ) {
    const supabase = await requireSuperAdmin()

    const progressId = String(
      formData.get('progress_id') ?? ''
    ).trim()

    const studentId = String(
      formData.get('student_id') ?? ''
    ).trim()

    const status = String(
      formData.get('status') ?? ''
    ).trim()

    if (
      !progressId ||
      !studentId ||
      !ACADEMIC_PROGRESS_STATUSES.includes(
        status as (typeof ACADEMIC_PROGRESS_STATUSES)[number]
      )
    ) {
      throw new Error("Thông tin cập nhật tiến độ môn học không hợp lệ")
    }

    const { error } = await supabase
      .from('student_subject_progress')
      .update({ status })
      .eq('id', progressId)

    if (error) {
      console.error(
        'Subject progress update error:',
        error
      )

      throw new Error(
        "Không thể cập nhật tiến độ môn học"
      )
    }

    revalidatePath(`/admin/students/${studentId}`)
  }
  export async function assignStudentAcademicProgram(
    formData: FormData
  ) {
    const supabase = await requireSuperAdmin()

    const studentId = String(
      formData.get('student_id') ?? ''
    ).trim()

    const curriculumId = String(
      formData.get('curriculum_id') ?? ''
    ).trim()

    const levelId = String(
      formData.get('level_id') ?? ''
    ).trim()

    const startedAt = String(
      formData.get('started_at') ?? ''
    ).trim()

    const isPrimary =
      formData.get('is_primary') === 'on'

    const returnPath = `/admin/students/${studentId}`

    if (
      !studentId ||
      !curriculumId ||
      !levelId ||
      !startedAt
    ) {
      redirect(
        `${returnPath}?error=${encodeURIComponent(
          "Vui lòng chọn học viên, chương trình, bậc học và ngày bắt đầu"
        )}`
      )
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startedAt)) {
      redirect(
        `${returnPath}?error=${encodeURIComponent(
          "Ngày bắt đầu học không hợp lệ"
        )}`
      )
    }

    const { data: operationalCurriculum } = await supabase
      .from('operational_curriculums')
      .select('id')
      .eq('id', curriculumId)
      .maybeSingle()

    if (!operationalCurriculum) {
      redirect(
        `${returnPath}?error=${encodeURIComponent(
          "Chỉ được ghi danh vào Piano, Guitar, Violin hoặc Trống"
        )}`
      )
    }

    const { error } = await supabase.rpc(
      'assign_student_academic_program',
      {
        p_student_id: studentId,
        p_curriculum_id: curriculumId,
        p_level_id: levelId,
        p_started_at: startedAt,
        p_is_primary: isPrimary,
      }
    )

    if (error) {
      console.error(
        'Assign academic program error:',
        error
      )

      redirect(
        `${returnPath}?error=${encodeURIComponent(
          error.message ||
            "Không thể gán chương trình học"
        )}`
      )
    }

    revalidatePath('/admin/students')
    revalidatePath(returnPath)

    redirect(
      `${returnPath}?success=${encodeURIComponent(
        "Đã gán chương trình học"
      )}`
    )
  }
  export async function startStudentAcademicLevel(
    formData: FormData
  ) {
    const supabase = await requireSuperAdmin()

    const studentId = String(
      formData.get('student_id') ?? ''
    ).trim()

    const enrollmentId = String(
      formData.get('enrollment_id') ?? ''
    ).trim()

    const levelId = String(
      formData.get('level_id') ?? ''
    ).trim()

    const startedAt = String(
      formData.get('started_at') ?? ''
    ).trim()

    const returnPath = `/admin/students/${studentId}`

    if (
      !studentId ||
      !enrollmentId ||
      !levelId ||
      !startedAt
    ) {
      redirect(
        `${returnPath}?error=${encodeURIComponent(
          "Vui lòng chọn ghi danh, bậc học và ngày bắt đầu"
        )}`
      )
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startedAt)) {
      redirect(
        `${returnPath}?error=${encodeURIComponent(
          "Ngày bắt đầu học không hợp lệ"
        )}`
      )
    }

    const { error } = await supabase.rpc(
      'start_student_academic_level',
      {
        p_enrollment_id: enrollmentId,
        p_level_id: levelId,
        p_started_at: startedAt,
      }
    )

    if (error) {
      console.error(
        'Start academic level error:',
        error
      )

      redirect(
        `${returnPath}?error=${encodeURIComponent(
          error.message ||
            "Không thể bắt đầu bậc học"
        )}`
      )
    }

    revalidatePath('/admin/students')
    revalidatePath(returnPath)

    redirect(
      `${returnPath}?success=${encodeURIComponent(
        "Đã bắt đầu bậc học"
      )}`
    )
  }


export async function updateStudentAcademicEnrollmentStartDate(
  formData: FormData
) {
  const supabase = await requireSuperAdmin()

  const studentId = String(
    formData.get('student_id') ?? ''
  ).trim()

  const enrollmentId = String(
    formData.get('enrollment_id') ?? ''
  ).trim()

  const startedAt = String(
    formData.get('started_at') ?? ''
  ).trim()

  const returnPath = `/admin/students/${studentId}`

  if (!studentId || !enrollmentId || !startedAt) {
    redirect(
      `${returnPath}?error=${encodeURIComponent(
        "Vui lòng nhập ngày bắt đầu chương trình"
      )}`
    )
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startedAt)) {
    redirect(
      `${returnPath}?error=${encodeURIComponent(
        "Ngày bắt đầu chương trình không hợp lệ"
      )}`
    )
  }

  const { error } = await supabase.rpc(
    'update_student_academic_enrollment_start_date',
    {
      p_enrollment_id: enrollmentId,
      p_started_at: startedAt,
    }
  )

  if (error) {
    console.error(
      'Update academic enrollment start date error:',
      error
    )

    redirect(
      `${returnPath}?error=${encodeURIComponent(
        error.message ||
          "Không thể cập nhật ngày bắt đầu chương trình"
      )}`
    )
  }

  revalidatePath('/admin/students')
  revalidatePath(returnPath)

  redirect(
    `${returnPath}?success=${encodeURIComponent(
      "Đã cập nhật ngày bắt đầu chương trình"
    )}`
  )
}

// Narrow pilot edit: database resolves membership; caller cannot change identity, branch or status.
export async function updateStudentBasic(formData: FormData) {
  const db = await requireOperationsStaff()
  const id = String(formData.get('id') ?? '').trim()
  const fullName = String(formData.get('full_name') ?? '').trim()
  const preferredName = String(formData.get('preferred_name') ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id) || !fullName || fullName.length > 200 || preferredName.length > 200) {
    redirect('/operations?error=' + encodeURIComponent('Thông tin học viên không hợp lệ'))
  }
  const result = await db.rpc('update_student_basic', { p_student: id, p_full_name: fullName, p_preferred_name: preferredName })
  if (result.error) redirect('/operations?error=' + encodeURIComponent('Không có quyền hoặc không thể cập nhật học viên'))
  revalidatePath('/operations')
  revalidatePath('/admin/students')
  revalidatePath(`/admin/students/${id}`)
  redirect('/operations?success=' + encodeURIComponent('Đã cập nhật học viên'))
}
