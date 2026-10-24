'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern } from '../finance/operations'
export async function notificationAction(form: FormData) {
  const db = await adminClient(), action = String(form.get('action') || ''), id = String(form.get('id') || '')
  if (!uuidPattern.test(id)) redirect('/admin/notifications?error=invalid')
  let result
  if (action === 'ENQUEUE') {
    const event = String(form.get('event') || ''), channel = String(form.get('channel') || '')
    if (!['ONBOARDING', 'TUITION_REMINDER', 'LEARNING_REPORT', 'SCHEDULE_CHANGED', 'ATTENDANCE_NOTICE', 'FEEDBACK_FOLLOW_UP'].includes(event) || !['IN_APP', 'EMAIL', 'ZALO'].includes(channel)) redirect('/admin/notifications?error=invalid')
    result = await db.rpc('enqueue_notification_event', { p_event: event, p_entity: id, p_channel: channel, p_mode: 'LIVE' })
  } else if (action === 'DELIVER') result = await db.rpc('deliver_in_app_notification', { p_job: id })
  else if (['RETRY', 'CANCEL'].includes(action)) result = await db.rpc('manage_notification', { p_job: id, p_action: action })
  else redirect('/admin/notifications?error=invalid')
  if (result.error) redirect('/admin/notifications?error=failed')
  revalidatePath('/admin/notifications'); revalidatePath('/notifications')
  redirect('/admin/notifications?success=1')
}
