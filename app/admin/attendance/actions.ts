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
      'id, schedule_id, occurrence_date, status'
    )
    .eq('id', occurrenceId)
    .maybeSingle()

  if (!occurrence) {
    redirect(
      '/admin/attendance?error=Session%20not%20found'
    )
  }

  if (occurrence.status === 'CANCELLED') {
    redirect(
      `/admin/attendance/${occurrenceId}?error=Attendance%20cannot%20be%20recorded%20for%20a%20cancelled%20session`
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

  if (rosterError) {
    console.error(
      'Load attendance roster error:',
      rosterError
    )

    redirect(
      `/admin/attendance/${occurrenceId}?error=Could%20not%20load%20the%20session%20roster`
    )
  }

  const roster = (enrollments ?? []).filter(
    (enrollment) => {
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
