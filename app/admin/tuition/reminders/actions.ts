'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern } from '../../finance/operations'
import { sendZaloTemplateMessage } from '@/lib/integrations/zalo/outbound'
import { TUITION_TEMPLATE_KEY } from '@/lib/integrations/zalo/tuition-notice'
import { loadTuitionNotice } from './notice'

function back(message: string, tone: 'error' | 'success' = 'error') {
  revalidatePath('/admin/tuition/reminders')
  redirect('/admin/tuition/reminders?' + new URLSearchParams({ [tone]: message }))
}

async function call(form: FormData, generate: boolean) {
  const db = await adminClient()
  let message = ''
  const id = String(form.get('reminder_id') ?? ''), status = String(form.get('status') ?? ''), reason = String(form.get('reason') ?? '').trim()
  if (!generate && (!uuidPattern.test(id) || !['SKIPPED', 'CANCELLED'].includes(status) || !reason || reason.length > 2000)) message = 'Vui lòng chọn trạng thái hợp lệ và nhập lý do.'
  if (!message) {
    try {
      const result = generate ? await db.rpc('generate_tuition_reminders') : await db.rpc('resolve_tuition_reminder', { p_reminder_id: id, p_status: status, p_reason: reason })
      if (result.error) message = 'Không thể thực hiện. Hãy tải lại và kiểm tra trạng thái hiện tại.'
    } catch { message = 'Không xác nhận được kết quả. Hãy tải lại trước khi thử lại.' }
  }
  revalidatePath('/admin/tuition/reminders')
  redirect('/admin/tuition/reminders?' + new URLSearchParams(message ? { error: message } : { success: generate ? 'Đã kiểm tra và tạo các nhắc học phí còn thiếu. Chưa gửi thông báo.' : 'Đã cập nhật trạng thái nhắc học phí.' }))
}
export async function generateReminders(form: FormData) { return call(form, true) }
export async function resolveReminder(form: FormData) { return call(form, false) }

export async function confirmTuitionZalo(form: FormData) {
  const id = String(form.get('reminder_id') ?? '')
  const parentId = String(form.get('parent_id') ?? '')
  if (!uuidPattern.test(id)) return back('Không xác định được học viên cần gửi.')
  const db = await adminClient()
  const notice = await loadTuitionNotice(db, id, uuidPattern.test(parentId) ? parentId : null)
  if (!notice) return back('Không tìm thấy nhắc học phí của học viên này.')
  if (!notice.attemptAllowed || !notice.recipient || !notice.parameters) return back(notice.blockers[0] ?? 'Hồ sơ chưa đủ điều kiện. Trạng thái vẫn là chưa gửi.')
  const opened = await db.rpc('begin_tuition_zalo_send', {
    p_reminder: notice.reminderId,
    p_parent: notice.recipient.id,
  })
  const send = opened.data as { send_id?: string; tracking_id?: string } | null
  if (opened.error || !send?.send_id || !send.tracking_id) return back('Không tạo được lần gửi. Phản hồi vẫn là chưa phản hồi.')
  await sendZaloTemplateMessage({
    providerUserId: '',
    templateId: '',
    parameters: notice.parameters,
    idempotencyKey: `${TUITION_TEMPLATE_KEY}:${send.tracking_id}`,
  })
  const recorded = await db.rpc('finish_tuition_zalo_send', {
    p_send: send.send_id,
    p_outcome: 'ERROR',
    p_error: 'PROVIDER_NOT_CONFIGURED',
    p_receipt: null,
    p_message_id: null,
  })
  if (recorded.error) return back('Không ghi được kết quả gửi. Hãy tải lại. Chưa gọi Zalo thật.')
  const label = recorded.data === 'SENT' ? 'Đã gửi' : recorded.data === 'ERROR' ? 'Gửi lỗi' : 'Chưa gửi'
  return back(`Đã cập nhật trạng thái Zalo: ${label}. Phản hồi vẫn là Chưa phản hồi. Zalo thật đang tắt nên tin không rời hệ thống.`, 'success')
}
