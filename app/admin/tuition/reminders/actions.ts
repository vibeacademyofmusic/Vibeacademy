'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern } from '../../finance/operations'
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
