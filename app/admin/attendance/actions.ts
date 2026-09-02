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

  return {
    supabase,
    userId: String(claimsData.claims.sub),
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ATTENDANCE_STATUSES = new Set([
  'PRESENT',
  'ABSENT',
  'LATE',
  'EXCUSED',
])

const SESSION_STATUSES = new Set([
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
])

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const parsed = new Date(`${value}T00:00:00Z`)

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

type DateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function getDateTimeParts(
  value: Date,
  timezone: string
): DateTimeParts | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone,
    }).formatToParts(value)

    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value])
    )

    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
    }
  } catch {
    return null
  }
}

function localDateTimeToIso(
  value: string,
  timezone: string
) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  )

  if (!match) {
    return null
  }

  const target: DateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  }

  const localTimestamp = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute
  )

  const normalized = new Date(localTimestamp)

  if (
    normalized.getUTCFullYear() !== target.year ||
    normalized.getUTCMonth() + 1 !== target.month ||
    normalized.getUTCDate() !== target.day ||
    normalized.getUTCHours() !== target.hour ||
    normalized.getUTCMinutes() !== target.minute
  ) {
    return null
  }

  let utcTimestamp = localTimestamp

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const zoned = getDateTimeParts(
      new Date(utcTimestamp),
      timezone
    )

    if (!zoned) {
      return null
    }

    const representedTimestamp = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute
    )

    utcTimestamp =
      localTimestamp -
      (representedTimestamp - utcTimestamp)
  }

  const result = new Date(utcTimestamp)
  const verified = getDateTimeParts(result, timezone)

  if (
    !verified ||
    verified.year !== target.year ||
    verified.month !== target.month ||
    verified.day !== target.day ||
    verified.hour !== target.hour ||
    verified.minute !== target.minute
  ) {
    return null
  }

  return result.toISOString()
}

export async function generateSessions(
  formData: FormData
) {
  const { supabase } = await requireSuperAdmin()

  const fromDate = String(
    formData.get('from_date') ?? ''
  ).trim()

  const toDate = String(
    formData.get('to_date') ?? ''
  ).trim()

  if (
    !isValidIsoDate(fromDate) ||
    !isValidIsoDate(toDate)
  ) {
    redirect(
      '/admin/attendance?error=Please%20select%20a%20valid%20date%20range'
    )
  }

  if (toDate < fromDate) {
    redirect(
      '/admin/attendance?error=End%20date%20cannot%20be%20before%20start%20date'
    )
  }

  const fromTime = new Date(
    `${fromDate}T00:00:00Z`
  ).getTime()

  const toTime = new Date(
    `${toDate}T00:00:00Z`
  ).getTime()

  const rangeInDays =
    (toTime - fromTime) /
    (24 * 60 * 60 * 1000)

  if (rangeInDays > 366) {
    redirect(
      '/admin/attendance?error=Date%20range%20cannot%20exceed%20366%20days'
    )
  }

  const { data: insertedCount, error } =
    await supabase.rpc(
      'generate_session_occurrences',
      {
        p_from: fromDate,
        p_to: toDate,
      }
    )

  if (error) {
    console.error(
      'Generate session occurrences error:',
      error
    )

    redirect(
      '/admin/attendance?error=Could%20not%20generate%20sessions'
    )
  }

  const generated =
    typeof insertedCount === 'number'
      ? insertedCount
      : 0

  revalidatePath('/admin/attendance')

  redirect(
    `/admin/attendance?success=${encodeURIComponent(
      `${generated} new session${
        generated === 1 ? '' : 's'
      } generated`
    )}`
  )
}

export async function saveAttendance(
  formData: FormData
) {
  const { supabase, userId } =
    await requireSuperAdmin()

  const occurrenceId = String(
    formData.get('occurrence_id') ?? ''
  ).trim()

  if (!UUID_PATTERN.test(occurrenceId)) {
    redirect(
      '/admin/attendance?error=Invalid%20session'
    )
  }

  const { data: occurrence } = await supabase
    .from('session_occurrences')
    .select(
      'id, schedule_id, occurrence_date, status, occurrence_type'
    )
    .eq('id', occurrenceId)
    .maybeSingle()

  if (!occurrence) {
    redirect(
      '/admin/attendance?error=Session%20not%20found'
    )
  }

  if (occurrence.status !== 'SCHEDULED') {
    redirect(
      `/admin/attendance/${occurrenceId}?error=Attendance%20can%20only%20be%20changed%20while%20the%20session%20is%20Scheduled`
    )
  }

  const { data: schedule } = await supabase
    .from('schedules')
    .select('id, class_id')
    .eq('id', occurrence.schedule_id)
    .maybeSingle()

  if (!schedule) {
    redirect(
      `/admin/attendance/${occurrenceId}?error=Session%20schedule%20not%20found`
    )
  }

  const { data: enrollments, error: rosterError } =
    await supabase
      .from('enrollments')
      .select(
        'id, enrolled_at, started_at, ended_at'
      )
      .eq('class_id', schedule.class_id)

  const {
    data: makeupParticipants,
    error: participantsError,
  } = occurrence.occurrence_type === 'MAKEUP'
    ? await supabase
        .from('session_occurrence_participants')
        .select('enrollment_id')
        .eq('session_occurrence_id', occurrenceId)
    : { data: [], error: null }

  if (rosterError || participantsError) {
    console.error(
      'Load attendance roster error:',
      rosterError ?? participantsError
    )

    redirect(
      `/admin/attendance/${occurrenceId}?error=Could%20not%20load%20the%20session%20roster`
    )
  }

  const makeupParticipantIds = new Set(
    (makeupParticipants ?? []).map(
      (participant) => participant.enrollment_id
    )
  )

  const roster = (enrollments ?? []).filter(
    (enrollment) => {
      if (occurrence.occurrence_type === 'MAKEUP') {
        return makeupParticipantIds.has(enrollment.id)
      }

      const startDate =
        enrollment.started_at ??
        enrollment.enrolled_at

      return (
        startDate <= occurrence.occurrence_date &&
        (!enrollment.ended_at ||
          enrollment.ended_at >=
            occurrence.occurrence_date)
      )
    }
  )

  const markedAt = new Date().toISOString()

  const records = roster.flatMap(
    (enrollment) => {
      const status = String(
        formData.get(
          `status_${enrollment.id}`
        ) ?? ''
      ).trim()

      if (!ATTENDANCE_STATUSES.has(status)) {
        return []
      }

      const notes = String(
        formData.get(
          `notes_${enrollment.id}`
        ) ?? ''
      ).trim()

      return [
        {
          session_occurrence_id: occurrenceId,
          enrollment_id: enrollment.id,
          status,
          notes: notes || null,
          marked_at: markedAt,
          marked_by: userId,
        },
      ]
    }
  )

  if (records.length === 0) {
    redirect(
      `/admin/attendance/${occurrenceId}?error=Select%20at%20least%20one%20attendance%20status`
    )
  }

  const { error } = await supabase
    .from('attendance_records')
    .upsert(records, {
      onConflict:
        'session_occurrence_id,enrollment_id',
    })

  if (error) {
    console.error('Save attendance error:', error)

    redirect(
      `/admin/attendance/${occurrenceId}?error=Could%20not%20save%20attendance`
    )
  }

  revalidatePath('/admin/attendance')
  revalidatePath(
    `/admin/attendance/${occurrenceId}`
  )

  redirect(
    `/admin/attendance/${occurrenceId}?success=${encodeURIComponent(
      `${records.length} attendance record${
        records.length === 1 ? '' : 's'
      } saved`
    )}`
  )
}

export async function setSessionStatus(
  formData: FormData
) {
  const { supabase } = await requireSuperAdmin()

  const occurrenceId = String(
    formData.get('occurrence_id') ?? ''
  ).trim()

  const targetStatus = String(
    formData.get('target_status') ?? ''
  ).trim()

  if (
    !UUID_PATTERN.test(occurrenceId) ||
    !SESSION_STATUSES.has(targetStatus)
  ) {
    redirect(
      '/admin/attendance?error=Invalid%20session%20status%20request'
    )
  }

  const { error } = await supabase.rpc(
    'set_session_occurrence_status',
    {
      p_occurrence_id: occurrenceId,
      p_status: targetStatus,
    }
  )

  if (error) {
    console.error('Set session status error:', error)

    let message = 'Could not update session status'

    if (
      error.message.includes(
        'All students in the session roster must be marked'
      )
    ) {
      message =
        'Mark every student before completing this session'
    } else if (
      error.message.includes(
        'A session with attendance records cannot be cancelled'
      )
    ) {
      message =
        'A session with attendance cannot be cancelled'
    } else if (
      error.message.includes(
        'Invalid session status transition'
      )
    ) {
      message = 'This session status change is not allowed'
    } else if (
      error.message.includes(
        'Cannot reopen a source session while its makeup credit is reserved or used'
      )
    ) {
      message =
        'This source session cannot be reopened because a makeup credit is reserved or used'
    } else if (
      error.message.includes(
        'Completed or cancelled makeup sessions cannot be reopened'
      )
    ) {
      message =
        'A completed or cancelled makeup session cannot be reopened'
    }

    redirect(
      `/admin/attendance/${occurrenceId}?error=${encodeURIComponent(
        message
      )}`
    )
  }

  revalidatePath('/admin/attendance')
  revalidatePath(
    `/admin/attendance/${occurrenceId}`
  )

  const successMessage =
    targetStatus === 'COMPLETED'
      ? 'Session completed'
      : targetStatus === 'CANCELLED'
        ? 'Session cancelled'
        : 'Session restored to scheduled'

  redirect(
    `/admin/attendance/${occurrenceId}?success=${encodeURIComponent(
      successMessage
    )}`
  )
}

export async function rescheduleSession(
  formData: FormData
) {
  const { supabase } = await requireSuperAdmin()

  const occurrenceId = String(
    formData.get('occurrence_id') ?? ''
  ).trim()

  const startsAtLocal = String(
    formData.get('starts_at_local') ?? ''
  ).trim()

  const endsAtLocal = String(
    formData.get('ends_at_local') ?? ''
  ).trim()

  const roomId = String(
    formData.get('room_id') ?? ''
  ).trim()

  const reason = String(
    formData.get('reason') ?? ''
  ).trim()

  if (
    !UUID_PATTERN.test(occurrenceId) ||
    !UUID_PATTERN.test(roomId)
  ) {
    redirect(
      '/admin/attendance?error=Invalid%20reschedule%20request'
    )
  }

  if (!reason || reason.length > 500) {
    redirect(
      `/admin/attendance/${occurrenceId}?error=Please%20enter%20a%20reschedule%20reason%20of%20500%20characters%20or%20fewer`
    )
  }

  const { data: occurrence } = await supabase
    .from('session_occurrences')
    .select('id, schedule_id')
    .eq('id', occurrenceId)
    .maybeSingle()

  if (!occurrence) {
    redirect(
      '/admin/attendance?error=Session%20not%20found'
    )
  }

  const { data: schedule } = await supabase
    .from('schedules')
    .select('timezone')
    .eq('id', occurrence.schedule_id)
    .maybeSingle()

  if (!schedule) {
    redirect(
      `/admin/attendance/${occurrenceId}?error=Session%20schedule%20not%20found`
    )
  }

  const startsAt = localDateTimeToIso(
    startsAtLocal,
    schedule.timezone
  )

  const endsAt = localDateTimeToIso(
    endsAtLocal,
    schedule.timezone
  )

  if (!startsAt || !endsAt) {
    redirect(
      `/admin/attendance/${occurrenceId}?error=Please%20enter%20a%20valid%20session%20date%20and%20time`
    )
  }

  const { error } = await supabase.rpc(
    'reschedule_session_occurrence',
    {
      p_occurrence_id: occurrenceId,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_room_id: roomId,
      p_reason: reason,
    }
  )

  if (error) {
    console.error('Reschedule session error:', error)

    let message = 'Could not reschedule this session'

    if (
      error.message.includes(
        'Only scheduled sessions can be rescheduled'
      )
    ) {
      message = 'Only a scheduled session can be rescheduled'
    } else if (
      error.message.includes(
        'Session with attendance cannot be rescheduled'
      )
    ) {
      message =
        'A session with attendance cannot be rescheduled'
    } else if (
      error.message.includes(
        'This class already has an overlapping session'
      )
    ) {
      message =
        'This class already has another session at that time'
    } else if (
      error.message.includes(
        'This room is already occupied'
      )
    ) {
      message = 'This room is already occupied at that time'
    } else if (
      error.message.includes(
        'A teacher assigned to this class'
      )
    ) {
      message =
        'A teacher assigned to this class is already teaching at that time'
    } else if (
      error.message.includes('Room is not available')
    ) {
      message = 'The selected room is not available'
    } else if (
      error.message.includes(
        'Room must belong to the same branch'
      )
    ) {
      message =
        'The selected room must belong to this class branch'
    } else if (
      error.message.includes(
        'Reschedule must change the time or room'
      )
    ) {
      message = 'Change the session time or room first'
    } else if (
      error.message.includes(
        'End time must be after start time'
      )
    ) {
      message = 'End time must be after start time'
    }

    redirect(
      `/admin/attendance/${occurrenceId}?error=${encodeURIComponent(
        message
      )}`
    )
  }

  revalidatePath('/admin/attendance')
  revalidatePath(
    `/admin/attendance/${occurrenceId}`
  )

  redirect(
    `/admin/attendance/${occurrenceId}?success=Session%20rescheduled`
  )
}

export async function createMakeupSession(
  formData: FormData
) {
  const { supabase } = await requireSuperAdmin()

  const sourceOccurrenceId = String(
    formData.get('source_occurrence_id') ?? ''
  ).trim()

  const startsAtLocal = String(
    formData.get('starts_at_local') ?? ''
  ).trim()

  const endsAtLocal = String(
    formData.get('ends_at_local') ?? ''
  ).trim()

  const roomId = String(
    formData.get('room_id') ?? ''
  ).trim()

  const reason = String(
    formData.get('reason') ?? ''
  ).trim()

  const enrollmentIds = formData
    .getAll('enrollment_id')
    .map((value) => String(value).trim())

  if (
    !UUID_PATTERN.test(sourceOccurrenceId) ||
    !UUID_PATTERN.test(roomId)
  ) {
    redirect(
      '/admin/attendance?error=Invalid%20makeup%20session%20request'
    )
  }

  if (
    enrollmentIds.length === 0 ||
    enrollmentIds.some(
      (enrollmentId) =>
        !UUID_PATTERN.test(enrollmentId)
    ) ||
    new Set(enrollmentIds).size !==
      enrollmentIds.length
  ) {
    redirect(
      `/admin/attendance/${sourceOccurrenceId}?error=Select%20at%20least%20one%20valid%20makeup%20participant`
    )
  }

  if (!reason || reason.length > 500) {
    redirect(
      `/admin/attendance/${sourceOccurrenceId}?error=Please%20enter%20a%20makeup%20reason%20of%20500%20characters%20or%20fewer`
    )
  }

  const { data: sourceOccurrence } = await supabase
    .from('session_occurrences')
    .select('id, schedule_id')
    .eq('id', sourceOccurrenceId)
    .maybeSingle()

  if (!sourceOccurrence) {
    redirect(
      '/admin/attendance?error=Source%20session%20not%20found'
    )
  }

  const { data: schedule } = await supabase
    .from('schedules')
    .select('timezone')
    .eq('id', sourceOccurrence.schedule_id)
    .maybeSingle()

  if (!schedule) {
    redirect(
      `/admin/attendance/${sourceOccurrenceId}?error=Session%20schedule%20not%20found`
    )
  }

  const startsAt = localDateTimeToIso(
    startsAtLocal,
    schedule.timezone
  )

  const endsAt = localDateTimeToIso(
    endsAtLocal,
    schedule.timezone
  )

  if (!startsAt || !endsAt) {
    redirect(
      `/admin/attendance/${sourceOccurrenceId}?error=Please%20enter%20a%20valid%20makeup%20date%20and%20time`
    )
  }

  const { data: makeupId, error } =
    await supabase.rpc(
      'create_makeup_session_occurrence',
      {
        p_source_occurrence_id:
          sourceOccurrenceId,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
        p_room_id: roomId,
        p_enrollment_ids: enrollmentIds,
        p_reason: reason,
      }
    )

  if (error) {
    console.error('Create makeup session error:', error)

    let message = 'Could not create this makeup session'

    if (
      error.message.includes(
        'must reference a regular source occurrence'
      )
    ) {
      message =
        'A makeup session must start from a regular session'
    } else if (
      error.message.includes(
        'requires a completed or cancelled source session'
      )
    ) {
      message =
        'Complete or cancel the source session first'
    } else if (
      error.message.includes(
        'must belong to the source roster'
      )
    ) {
      message =
        'Every selected student must belong to the source session roster'
    } else if (
      error.message.includes(
        'does not have an available makeup credit'
      )
    ) {
      message =
        'One or more selected students no longer has an available makeup credit'
    } else if (
      error.message.includes(
        'This class already has an overlapping session'
      )
    ) {
      message =
        'This class already has another session at that time'
    } else if (
      error.message.includes(
        'This room is already occupied'
      )
    ) {
      message = 'This room is already occupied at that time'
    } else if (
      error.message.includes(
        'A teacher assigned to this class'
      )
    ) {
      message =
        'A teacher assigned to this class is already teaching at that time'
    } else if (
      error.message.includes('Room is not available')
    ) {
      message = 'The selected room is not available'
    } else if (
      error.message.includes(
        'Room must belong to the same branch'
      )
    ) {
      message =
        'The selected room must belong to this class branch'
    } else if (
      error.message.includes(
        'End time must be after start time'
      )
    ) {
      message = 'End time must be after start time'
    }

    redirect(
      `/admin/attendance/${sourceOccurrenceId}?error=${encodeURIComponent(
        message
      )}`
    )
  }

  revalidatePath('/admin/attendance')
  revalidatePath(
    `/admin/attendance/${sourceOccurrenceId}`
  )

  if (
    typeof makeupId === 'string' &&
    UUID_PATTERN.test(makeupId)
  ) {
    revalidatePath(`/admin/attendance/${makeupId}`)

    redirect(
      `/admin/attendance/${makeupId}?success=Makeup%20session%20created`
    )
  }

  redirect(
    `/admin/attendance/${sourceOccurrenceId}?success=Makeup%20session%20created`
  )
}
