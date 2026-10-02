'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern } from '../../finance/operations'
import { ZALO_PILOT_OUTBOUND_DISABLED } from '@/lib/integrations/zalo/pilot-outbound'
import { TUITION_PROVIDER_TEMPLATE_ID, tuitionSendBeginMessage } from '@/lib/integrations/zalo/tuition-notice'
import { sendManualTuitionZalo } from '@/lib/integrations/zalo/tuition-test-send'
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

const consentSources = ['TUITION_NOTICE_IN_PERSON', 'TUITION_NOTICE_PHONE', 'TUITION_NOTICE_WRITTEN']

export async function recordTuitionNoticeConsent(form: FormData) {
  const id = String(form.get('reminder_id') ?? '')
  const parentId = String(form.get('parent_id') ?? '')
  const source = String(form.get('source') ?? '')
  if (!uuidPattern.test(id) || !uuidPattern.test(parentId)) return back('Không xác định được học viên và người nhận.')
  if (form.get('tuition_notice_consent') !== 'yes') return back('Chưa có xác nhận của phụ huynh. Chưa ghi đồng ý và chưa gửi.')
  if (!consentSources.includes(source)) return back('Hãy chọn nguồn xác nhận của phụ huynh. Chưa ghi đồng ý và chưa gửi.')
  const db = await adminClient()
  const notice = await loadTuitionNotice(db, id, parentId)
  if (!notice?.recipient || notice.recipient.id !== parentId) return back('Người nhận không thuộc học viên này. Chưa ghi đồng ý và chưa gửi.')
  const recorded = await db.rpc('record_tuition_zalo_notice_consent', {
    p_student: notice.studentId,
    p_parent: parentId,
    p_confirmed: true,
    p_source: source,
  })
  if (recorded.error || (recorded.data !== 'recorded' && recorded.data !== 'already_recorded')) {
    return back('Không ghi được đồng ý nhận thông báo học phí. Hãy tải lại. Chưa gửi tin.')
  }
  revalidatePath('/admin/tuition/reminders')
  redirect('/admin/tuition/reminders?' + new URLSearchParams({
    success: 'Đã ghi nhận đồng ý nhận thông báo học phí cho đúng học viên này. Chưa gửi tin.',
    zalo: id,
    parent: parentId,
  }))
}

export async function recordTuitionContactNote(form: FormData) {
  const id = String(form.get('reminder_id') ?? '')
  const note = String(form.get('contact_note') ?? '').trim()
  if (!uuidPattern.test(id)) return back('Không xác định được nhắc học phí cần xử lý.')
  if (!note || note.length > 2000) return back('Hãy nhập nội dung xử lý, tối đa 2000 ký tự.')
  const db = await adminClient()
  const saved = await db.rpc('record_tuition_zalo_contact_note', { p_reminder: id, p_note: note })
  if (saved.error || saved.data !== 'noted') return back('Chỉ ghi nội dung xử lý khi phản hồi hiện tại là Yêu cầu khác. Chưa đổi trạng thái học viên.')
  revalidatePath('/admin/tuition/reminders')
  redirect('/admin/tuition/reminders?' + new URLSearchParams({ success: 'Đã lưu nội dung xử lý. Chưa đổi trạng thái học viên, ghi danh, bảo lưu, công nợ hoặc thanh toán.', zalo: id }))
}

export async function confirmTuitionZalo(form: FormData) {
  const id = String(form.get('reminder_id') ?? '')
  const parentId = String(form.get('parent_id') ?? '')
  if (!uuidPattern.test(id)) return back('Không xác định được học viên cần gửi.')
  const db = await adminClient()
  const notice = await loadTuitionNotice(db, id, uuidPattern.test(parentId) ? parentId : null)
  if (!notice) return back('Không tìm thấy nhắc học phí của học viên này.')
  if (!notice.attemptAllowed || !notice.recipient || !notice.parameters) return back(notice.blockers[0] ?? 'Hồ sơ chưa đủ điều kiện. Trạng thái vẫn là chưa gửi.')
  if (!notice.recipient.phone) return back('Người nhận chưa có số điện thoại. Trạng thái vẫn là chưa gửi.')
  const opened = await db.rpc('begin_tuition_zalo_send', {
    p_reminder: notice.reminderId,
    p_parent: notice.recipient.id,
  })
  const send = opened.data as { send_id?: string; tracking_id?: string } | null
  if (opened.error || !send?.send_id || !send.tracking_id) return back(tuitionSendBeginMessage(`${opened.error?.message ?? ''} ${opened.error?.details ?? ''}`))
  const sent = await sendManualTuitionZalo({
    studentCode: notice.studentCode,
    phone: notice.recipient.phone,
    templateId: TUITION_PROVIDER_TEMPLATE_ID,
    trackingId: send.tracking_id,
    eventCode: notice.eventCode,
    parameters: notice.parameters,
  })
  if (sent.state === 'AMBIGUOUS') return back('Tình trạng gửi: Chưa gửi. Zalo không trả kết quả rõ. Lần gửi được giữ để đối soát và không được gửi lại tự động.')
  const accepted = sent.state === 'ACCEPTED'
  const errorCode = accepted ? null
    : sent.state === 'BLOCKED' ? ZALO_PILOT_OUTBOUND_DISABLED
    : sent.state === 'PROVIDER_REJECTED' ? 'PROVIDER_REJECTED'
    : sent.state === 'ZALO_TOKEN_INVALID' ? 'ZALO_TOKEN_INVALID'
    : sent.state === 'ZALO_PROOF_INVALID' ? 'ZALO_PROOF_INVALID'
    : 'PROVIDER_NOT_CONFIGURED'
  const recorded = await db.rpc('finish_tuition_zalo_send', {
    p_send: send.send_id,
    p_outcome: sent.state === 'ACCEPTED' ? 'SENT' : 'ERROR',
    p_error: errorCode,
    p_receipt: sent.state === 'ACCEPTED' ? 'zbs-phone-accepted' : null,
    p_message_id: sent.state === 'ACCEPTED' ? sent.messageId : null,
  })
  console.info(JSON.stringify({ component: 'tuition_zalo_send', phase: 'result_persistence',
    sendId: send.send_id, trackingId: send.tracking_id,
    messageId: sent.state === 'ACCEPTED' ? sent.messageId : null,
    outcome: recorded.error ? 'SAVE_FAILED' : recorded.data, at: new Date().toISOString() }))
  if (recorded.error) return back(accepted ? 'Zalo đã tiếp nhận nhưng hệ thống chưa ghi được mã tin. Không gửi lại.' : 'Không ghi được kết quả gửi. Hãy tải lại. Chưa gọi Zalo thật.')
  if (accepted) return back('Tình trạng gửi: Đã gửi. Zalo đã tiếp nhận một tin. Chưa xác nhận tới máy và chưa có phản hồi.', 'success')
  const label = recorded.data === 'ERROR' ? 'Gửi thất bại' : 'Chưa gửi'
  const detail = sent.state === 'TEMPLATE_NOT_ENABLED'
    ? 'Mẫu 643118 chưa ở trạng thái có thể gửi.'
    : sent.state === 'BLOCKED'
      ? 'Gửi thật đang tắt hoặc nội dung không đủ điều kiện.'
      : sent.state === 'ZALO_TOKEN_INVALID' || sent.state === 'ZALO_PROOF_INVALID'
        ? 'Không xác thực được với Zalo.'
        : sent.state === 'PROVIDER_REJECTED'
          ? 'Zalo từ chối tin.'
          : 'Zalo chưa tiếp nhận tin.'
  return back(`Tình trạng gửi: ${label}. ${detail}`)
}
