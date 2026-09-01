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

function timeToMinutes(value: string) {
  const [hours, minutes] = value
    .slice(0, 5)
    .split(':')
    .map(Number)

  return hours * 60 + minutes
}

function timeRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
) {
  return (
    timeToMinutes(startA) < timeToMinutes(endB) &&
    timeToMinutes(endA) > timeToMinutes(startB)
  )
}

function dateRangesOverlap(
  startA: string,
  endA: string | null,
  startB: string,
  endB: string | null
) {
  const aEnd = endA ?? '9999-12-31'
  const bEnd = endB ?? '9999-12-31'

  return startA <= bEnd && aEnd >= startB
}

export async function createSchedule(
  formData: FormData
) {
  const supabase = await requireSuperAdmin()

  const classId = String(
    formData.get('class_id') ?? ''
  ).trim()

  const roomId = String(
    formData.get('room_id') ?? ''
  ).trim()

  const dayOfWeek = Number(
    formData.get('day_of_week')
  )

  const startTime = String(
    formData.get('start_time') ?? ''
  ).trim()

  const endTime = String(
    formData.get('end_time') ?? ''
  ).trim()

  const effectiveFrom = String(
    formData.get('effective_from') ?? ''
  ).trim()

  const effectiveToRaw = String(
    formData.get('effective_to') ?? ''
  ).trim()

  const effectiveTo =
    effectiveToRaw || null

  const notes = String(
    formData.get('notes') ?? ''
  ).trim()

  if (
    !classId ||
    !roomId ||
    !dayOfWeek ||
    !startTime ||
    !endTime ||
    !effectiveFrom
  ) {
    redirect(
      '/admin/schedule?error=Please%20complete%20all%20required%20fields'
    )
  }

  if (
    !Number.isInteger(dayOfWeek) ||
    dayOfWeek < 1 ||
    dayOfWeek > 7
  ) {
    redirect(
      '/admin/schedule?error=Invalid%20day%20of%20week'
    )
  }

  if (
    timeToMinutes(endTime) <=
    timeToMinutes(startTime)
  ) {
    redirect(
      '/admin/schedule?error=End%20time%20must%20be%20after%20start%20time'
    )
  }

  if (
    effectiveTo &&
    effectiveTo < effectiveFrom
  ) {
    redirect(
      '/admin/schedule?error=End%20date%20cannot%20be%20before%20start%20date'
    )
  }

  // --------------------------------------------------
  // CLASS VALIDATION
  // --------------------------------------------------

  const { data: classItem } = await supabase
    .from('classes')
    .select(
      'id, branch_id, code, name, status'
    )
    .eq('id', classId)
    .maybeSingle()

  if (!classItem) {
    redirect(
      '/admin/schedule?error=Class%20not%20found'
    )
  }

  if (
    ['COMPLETED', 'CANCELLED'].includes(
      classItem.status
    )
  ) {
    redirect(
      '/admin/schedule?error=Cannot%20schedule%20a%20completed%20or%20cancelled%20class'
    )
  }

  // --------------------------------------------------
  // ROOM MUST BELONG TO SAME BRANCH
  // --------------------------------------------------

  const { data: room } = await supabase
    .from('rooms')
    .select(
      'id, branch_id, code, name, status'
    )
    .eq('id', roomId)
    .maybeSingle()

  if (!room || room.status !== 'ACTIVE') {
    redirect(
      '/admin/schedule?error=Room%20is%20not%20available'
    )
  }

  if (
    room.branch_id !== classItem.branch_id
  ) {
    redirect(
      '/admin/schedule?error=Room%20must%20belong%20to%20the%20same%20branch%20as%20the%20class'
    )
  }

  // --------------------------------------------------
  // LOAD ACTIVE SCHEDULES ON SAME WEEKDAY
  // --------------------------------------------------

  const { data: existingSchedules } =
    await supabase
      .from('schedules')
      .select(`
        id,
        class_id,
        room_id,
        day_of_week,
        start_time,
        end_time,
        effective_from,
        effective_to,
        status
      `)
      .eq('day_of_week', dayOfWeek)
      .eq('status', 'ACTIVE')

  const conflictingSchedules =
    (existingSchedules ?? []).filter(
      (schedule) =>
        timeRangesOverlap(
          startTime,
          endTime,
          schedule.start_time,
          schedule.end_time
        ) &&
        dateRangesOverlap(
          effectiveFrom,
          effectiveTo,
          schedule.effective_from,
          schedule.effective_to
        )
    )

  // --------------------------------------------------
  // CLASS CANNOT BE IN TWO PLACES AT ONCE
  // --------------------------------------------------

  const classConflict =
    conflictingSchedules.find(
      (schedule) =>
        schedule.class_id === classId
    )

  if (classConflict) {
    redirect(
      '/admin/schedule?error=This%20class%20already%20has%20an%20overlapping%20schedule'
    )
  }

  // --------------------------------------------------
  // ROOM CANNOT HOST TWO CLASSES AT ONCE
  // --------------------------------------------------

  const roomConflict =
    conflictingSchedules.find(
      (schedule) =>
        schedule.room_id === roomId
    )

  if (roomConflict) {
    redirect(
      '/admin/schedule?error=This%20room%20is%20already%20occupied%20during%20that%20time'
    )
  }

  // --------------------------------------------------
  // TEACHER CONFLICT CHECK
  // Current architecture assigns teachers at class level.
  // --------------------------------------------------

  const { data: currentTeacherAssignments } =
    await supabase
      .from('class_teachers')
      .select('teacher_id')
      .eq('class_id', classId)
      .eq('is_active', true)

  const teacherIds = (
    currentTeacherAssignments ?? []
  ).map(
    (assignment) =>
      assignment.teacher_id
  )

  if (teacherIds.length > 0) {
    const { data: otherTeacherAssignments } =
      await supabase
        .from('class_teachers')
        .select(
          'class_id, teacher_id'
        )
        .in('teacher_id', teacherIds)
        .eq('is_active', true)

    const teacherClassIds = Array.from(
      new Set(
        (
          otherTeacherAssignments ?? []
        )
          .map(
            (assignment) =>
              assignment.class_id
          )
          .filter(
            (otherClassId) =>
              otherClassId !== classId
          )
      )
    )

    if (teacherClassIds.length > 0) {
      const teacherConflict =
        conflictingSchedules.find(
          (schedule) =>
            teacherClassIds.includes(
              schedule.class_id
            )
        )

      if (teacherConflict) {
        redirect(
          '/admin/schedule?error=A%20teacher%20assigned%20to%20this%20class%20is%20already%20teaching%20another%20class%20at%20that%20time'
        )
      }
    }
  }

  // --------------------------------------------------
  // CREATE MASTER SCHEDULE
  // --------------------------------------------------

  const { error } = await supabase
    .from('schedules')
    .insert({
      class_id: classId,
      room_id: roomId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      timezone: 'Asia/Ho_Chi_Minh',
      notes: notes || null,
      status: 'ACTIVE',
    })

  if (error) {
    console.error(
      'Create schedule error:',
      error
    )

    if (error.code === '23505') {
      redirect(
        '/admin/schedule?error=This%20schedule%20already%20exists'
      )
    }

    redirect(
      '/admin/schedule?error=Could%20not%20create%20schedule'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/schedule')
  revalidatePath(
    `/admin/classes/${classId}`
  )

  redirect(
    '/admin/schedule?success=Schedule%20created%20successfully'
  )
}

export async function setScheduleStatus(
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
    !['ACTIVE', 'INACTIVE'].includes(
      status
    )
  ) {
    redirect(
      '/admin/schedule?error=Invalid%20schedule%20status'
    )
  }

  const { error } = await supabase
    .from('schedules')
    .update({ status })
    .eq('id', id)

  if (error) {
    console.error(
      'Schedule status error:',
      error
    )

    redirect(
      '/admin/schedule?error=Could%20not%20update%20schedule'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/schedule')

  redirect(
    '/admin/schedule?success=Schedule%20status%20updated'
  )
}