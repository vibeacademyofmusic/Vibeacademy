'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern, validDate } from '../../finance/operations'
import { summaryFields, types } from './data'
const path = '/admin/reports/learning'
export async function generateReport(form: FormData) {
  const db = await adminClient()
  const enrollment = String(form.get('enrollment_id') ?? ''), type = String(form.get('type') ?? '')
  const start = String(form.get('start') ?? ''), end = String(form.get('end') ?? '')
  let id = '', error = ''
  if (!uuidPattern.test(enrollment) || !types.some(t => t.id === type) || !validDate(start) || !validDate(end) || end < start) error = 'Vui lòng kiểm tra ghi danh và kỳ báo cáo.'
  else {
    try {
      const result = await db.rpc('generate_learning_report', { p_enrollment_id: enrollment, p_type: type, p_start: start, p_end: end })
      if (result.error || typeof result.data !== 'string' || !uuidPattern.test(result.data)) error = 'Không tạo được báo cáo. Kỳ báo cáo phải đã kết thúc và trùng thời gian ghi danh; báo cáo tháng cần đủ tháng.'
      else id = result.data
    } catch { error = 'Chưa xác nhận được kết quả. Hãy tải lại danh sách trước khi thử lại.' }
  }
  revalidatePath(path)
  redirect(error ? path + '?' + new URLSearchParams({ error }) : path + '/' + id)
}
export async function updateReport(form: FormData) {
  const db = await adminClient()
  const id = String(form.get('id') ?? ''), version = Number(form.get('version')), action = String(form.get('action') ?? '')
  let error = ''
  const summary = Object.fromEntries(summaryFields.map(f => [f.id, String(form.get(f.id) ?? '').trim()]))
  const note = String(form.get('admin_note') ?? '').trim()
  if (!uuidPattern.test(id) || !Number.isSafeInteger(version) || version < 1 || !['SAVE', 'REGENERATE', 'READY', 'APPROVE', 'RETURN', 'CANCEL'].includes(action) || Object.values(summary).some(v => v.length > 4000) || note.length > 4000 || (['APPROVE', 'CANCEL'].includes(action) && form.get('confirm') !== 'yes')) error = 'Vui lòng kiểm tra nội dung và xác nhận thao tác.'
  else {
    try {
      const result = await db.rpc('update_learning_report', { p_id: id, p_version: version, p_action: action, p_summary: summary, p_note: note })
      if (result.error) error = 'Không thể cập nhật. Báo cáo có thể đã thay đổi hoặc đã khóa; hãy tải lại.'
    } catch { error = 'Chưa xác nhận được kết quả. Hãy tải lại trước khi thử lại.' }
  }
  revalidatePath(path)
  if (uuidPattern.test(id)) revalidatePath(path + '/' + id)
  redirect((uuidPattern.test(id) ? path + '/' + id : path) + '?' + new URLSearchParams(error ? { error } : { success: 'Đã cập nhật báo cáo.' }))
}
