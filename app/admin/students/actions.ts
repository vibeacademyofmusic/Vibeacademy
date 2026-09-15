'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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
    await supabase.rpc('has_role', {
      role_code: 'SUPER_ADMIN',
    })

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
    'NOT_PASSED',
    'EXEMPT',
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
      !ACADEMIC_PROGRESS_STATUSES.includes(
        status as (typeof ACADEMIC_PROGRESS_STATUSES)[number]
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
