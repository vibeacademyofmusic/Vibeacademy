'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const STATUSES = new Set([
  'CONTACTED',
  'FOLLOW_UP',
  'RESOLVED',
  'LOST',
  'DISMISSED',
])

const CHANNELS = new Set([
  'PHONE',
  'ZALO',
  'SMS',
  'EMAIL',
  'IN_PERSON',
  'OTHER',
])

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim()
}

function optional(formData: FormData, key: string) {
  const result = value(formData, key)
  return result || null
}

function safeReturnPath(formData: FormData) {
  const raw = value(formData, 'return_to')

  if (
    raw.startsWith('/admin/attendance/retention') &&
    !raw.includes('://')
  ) {
    return raw
  }

  return '/admin/attendance/retention'
}

function messagePath(
  basePath: string,
  key: 'error' | 'success',
  message: string
) {
  const [pathname, rawQuery = ''] = basePath.split('?')
  const query = new URLSearchParams(rawQuery)
  query.set(key, message)
  return `${pathname}?${query.toString()}`
}

export async function refreshRetentionAlerts(
  formData: FormData
) {
  const db = await createClient()
  const returnTo = safeReturnPath(formData)
  const branch = optional(formData, 'branch_id')

  if (branch && !UUID_PATTERN.test(branch)) {
    redirect(
      messagePath(
        returnTo,
        'error',
        'Chi nhánh không hợp lệ.'
      )
    )
  }

  const { data, error } = await db.rpc(
    'refresh_attendance_retention_alerts',
    {
      p_branch: branch,
    }
  )

  if (error) {
    console.error('Refresh retention alerts failed', {
      code: error.code,
      message: error.message,
    })

    redirect(
      messagePath(
        returnTo,
        'error',
        'Không thể làm mới cảnh báo chuyên cần.'
      )
    )
  }

  revalidatePath('/admin/attendance/retention')
  revalidatePath('/admin/attendance')

  const result =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : {}

  const created = Number(result.created ?? 0)
  const refreshed = Number(result.refreshed ?? 0)
  const resolved = Number(result.auto_resolved ?? 0)

  redirect(
    messagePath(
      returnTo,
      'success',
      `Đã làm mới cảnh báo: ${created} mới, ${refreshed} cập nhật, ${resolved} tự đóng.`
    )
  )
}

export async function updateRetentionAlert(
  formData: FormData
) {
  const db = await createClient()
  const returnTo = safeReturnPath(formData)

  const alertId = value(formData, 'alert_id')
  const status = value(formData, 'status')
  const channel = optional(formData, 'channel')
  const note = value(formData, 'note')
  const followUpOn = optional(formData, 'follow_up_on')

  if (!UUID_PATTERN.test(alertId)) {
    redirect(
      messagePath(
        returnTo,
        'error',
        'Cảnh báo không hợp lệ.'
      )
    )
  }

  if (!STATUSES.has(status)) {
    redirect(
      messagePath(
        returnTo,
        'error',
        'Trạng thái xử lý không hợp lệ.'
      )
    )
  }

  if (channel && !CHANNELS.has(channel)) {
    redirect(
      messagePath(
        returnTo,
        'error',
        'Kênh liên hệ không hợp lệ.'
      )
    )
  }

  if (!note || note.length > 4000) {
    redirect(
      messagePath(
        returnTo,
        'error',
        'Cần nhập ghi chú xử lý từ 1 đến 4000 ký tự.'
      )
    )
  }

  if (
    followUpOn &&
    !DATE_PATTERN.test(followUpOn)
  ) {
    redirect(
      messagePath(
        returnTo,
        'error',
        'Ngày theo dõi không hợp lệ.'
      )
    )
  }

  if (status === 'FOLLOW_UP' && !followUpOn) {
    redirect(
      messagePath(
        returnTo,
        'error',
        'Cần chọn ngày theo dõi tiếp theo.'
      )
    )
  }

  const { error } = await db.rpc(
    'update_attendance_retention_alert',
    {
      p_alert: alertId,
      p_status: status,
      p_channel: channel,
      p_note: note,
      p_follow_up_on: followUpOn,
    }
  )

  if (error) {
    console.error('Update retention alert failed', {
      code: error.code,
      message: error.message,
    })

    const mapped =
      error.message.includes(
        'RETENTION_ALERT_ALREADY_CLOSED'
      )
        ? 'Cảnh báo này đã được đóng.'
        : error.message.includes(
              'RETENTION_ALERT_FOLLOW_UP_DATE_REQUIRED'
            )
          ? 'Cần chọn ngày theo dõi tiếp theo.'
          : error.message.includes(
                'RETENTION_ALERT_NOTE_REQUIRED'
              )
            ? 'Cần nhập ghi chú xử lý.'
            : 'Không thể cập nhật cảnh báo chuyên cần.'

    redirect(messagePath(returnTo, 'error', mapped))
  }

  revalidatePath('/admin/attendance/retention')
  revalidatePath('/admin/attendance')

  redirect(
    messagePath(
      returnTo,
      'success',
      'Đã cập nhật chăm sóc học viên.'
    )
  )
}
