'use server'

import { operationalAdminOn } from '@/lib/auth/request'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { planIndependentShifts, shiftIdentityCode, type TimeWindow } from '@/lib/teaching-shifts/independent'
import { primaryShiftWouldExceedTwo, type ShiftSlot } from '@/lib/teaching-shifts/overlap'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function scheduleSaveErrorMessage(message: string) {
  if (message.includes('SCHEDULE_ROOM_CONFLICT')) return 'Phòng đã có ca dạy khác trong khung giờ này'
  if (message.includes('SCHEDULE_ROOM_TOO_SMALL')) return 'Sức chứa ca dạy vượt sức chứa phòng đã cấu hình'
  if (message.includes('SCHEDULE_ROOM_CAPACITY_UNKNOWN')) return 'Phòng chưa xác định sức chứa. Giữ chờ ca dạy cho đến khi xác nhận.'
  if (message.includes('SCHEDULE_ROOM_UNAVAILABLE')) return 'Phòng không thuộc chi nhánh của ca dạy hoặc không còn sử dụng'
  if (message.includes('SCHEDULE_ROOM_TIMEZONE_UNSUPPORTED')) return 'Múi giờ của lịch phòng chưa được hỗ trợ'
  if (message.includes('two overlapping')) return 'Giáo viên chính đã có hai ca dạy trùng thời gian. Hãy chọn giáo viên khác hoặc đổi lịch.'
  if (message.includes('already teaching')) return 'Giáo viên của ca dạy đã có lịch trùng thời gian.'
  return 'Không lưu được lịch lặp lại của ca dạy'
}

function readSlots(formData: FormData): TimeWindow[] {
  const days = formData.getAll('slot_day')
  const starts = formData.getAll('slot_start')
  const ends = formData.getAll('slot_end')
  if (!days.length) return []
  return days.flatMap((day, index) => {
    const value = Number(String(day).trim())
    if (!Number.isInteger(value) || value < 1 || value > 7) return []
    return [{ day: value, start: String(starts[index] ?? '').trim(), end: String(ends[index] ?? '').trim() }]
  })
}

async function requireSuperAdmin() {
  const supabase = await createClient()

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()

  if (claimsError || !claimsData?.claims) {
    redirect('/login')
  }

  const { data: isSuperAdmin, error: roleError } =
    await operationalAdminOn(supabase)

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

  const curriculumId = String(
    formData.get('curriculum_id') ?? ''
  ).trim()

  const teacherId = String(formData.get('teacher_id') ?? '').trim()
  const roomId = String(formData.get('room_id') ?? '').trim()
  const submittedSlotDays = formData.getAll('slot_day')
  const submittedSlotStarts = formData.getAll('slot_start')
  const submittedSlotEnds = formData.getAll('slot_end')
  const submittedWeekDays = formData.getAll('day_of_week').filter(value => String(value).trim())
  const weekDayNumbers = submittedWeekDays.map(value => Number(String(value).trim()))
  const slots = readSlots(formData)
  const selectedDays = [...new Set([
    ...weekDayNumbers,
    ...slots.map(slot => slot.day),
  ])].filter(day => Number.isInteger(day) && day >= 1 && day <= 7)
  if (
    submittedSlotDays.length > 1 || submittedWeekDays.length > 1 || selectedDays.length > 1
    || (submittedSlotDays.length && (slots.length !== 1 || submittedSlotStarts.length !== 1 || submittedSlotEnds.length !== 1))
    || weekDayNumbers.some(value => !Number.isInteger(value) || value < 1 || value > 7)
  ) {
    redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Mỗi lần chỉ tạo một ca với một thứ và một khung giờ. Hãy lưu từng ca riêng.'))
  }
  const singleSlot = slots.length === 1 ? slots[0] : null
  const dayValue = singleSlot ? String(singleSlot.day) : selectedDays.length === 1 ? String(selectedDays[0]) : ''
  const startTime = singleSlot?.start || String(formData.get('start_time') ?? '').trim()
  const endTime = singleSlot?.end || String(formData.get('end_time') ?? '').trim()
  const effectiveFrom = String(formData.get('effective_from') ?? '').trim()
  const effectiveTo = String(formData.get('effective_to') ?? '').trim()

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

  const acceptedFrom = String(formData.get('accepted_from_level_id') ?? '').trim()
  const acceptedTo = String(formData.get('accepted_to_level_id') ?? '').trim()
  const fromLevel = UUID_PATTERN.test(acceptedFrom) ? acceptedFrom : null
  const toLevel = UUID_PATTERN.test(acceptedTo) ? acceptedTo : null
  if ((fromLevel && !toLevel) || (!fromLevel && toLevel)) {
    redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Phạm vi trình độ cần cả Từ và Đến, hoặc để trống'))
  }

  if (
    !branchId ||
    !curriculumId ||
    !classType ||
    !code ||
    !name
  ) {
    redirect(
      '/admin/classes?view=classes&error=' + encodeURIComponent('Cần chi nhánh, chương trình, mã, tên và loại ca dạy')
    )
  }

  if (!/^[A-Z0-9_-]{2,50}$/.test(code)) {
    redirect(
      '/admin/classes?view=classes&error=' + encodeURIComponent('Mã ca dạy chỉ gồm chữ, số, gạch ngang hoặc gạch dưới, từ 2 đến 50 ký tự')
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
    redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Nhập sức chứa thực tế đã xác nhận, là số nguyên lớn hơn 0.'))
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

  const { data: program } = await supabase
    .from('operational_curriculums')
    .select('id, name, code')
    .eq('id', curriculumId)
    .maybeSingle()

  if (!program) {
    redirect(
      '/admin/classes?view=classes&error=' + encodeURIComponent('Chọn một chương trình đang vận hành: Piano, Guitar, Violin hoặc Trống')
    )
  }

  const scheduleRequested = Boolean(selectedDays.length || startTime || endTime || roomId || effectiveFrom || effectiveTo)
  const day = Number(dayValue)
  if (scheduleRequested && (!Number.isInteger(day) || day < 1 || day > 7 || !startTime || !endTime || !roomId || !effectiveFrom)) {
    redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Lịch lặp lại cần thứ, giờ bắt đầu, giờ kết thúc, phòng và ngày hiệu lực'))
  }
  if (startTime && endTime && endTime <= startTime) {
    redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Giờ kết thúc phải sau giờ bắt đầu'))
  }
  if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
    redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Ngày hết hiệu lực không được trước ngày bắt đầu lịch'))
  }

  let resolvedCode = code
  if (scheduleRequested) {
    const { data: room, error: roomError } = await supabase.from('rooms')
      .select('id, branch_id, status, capacity').eq('id', roomId).maybeSingle()
    if (roomError || !room || room.status !== 'ACTIVE' || room.branch_id !== branchId) {
      redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Phòng không thuộc chi nhánh của ca dạy hoặc không còn sử dụng'))
    }
    if (!Number.isInteger(room.capacity) || room.capacity <= 0) {
      redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Phòng chưa xác định sức chứa. Hãy xác nhận trước khi tạo ca.'))
    }
    if (capacity > room.capacity) {
      redirect('/admin/classes?view=classes&error=' + encodeURIComponent(`Sức chứa vượt sức chứa phòng (${room.capacity})`))
    }
    const { data: scheduled, error: lookupError } = await supabase.from('schedules')
      .select('day_of_week, start_time, end_time, room_id, effective_from, effective_to, classes!inner(id, code, name, branch_id, curriculum_id, status)')
      .eq('status', 'ACTIVE')
      .eq('day_of_week', day)
      .eq('room_id', roomId)
      .eq('classes.branch_id', branchId)
    if (lookupError) {
      redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Không kiểm tra được ca đang có. Hãy thử lại.'))
    }
    const existing = (scheduled ?? []).flatMap(row => {
      const klass = Array.isArray(row.classes) ? row.classes[0] : row.classes
      if (!klass || klass.status === 'CANCELLED') return []
      return [{
        id: klass.id,
        code: klass.code,
        name: klass.name,
        branchId: klass.branch_id,
        curriculumId: klass.curriculum_id,
        dayOfWeek: row.day_of_week,
        startTime: String(row.start_time),
        endTime: String(row.end_time),
        dayCount: 1,
        roomId: row.room_id,
        effectiveFrom: String(row.effective_from),
        effectiveTo: row.effective_to,
      }]
    })
    const planned = planIndependentShifts({
      programCode: program.code,
      programName: program.name,
      branchId,
      curriculumId,
      days: [day],
      start: startTime,
      end: endTime,
      roomId,
      effectiveFrom,
      effectiveTo: effectiveTo || null,
      existing,
    })[0]
    if (planned?.existing) {
      redirect(`/admin/classes/${planned.existing.id}?success=` + encodeURIComponent('Ca này đã có cùng phòng và khung giờ. Mở ca hiện có để tiếp tục.'))
    }
    if (code === shiftIdentityCode(program.code, day, startTime)) {
      let available = false
      for (let suffix = 1; suffix <= 99; suffix += 1) {
        const tail = suffix === 1 ? '' : `-${suffix}`
        const candidate = `${code.slice(0, 50 - tail.length)}${tail}`
        const { data: taken, error: codeError } = await supabase.from('classes')
          .select('id').eq('branch_id', branchId).eq('code', candidate).maybeSingle()
        if (codeError) {
          redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Không kiểm tra được mã ca dạy. Hãy thử lại.'))
        }
        if (!taken) {
          resolvedCode = candidate
          available = true
          break
        }
      }
      if (!available) {
        redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Không còn mã tự động trống. Hãy nhập mã ca riêng.'))
      }
    }
  }

  const complete = Boolean(teacherId && scheduleRequested && roomId && effectiveFrom)
  const { data: created, error } = await supabase
    .from('classes')
    .insert({
      branch_id: branchId,
      course_id: null,
      curriculum_id: curriculumId,
      code: resolvedCode,
      name,
      class_type: classType,
      capacity,
      start_date: startDateValue || effectiveFrom || null,
      end_date: endDateValue || null,
      notes: notes || null,
      status: 'DRAFT',
      accepted_from_level_id: fromLevel,
      accepted_to_level_id: toLevel,
    })
    .select('id')
    .single()

  if (error || !created) {
    if (error?.code === '23505') {
      redirect(
        '/admin/classes?view=classes&error=' + encodeURIComponent('Mã ca dạy này đã có tại chi nhánh')
      )
    }

    redirect(
      '/admin/classes?view=classes&error=' + encodeURIComponent(error?.message || 'Không tạo được ca dạy')
    )
  }

  const fail = async (message: string) => {
    await supabase.from('classes').delete().eq('id', created.id)
    redirect('/admin/classes?view=classes&error=' + encodeURIComponent(message))
  }

  if (teacherId) {
    const { data: teacher } = await supabase.from('teachers').select('id, status').eq('id', teacherId).maybeSingle()
    if (!teacher || teacher.status !== 'ACTIVE') await fail('Giáo viên chính không còn hoạt động')
    const { error: teacherError } = await supabase.from('class_teachers').insert({
      class_id: created.id,
      teacher_id: teacherId,
      teacher_role: 'PRIMARY',
      is_active: true,
      assigned_at: effectiveFrom || startDateValue || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
    })
    if (teacherError) await fail(teacherError.message.includes('two overlapping')
      ? 'Giáo viên chính đã có hai ca dạy trùng thời gian. Hãy chọn giáo viên khác hoặc đổi lịch.'
      : 'Không gán được giáo viên chính cho ca dạy')
  }

  if (scheduleRequested) {
    const { data: sameDay, error: sameDayError } = await supabase.from('schedules').select('id, class_id, room_id, day_of_week, start_time, end_time, effective_from, effective_to').eq('status', 'ACTIVE').eq('day_of_week', day)
    if (sameDayError) return await fail('Không kiểm tra được lịch sử dụng phòng. Hãy thử lại.')
    const overlaps = (sameDay ?? []).filter(row =>
      row.start_time.slice(0, 5) < endTime && startTime < row.end_time.slice(0, 5)
      && (effectiveFrom <= (row.effective_to ?? '9999-12-31') && (effectiveTo || '9999-12-31') >= row.effective_from)
    )
    if (overlaps.some(row => row.room_id === roomId)) await fail('Phòng đã có ca dạy khác trong khung giờ này')
    if (teacherId) {
      const { data: otherPrimary } = await supabase.from('class_teachers').select('class_id').eq('teacher_id', teacherId).eq('teacher_role', 'PRIMARY').eq('is_active', true).neq('class_id', created.id)
      const otherIds = new Set((otherPrimary ?? []).map(row => row.class_id))
      const candidate: ShiftSlot = { classId: created.id, dayOfWeek: day, startTime, endTime, effectiveFrom, effectiveTo: effectiveTo || null }
      const others: ShiftSlot[] = overlaps.filter(row => otherIds.has(row.class_id)).map(row => ({
        classId: row.class_id,
        dayOfWeek: row.day_of_week,
        startTime: String(row.start_time),
        endTime: String(row.end_time),
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to,
      }))
      if (primaryShiftWouldExceedTwo(candidate, others)) {
        await fail('Giáo viên chính đã có hai ca dạy trùng thời gian. Hãy chọn giáo viên khác hoặc đổi lịch.')
      }
    }
    const { error: scheduleError } = await supabase.from('schedules').insert({
      class_id: created.id,
      room_id: roomId,
      day_of_week: day,
      start_time: startTime,
      end_time: endTime,
      effective_from: effectiveFrom,
      effective_to: effectiveTo || null,
      timezone: 'Asia/Ho_Chi_Minh',
      status: 'ACTIVE',
    })
    if (scheduleError) {
      await fail(scheduleSaveErrorMessage(scheduleError.message))
    }
  }

  if (complete) {
    const { error: activateError } = await supabase.from('classes').update({ status: 'ACTIVE' }).eq('id', created.id)
    if (activateError) await fail('Đã tạo ca dạy nhưng chưa chuyển được sang đang hoạt động')
  }

  revalidatePath('/admin')
  revalidatePath('/admin/classes')
  revalidatePath('/admin/students')

  const missing = [
    !teacherId ? 'giáo viên chính' : null,
    !scheduleRequested ? 'lịch lặp lại, phòng và ngày hiệu lực' : null,
  ].filter(Boolean)
  redirect('/admin/classes?view=classes&success=' + encodeURIComponent(
    missing.length
      ? `Đã tạo bản nháp. Còn thiếu: ${missing.join(', ')}. Mở ca dạy để hoàn tất trước khi nhận học viên.`
      : 'Đã tạo ca dạy và có thể nhận học viên.'
  ))
}

export async function setClassLevelScope(formData: FormData) {
  const supabase = await requireSuperAdmin()
  const classId = String(formData.get('class_id') ?? '').trim()
  const fromRaw = String(formData.get('accepted_from_level_id') ?? '').trim()
  const toRaw = String(formData.get('accepted_to_level_id') ?? '').trim()
  const fromLevel = fromRaw === '' ? null : fromRaw
  const toLevel = toRaw === '' ? null : toRaw
  if (!UUID_PATTERN.test(classId)) {
    redirect('/admin/classes?error=Invalid%20class')
  }
  if ((fromLevel && !UUID_PATTERN.test(fromLevel)) || (toLevel && !UUID_PATTERN.test(toLevel))) {
    redirect(`/admin/classes/${classId}?error=` + encodeURIComponent('Level không hợp lệ'))
  }
  const { error } = await supabase.rpc('set_class_level_scope', {
    p_class: classId,
    p_from: fromLevel,
    p_to: toLevel,
  })
  if (error) {
    redirect(`/admin/classes/${classId}?error=` + encodeURIComponent(error.message || 'Không lưu được phạm vi'))
  }
  revalidatePath(`/admin/classes/${classId}`)
  revalidatePath('/admin/classes')
  redirect(`/admin/classes/${classId}?success=` + encodeURIComponent('Đã cập nhật phạm vi trình độ'))
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
  revalidatePath('/admin/students')

  redirect(
    '/admin/classes?view=classes&success=' + encodeURIComponent('Đã cập nhật trạng thái ca dạy')
  )
}

export async function deleteClass(formData: FormData) {
  const supabase = await requireSuperAdmin()
  const id = String(formData.get('id') ?? '').trim()

  if (!UUID_PATTERN.test(id)) {
    redirect('/admin/classes?error=Invalid%20class')
  }

  const [enrollmentResult, scheduleResult] =
    await Promise.all([
      supabase
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', id),
      supabase
        .from('schedules')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', id),
    ])

  if (enrollmentResult.error || scheduleResult.error) {
    redirect(
      '/admin/classes?error=Could%20not%20verify%20class%20history'
    )
  }

  if ((enrollmentResult.count ?? 0) > 0) {
    redirect(
      '/admin/classes?error=This%20class%20still%20has%20student%20enrollments.%20Remove%20them%20before%20deleting%20the%20class'
    )
  }

  if ((scheduleResult.count ?? 0) > 0) {
    redirect(
      '/admin/classes?error=This%20class%20still%20has%20schedules.%20Delete%20or%20deactivate%20them%20first'
    )
  }

  const { data: deletedClass, error } = await supabase
    .from('classes')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error || !deletedClass) {
    console.error('Delete class error:', error)

    redirect(
      '/admin/classes?error=Class%20was%20not%20deleted.%20Please%20reload%20and%20try%20again'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/classes')

  redirect('/admin/classes?success=Class%20deleted')
}
