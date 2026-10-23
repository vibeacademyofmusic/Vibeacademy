'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { operationalAdminOn } from '@/lib/auth/request'
import { createClient } from '@/lib/supabase/server'
import { windowProblems, type TimeWindow } from '@/lib/teaching-shifts/independent'
import { coordinationReturn, withCoordinationState } from './rules'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^\d{2}:\d{2}$/

async function client() {
  const db = await createClient()
  const { data, error } = await db.auth.getClaims()
  if (error || !data?.claims) redirect('/login')
  return db
}

function back(path: string, error?: string): never {
  revalidatePath('/admin/students')
  revalidatePath('/admin/classes')
  revalidatePath('/admin/attendance')
  redirect(error ? withCoordinationState(path, { error, success: undefined }) : path)
}

export async function savePlacementAvailability(formData: FormData) {
  const db = await client()
  const placement = String(formData.get('placement_id') ?? '')
  const path = coordinationReturn(String(formData.get('return_to') ?? ''))
    || `/admin/students?tab=coordination&view=queue&place=${placement}`
  const windows = readWindows(formData)
  const mode = String(formData.get('availability_mode') ?? '')
  const problems = windowProblems(windows)
  if (mode === 'HARD' && !windows.length) back(path, 'Ràng buộc cứng cần ít nhất một dòng thứ và giờ.')
  if (problems.incomplete || problems.invalid) back(path, 'Mỗi dòng cần giờ kết thúc sau giờ bắt đầu.')
  if (problems.overlap) back(path, 'Các khung giờ cùng một ngày đang chồng nhau.')
  if (windows.length > 14) back(path, 'Chỉ lưu tối đa 14 khung giờ.')
  const requiredRaw = String(formData.get('required_weekly_sessions') ?? '').trim()
  const required = requiredRaw === '' ? null : Number(requiredRaw)
  if (required !== null && (!Number.isInteger(required) || required < 1 || required > 7)) {
    back(path, 'Số buổi/tuần yêu cầu phải từ 1 đến 7, hoặc để trống khi hồ sơ không quy định.')
  }
  const { error } = await db.rpc('set_placement_time_windows', {
    p_placement: placement,
    p_days: windows.map(window => window.day),
    p_starts: windows.map(window => window.start),
    p_ends: windows.map(window => window.end),
    p_mode: mode === 'HARD' || mode === 'PREFERENCE' ? mode : null,
    p_note: String(formData.get('availability_note') ?? ''),
    p_required: required,
  })
  if (error) {
    const reference = crypto.randomUUID().slice(0, 8)
    console.error('save placement availability', reference, error.message)
    back(path, error.message.includes('PLACEMENT_')
      ? 'Khung giờ chưa hợp lệ. Giờ kết thúc phải sau giờ bắt đầu và các dòng cùng ngày không được chồng nhau.'
      : `Không lưu được khung giờ. Mã đối chiếu ${reference}.`)
  }
  back(withCoordinationState(path, { success: 'Đã lưu từng khung giờ. Mở lại sẽ giữ đúng thứ và giờ của từng buổi.' }))
}

function readWindows(formData: FormData): TimeWindow[] {
  const days = formData.getAll('window_day')
  const starts = formData.getAll('window_start')
  const ends = formData.getAll('window_end')
  return days.flatMap((day, index) => {
    const value = Number(day)
    if (!Number.isInteger(value) || value < 1 || value > 7) return []
    return [{ day: value, start: String(starts[index] ?? '').trim(), end: String(ends[index] ?? '').trim() }]
  })
}

export async function changeRecurringSchedule(formData: FormData) {
  const db = await client()
  const { data: allowed, error: roleError } = await operationalAdminOn(db)
  const scheduleId = String(formData.get('schedule_id') ?? '')
  const path = coordinationReturn(String(formData.get('return_to') ?? ''))
    || '/admin/students?tab=coordination&view=week'
  if (roleError || allowed !== true) back(path, 'Bạn không có quyền đổi lịch định kỳ.')
  const from = String(formData.get('effective_from') ?? '')
  const day = Number(formData.get('day_of_week') ?? 0)
  const start = String(formData.get('start_time') ?? '')
  const end = String(formData.get('end_time') ?? '')
  const roomId = String(formData.get('room_id') ?? '')
  if (!uuidPattern.test(scheduleId) || !datePattern.test(from) || day < 1 || day > 7 || !timePattern.test(start) || !timePattern.test(end) || end <= start || !uuidPattern.test(roomId)) {
    back(path, 'Cần ngày hiệu lực, thứ, giờ và phòng cho lịch định kỳ mới.')
  }
  const { error } = await db.rpc('split_recurring_schedule', {
    p_schedule: scheduleId,
    p_from: from,
    p_day: day,
    p_start: start,
    p_end: end,
    p_room: roomId,
  })
  if (error) {
    const reference = crypto.randomUUID().slice(0, 8)
    console.error('split recurring schedule', reference, error.message)
    const known = error.message.includes('PLACEMENT_HISTORY_LOCKED')
      ? 'Đã có điểm danh từ ngày này. Chọn ngày sau buổi đã điểm danh để giữ nguyên lịch sử.'
      : error.message.includes('PLACEMENT_UNAUTHORIZED')
        ? 'Bạn không có quyền đổi lịch định kỳ.'
        : error.message.includes('PLACEMENT_ROOM_CONFLICT')
          ? 'Phòng phải đang hoạt động và cùng chi nhánh với ca dạy.'
          : null
    back(path, known || `Không đổi được lịch định kỳ. Mã đối chiếu ${reference}.`)
  }
  back(withCoordinationState(path, { success: 'Đã đổi lịch định kỳ từ ngày đã chọn. Buổi đã điểm danh không bị sửa.', recur: undefined }))
}
