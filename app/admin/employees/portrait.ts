import type { SupabaseClient } from '@supabase/supabase-js'
import { type PortraitInspection } from '@/lib/staff/profile'

const messages: Record<string, string> = {
  STAFF_PROFILE_UNAUTHORIZED: 'Không có quyền cập nhật hồ sơ nhân sự.',
  STAFF_ASSIGNMENT_REASON_REQUIRED: 'Cần nhập lý do / căn cứ.',
  STAFF_TEACHING_CAPACITY_UNKNOWN: 'Năng lực giảng dạy chỉ gồm Giáo viên hoặc Trợ giảng.',
  STAFF_ASSIGNMENT_DATE_INVALID: 'Ngày hiệu lực không hợp lệ.',
  STAFF_EMPLOYEE_NOT_FOUND: 'Không tìm thấy hồ sơ nhân sự.',
  STAFF_SUBJECT_NOT_ACTIVE: 'Môn học không còn trong danh mục đang dùng.',
  STAFF_TEACHING_OVERLAP: 'Năng lực này đang có hiệu lực. Hãy kết thúc trước khi ghi đè.',
  STAFF_POSITION_UNKNOWN: 'Vị trí chỉ gồm VAS, VAM hoặc VAH.',
  STAFF_POSITION_OVERLAP: 'Vị trí này đang có hiệu lực. Hãy kết thúc trước khi ghi nhận lại.',
  STAFF_ASSIGNMENT_NOT_FOUND: 'Không tìm thấy phân công để kết thúc.',
  STAFF_PORTRAIT_INVALID: 'Ảnh chân dung không đạt điều kiện lưu.',
  STAFF_PORTRAIT_MISSING: 'Hồ sơ chưa có ảnh chân dung để gỡ.',
}

export function staffError(message: string) {
  return messages[message] || 'Không lưu được thay đổi hồ sơ nhân sự.'
}

export async function commitPortrait(
  db: SupabaseClient,
  employeeId: string,
  bytes: Uint8Array,
  inspected: Extract<PortraitInspection, { ok: true }>,
) {
  const path = `${employeeId}/${crypto.randomUUID()}.${inspected.ext}`
  const uploaded = await db.storage.from('staff-portraits').upload(path, bytes, {
    contentType: inspected.mime,
    upsert: false,
  })
  if (uploaded.error) {
    return { error: 'Không lưu được ảnh chân dung. Hồ sơ không được ghi là đã có ảnh.', previousPath: null as string | null, warning: null as string | null }
  }
  const recorded = await db.rpc('record_staff_portrait', {
    p_employee: employeeId,
    p_path: path,
    p_type: inspected.mime,
    p_bytes: bytes.byteLength,
    p_width: inspected.width,
    p_height: inspected.height,
  })
  if (recorded.error) {
    await db.storage.from('staff-portraits').remove([path])
    return { error: staffError(recorded.error.message), previousPath: null, warning: null }
  }
  const previousPath = typeof recorded.data === 'string' ? recorded.data : null
  if (previousPath) {
    const removed = await db.storage.from('staff-portraits').remove([previousPath])
    if (removed.error) {
      return { error: null, previousPath, warning: 'Ảnh mới đã lưu. Ảnh cũ chưa xóa được khỏi kho.' }
    }
  }
  return { error: null, previousPath, warning: null as string | null }
}

export async function deletePortraitObject(db: SupabaseClient, path: string) {
  const removed = await db.storage.from('staff-portraits').remove([path])
  return !removed.error
}
