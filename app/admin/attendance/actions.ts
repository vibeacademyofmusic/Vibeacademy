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
  const supabase = await requireSuperAdmin()

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
