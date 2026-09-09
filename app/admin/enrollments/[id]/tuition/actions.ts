'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  )
}

function addOneDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function todayInVietnam() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export async function createTuitionTerm(
  formData: FormData
) {
  const supabase = await createClient()

  // =======================================================
  // AUTH
  // =======================================================

  const { data: auth } =
    await supabase.auth.getClaims()

  if (!auth?.claims) {
    redirect('/login')
  }

  const {
    data: allowed,
    error: roleError,
  } = await supabase.rpc('has_role', {
    role_code: 'SUPER_ADMIN',
  })

  if (roleError || !allowed) {
    redirect(
      '/login?error=' +
        encodeURIComponent(
          'Bạn không có quyền truy cập'
        )
    )
  }

  // =======================================================
  // INPUT
  // =======================================================

  const enrollmentId = String(
    formData.get('enrollment_id') ?? ''
  )

  const tuitionPlanId = String(
    formData.get('tuition_plan_id') ?? ''
  )

  const discountType = String(
    formData.get('discount_type') ?? 'NONE'
  )
    .trim()
    .toUpperCase()

  const discountValueRaw = String(
    formData.get('discount_value') ?? ''
  ).trim()

  const discountName = String(
    formData.get('discount_name') ?? ''
  ).trim()

  const notes = String(
    formData.get('notes') ?? ''
  ).trim()

  if (!isUuid(enrollmentId)) {
    redirect(
      '/admin/students?error=' +
        encodeURIComponent(
          'Thông tin ghi danh không hợp lệ'
        )
    )
  }

  const path =
    `/admin/enrollments/${enrollmentId}/tuition`

  const fail = (message: string): never => {
    redirect(
      `${path}?error=${encodeURIComponent(
        message
      )}`
    )
  }

  if (!isUuid(tuitionPlanId)) {
    fail('Gói học phí không hợp lệ')
  }

  if (
    !['NONE', 'PERCENT', 'FIXED'].includes(
      discountType
    )
  ) {
    fail('Loại giảm giá không hợp lệ')
  }

  let discountValue = 0

  if (discountType !== 'NONE') {
    if (discountValueRaw === '') {
      fail('Vui lòng nhập mức giảm giá')
    }

    discountValue = Number(discountValueRaw)

    if (
      !Number.isFinite(discountValue) ||
      discountValue < 0
    ) {
      fail('Mức giảm giá không hợp lệ')
    }

    if (
      discountType === 'PERCENT' &&
      discountValue > 100
    ) {
      fail(
        'Giảm giá theo phần trăm không được vượt quá 100%'
      )
    }

    if (
      discountType === 'FIXED' &&
      discountValue > 999999999999.99
    ) {
      fail('Số tiền giảm giá không hợp lệ')
    }

    if (!discountName) {
      fail(
        'Vui lòng nhập tên chương trình hoặc lý do giảm giá'
      )
    }
  }

  if (discountName.length > 300) {
    fail(
      'Tên chương trình giảm giá không được vượt quá 300 ký tự'
    )
  }

  if (notes.length > 2000) {
    fail(
      'Ghi chú không được vượt quá 2000 ký tự'
    )
  }

  // =======================================================
  // ENROLLMENT
  // =======================================================

  const {
    data: enrollment,
    error: enrollmentError,
  } = await supabase
    .from('enrollments')
    .select(
      `
        id,
        student_id,
        class_id,
        status,
        started_at,
        ended_at
      `
    )
    .eq('id', enrollmentId)
    .maybeSingle()

  if (enrollmentError || !enrollment) {
    fail('Không thể tải thông tin ghi danh')
  }

  const currentEnrollment = enrollment!

  if (
    currentEnrollment.status !== 'ACTIVE'
  ) {
    fail(
      'Chỉ có thể tạo học phí cho ghi danh đang hoạt động'
    )
  }

  if (!currentEnrollment.started_at) {
    fail(
      'Học viên chưa có ngày bắt đầu học nên chưa thể tạo kỳ học phí'
    )
  }

  // =======================================================
  // TUITION PLAN
  // =======================================================

  const {
    data: tuitionPlan,
    error: tuitionPlanError,
  } = await supabase
    .from('tuition_plans')
    .select('id, status')
    .eq('id', tuitionPlanId)
    .eq('status', 'ACTIVE')
    .maybeSingle()

  if (
    tuitionPlanError ||
    !tuitionPlan
  ) {
    fail(
      'Gói học phí không tồn tại hoặc đã ngừng hoạt động'
    )
  }

  // =======================================================
  // LATEST TUITION TERM
  // =======================================================

  const {
    data: latestTerm,
    error: latestTermError,
  } = await supabase
    .from('enrollment_tuition')
    .select(
      `
        id,
        effective_ends_on,
        status
      `
    )
    .eq(
      'enrollment_id',
      enrollmentId
    )
    .neq('status', 'CANCELLED')
    .order('effective_ends_on', {
      ascending: false,
    })
    .limit(1)
    .maybeSingle()

  if (latestTermError) {
    fail(
      'Không thể kiểm tra lịch sử học phí'
    )
  }
  if (latestTerm?.status === 'SCHEDULED') {
    fail(
      'Đã có một kỳ gia hạn được lên lịch. Vui lòng xử lý kỳ đó trước khi tạo thêm kỳ mới.'
    )
  }
  const startsOn = latestTerm
    ? addOneDay(
        latestTerm.effective_ends_on
      )
    : currentEnrollment.started_at

  const status =
    startsOn > todayInVietnam()
      ? 'SCHEDULED'
      : 'ACTIVE'

  // =======================================================
  // INSERT
  //
  // Database automatically:
  // - detects Class Branch
  // - finds branch-specific/default list price
  // - snapshots branch
  // - snapshots Tuition Plan
  // - calculates discount
  // - calculates final amount
  // - calculates tuition dates
  // =======================================================

  const { error: insertError } =
    await supabase
      .from('enrollment_tuition')
      .insert({
        enrollment_id: enrollmentId,
        tuition_plan_id: tuitionPlanId,
        starts_on: startsOn,
        status,

        discount_type: discountType,
        discount_value: discountValue,
        discount_name:
          discountType === 'NONE'
            ? null
            : discountName,

        notes: notes || null,
      })

  if (insertError) {
    console.error(
      'Create tuition term failed:',
      insertError
    )

    if (insertError.code === '23P01') {
      fail(
        'Kỳ học phí mới bị trùng với một kỳ học phí hiện có'
      )
    }

    if (
      insertError.message.includes(
        'study start date'
      )
    ) {
      fail(
        'Ngày bắt đầu học chưa hợp lệ để tạo học phí'
      )
    }

    if (
      insertError.message.includes(
        'Tuition plan does not exist or is inactive'
      )
    ) {
      fail(
        'Gói học phí không tồn tại hoặc đã ngừng hoạt động'
      )
    }

    if (
      insertError.message.includes(
        'No active tuition price'
      )
    ) {
      fail(
        'Chi nhánh này chưa được cấu hình học phí cho gói đã chọn'
      )
    }

    if (
      insertError.message.includes(
        'Percentage discount'
      )
    ) {
      fail(
        'Mức giảm phần trăm phải nằm trong khoảng 0–100%'
      )
    }

    if (
      insertError.message.includes(
        'Fixed discount cannot exceed'
      )
    ) {
      fail(
        'Số tiền giảm không được lớn hơn học phí niêm yết'
      )
    }

    fail(
      'Không thể tạo kỳ học phí. Vui lòng kiểm tra lại dữ liệu.'
    )
  }

  // =======================================================
  // REFRESH
  // =======================================================

  revalidatePath(path)

  revalidatePath(
    `/admin/students/${currentEnrollment.student_id}`
  )

  revalidatePath(
    `/admin/classes/${currentEnrollment.class_id}`
  )

  redirect(
    `${path}?success=${encodeURIComponent(
      latestTerm
        ? 'Đã tạo kỳ gia hạn học phí'
        : 'Đã tạo kỳ học phí đầu tiên'
    )}`
  )
}