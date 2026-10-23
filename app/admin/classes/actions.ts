'use server'

import { operationalAdminOn } from '@/lib/auth/request'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { clock, planIndependentShifts, shiftIdentityCode, windowProblems, type TimeWindow } from '@/lib/teaching-shifts/independent'
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
  const slots = readSlots(formData)
  const selectedDays = [...new Set([
    ...formData.getAll('day_of_week').map(value => Number(String(value).trim())),
    ...slots.map(slot => slot.day),
  ])].filter(day => Number.isInteger(day) && day >= 1 && day <= 7)
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
    (slots.length <= 1 && selectedDays.length <= 1 && (!code || !name))
  ) {
    redirect(
      '/admin/classes?view=classes&error=' + encodeURIComponent('Cần chi nhánh, chương trình, mã, tên và loại ca dạy')
    )
  }

  if (slots.length <= 1 && selectedDays.length <= 1 && !/^[A-Z0-9_-]{2,50}$/.test(code)) {
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
  if (slots.length <= 1 && selectedDays.length <= 1 && scheduleRequested && (!Number.isInteger(day) || day < 1 || day > 7 || !startTime || !endTime || !roomId || !effectiveFrom)) {
    redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Lịch lặp lại cần thứ, giờ bắt đầu, giờ kết thúc, phòng và ngày hiệu lực'))
  }
  if (startTime && endTime && endTime <= startTime) {
    redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Giờ kết thúc phải sau giờ bắt đầu'))
  }
  if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
    redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Ngày hết hiệu lực không được trước ngày bắt đầu lịch'))
  }

  if (slots.length > 1 || selectedDays.length > 1) {
    const windows: TimeWindow[] = slots.length
      ? slots
      : selectedDays.map(day => ({ day, start: startTime, end: endTime }))
    const problems = windowProblems(windows)
    if (problems.incomplete || problems.invalid) {
      redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Mỗi dòng cần giờ kết thúc sau giờ bắt đầu'))
    }
    if (problems.overlap) {
      redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Các khung giờ cùng một ngày đang chồng nhau'))
    }
    if (!roomId || !effectiveFrom) {
      redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Mỗi ca cần giờ, phòng và ngày hiệu lực'))
    }
    const { data: room } = await supabase.from('rooms').select('id, branch_id, status, capacity').eq('id', roomId).maybeSingle()
    if (!room || room.status !== 'ACTIVE' || room.branch_id !== branchId) {
      redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Phòng không thuộc chi nhánh của ca dạy hoặc không còn sử dụng'))
    }
    if (!Number.isInteger(room.capacity) || room.capacity <= 0) {
      redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Phòng chưa xác định sức chứa. Giữ chờ ca dạy cho đến khi xác nhận.'))
    }
    if (capacity > room.capacity) {
      redirect('/admin/classes?view=classes&error=' + encodeURIComponent(`Sức chứa vượt sức chứa phòng (${room.capacity})`))
    }
    const { data: occupied, error: occupiedError } = await supabase
      .from('schedules')
      .select('day_of_week, start_time, end_time, room_id, effective_from, effective_to, classes!inner(id, code, name, branch_id, curriculum_id, status)')
      .eq('status', 'ACTIVE')
      .eq('classes.branch_id', branchId)
    if (occupiedError) {
      redirect('/admin/classes?view=classes&error=' + encodeURIComponent('Không kiểm tra được ca đang có. Hãy thử lại.'))
    }
    const existing = (occupied ?? []).flatMap(row => {
      const klass = Array.isArray(row.classes) ? row.classes[0] : row.classes
      if (!klass || klass.status === 'CANCELLED') return []
      const dayCount = (occupied ?? []).filter(other => {
        const otherClass = Array.isArray(other.classes) ? other.classes[0] : other.classes
        return otherClass?.id === klass.id
      }).length
      return [{
        id: klass.id,
        code: klass.code,
        name: klass.name,
        branchId: klass.branch_id,
        curriculumId: klass.curriculum_id,
        dayOfWeek: row.day_of_week,
        startTime: String(row.start_time),
        endTime: String(row.end_time),
        dayCount,
        roomId: row.room_id,
        effectiveFrom: String(row.effective_from),
        effectiveTo: row.effective_to,
      }]
    })
    const plan = planIndependentShifts({
      programCode: program.code,
      programName: program.name,
      branchId,
      curriculumId,
      days: windows.map(window => window.day),
      start: windows[0]?.start || startTime,
      end: windows[0]?.end || endTime,
      windows,
      roomId,
      effectiveFrom,
      effectiveTo: effectiveTo || null,
      existing,
    })
    const createdIds: string[] = []
    const createdCodes: string[] = []
    const fail = async (message: string) => {
      if (createdIds.length) await supabase.from('classes').delete().in('id', createdIds)
      redirect('/admin/classes?view=classes&error=' + encodeURIComponent(message))
    }
    for (const shift of plan) {
      if (shift.existing) continue
      let code = shift.code
      for (let suffix = 2; suffix < 20; suffix += 1) {
        const { data: taken } = await supabase.from('classes').select('id').eq('branch_id', branchId).eq('code', code).maybeSingle()
        if (!taken) break
        code = `${shiftIdentityCode(program.code, shift.day, shift.start)}-${suffix}`.slice(0, 50)
      }
      const { data: created, error } = await supabase.from('classes').insert({
        branch_id: branchId,
        course_id: null,
        curriculum_id: curriculumId,
        code,
        name: shift.name,
        class_type: classType,
        capacity,
        start_date: startDateValue || effectiveFrom,
        end_date: endDateValue || null,
        notes: notes || null,
        status: 'DRAFT',
        accepted_from_level_id: fromLevel,
        accepted_to_level_id: toLevel,
      }).select('id').single()
      if (error || !created) return await fail(error?.message || 'Không tạo được ca dạy')
      createdIds.push(created.id)
      createdCodes.push(code)
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
      const { data: sameDay, error: sameDayError } = await supabase.from('schedules').select('id, class_id, room_id, day_of_week, start_time, end_time, effective_from, effective_to').eq('status', 'ACTIVE').eq('day_of_week', shift.day)
      if (sameDayError) return await fail('Không kiểm tra được lịch sử dụng phòng. Hãy thử lại.')
      const overlaps = (sameDay ?? []).filter(row =>
        clock(String(row.start_time)) < shift.end && shift.start < clock(String(row.end_time))
        && (effectiveFrom <= (row.effective_to ?? '9999-12-31') && (effectiveTo || '9999-12-31') >= row.effective_from)
      )
      if (overlaps.some(row => row.room_id === roomId)) await fail('Phòng đã có ca dạy khác trong khung giờ này')
      if (teacherId) {
        const { data: otherPrimary } = await supabase.from('class_teachers').select('class_id').eq('teacher_id', teacherId).eq('teacher_role', 'PRIMARY').eq('is_active', true).neq('class_id', created.id)
        const otherIds = new Set((otherPrimary ?? []).map(row => row.class_id))
        const candidate: ShiftSlot = { classId: created.id, dayOfWeek: shift.day, startTime: shift.start, endTime: shift.end, effectiveFrom, effectiveTo: effectiveTo || null }
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
        day_of_week: shift.day,
        start_time: shift.start,
        end_time: shift.end,
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
        timezone: 'Asia/Ho_Chi_Minh',
        status: 'ACTIVE',
      })
      if (scheduleError) {
        await fail(scheduleSaveErrorMessage(scheduleError.message))
      }
      if (teacherId && roomId) {
        const { error: activateError } = await supabase.from('classes').update({ status: 'ACTIVE' }).eq('id', created.id)
        if (activateError) await fail('Đã tạo ca dạy nhưng chưa chuyển được sang đang hoạt động')
      }
    }
    revalidatePath('/admin')
    revalidatePath('/admin/classes')
    revalidatePath('/admin/students')
    const reused = plan.filter(shift => shift.existing).map(shift => shift.existing?.code).filter(Boolean)
    if (!createdCodes.length) {
      redirect('/admin/classes?view=classes&error=' + encodeURIComponent(`Đã có ca tương ứng: ${reused.join(', ')}. Mở ca đó, không tạo thêm.`))
    }
    const missing = [
      !teacherId ? 'giáo viên chính' : null,
    ].filter(Boolean)
    redirect('/admin/classes?view=classes&success=' + encodeURIComponent(
      `Đã tạo ${createdCodes.length} ca độc lập: ${createdCodes.join(', ')}.`
      + (reused.length ? ` Giữ nguyên ca đã có: ${reused.join(', ')}.` : '')
      + (missing.length ? ` Còn thiếu: ${missing.join(', ')}.` : ' Có thể nhận học viên khi ca đã kích hoạt.')
    ))
  }

  const complete = Boolean(teacherId && scheduleRequested && roomId && effectiveFrom)
  const { data: created, error } = await supabase
    .from('classes')
    .insert({
      branch_id: branchId,
      course_id: null,
      curriculum_id: curriculumId,
      code,
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
    const { data: room } = await supabase.from('rooms').select('id, branch_id, status, capacity').eq('id', roomId).maybeSingle()
    if (!room || room.status !== 'ACTIVE' || room.branch_id !== branchId) {
      return await fail('Phòng không thuộc chi nhánh của ca dạy hoặc không còn sử dụng')
    }
    if (!Number.isInteger(room.capacity) || room.capacity <= 0) {
      return await fail('Phòng chưa xác định sức chứa. Giữ chờ ca dạy cho đến khi xác nhận.')
    }
    if (capacity > room.capacity) {
      await fail(`Sức chứa vượt sức chứa phòng (${room.capacity})`)
    }
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
