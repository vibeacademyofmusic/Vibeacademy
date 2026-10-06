'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizeYouTubeLink, uuidPattern, type VideoLinkResult } from '@/lib/academic-video-links'

const invalid = { ok: false, message: 'Thông tin link video không hợp lệ. Vui lòng kiểm tra lại.' }

function failure(error: { code?: string; message?: string }): VideoLinkResult {
  if (error.code === '23505') return { ok: false, message: 'Video này đã có trong chương trình học. Hãy sửa link đã lưu.' }
  if (error.message === 'VIDEO_LINK_STALE') return { ok: false, message: 'Link đã được thay đổi hoặc gỡ. Hãy tải lại trang trước khi tiếp tục.' }
  if (error.message === 'VIDEO_LINK_LESSON_REQUIRED') return { ok: false, message: 'Mỗi video phải gắn với một Lesson. Hãy chọn trình độ và bài học.' }
  if (error.message === 'VIDEO_LINK_CONTEXT') return { ok: false, message: 'Bài học hoặc trình độ không thuộc lộ trình của học viên.' }
  if (error.code === '42501') return { ok: false, message: 'Bạn không có quyền thay đổi link video của học viên này.' }
  return { ok: false, message: 'Chưa lưu được thay đổi. Vui lòng thử lại.' }
}

function refresh(studentId: string) {
  revalidatePath(`/admin/students/${studentId}`)
  revalidatePath(`/operations/teacher/students/${studentId}`)
  revalidatePath('/my-learning')
}

export async function saveVideoLink(_state: VideoLinkResult, form: FormData): Promise<VideoLinkResult> {
  const db = await createClient()
  const auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) return { ok: false, message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }
  const student = String(form.get('student_id') ?? '')
  const enrollment = String(form.get('enrollment_id') ?? '')
  const id = String(form.get('id') ?? '')
  const level = String(form.get('level_id') ?? '')
  const item = String(form.get('item_id') ?? '')
  const title = String(form.get('title') ?? '').trim()
  const note = String(form.get('note') ?? '').trim()
  const url = normalizeYouTubeLink(String(form.get('url') ?? ''))
  const version = Number(form.get('version') ?? 0)
  if (!level || !item) return { ok: false, message: 'Mỗi video phải gắn với một Lesson. Hãy chọn trình độ và bài học.' }
  if (![student, enrollment].every(v => uuidPattern.test(v)) || [id, level, item].some(v => v && !uuidPattern.test(v))
    || !url || !title || title.length > 160 || note.length > 1000 || (item && !level)
    || !Number.isSafeInteger(version) || (id ? version < 1 : version !== 0)) return invalid

  const result = await db.rpc('save_academic_video_link', {
    p_student: student, p_enrollment: enrollment, p_id: id || null, p_version: version,
    p_title: title, p_url: url, p_note: note || null, p_level: level || null,
    p_item: item || null, p_shared: form.get('shared_with_family') === 'on',
  })
  if (result.error) return failure(result.error)
  refresh(student)
  return { ok: true, message: id ? 'Đã cập nhật link video.' : 'Đã thêm link video.' }
}

export async function removeVideoLink(_state: VideoLinkResult, form: FormData): Promise<VideoLinkResult> {
  const db = await createClient()
  const auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) return { ok: false, message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }
  const student = String(form.get('student_id') ?? '')
  const enrollment = String(form.get('enrollment_id') ?? '')
  const id = String(form.get('id') ?? '')
  const version = Number(form.get('version'))
  if (![student, enrollment, id].every(v => uuidPattern.test(v)) || !Number.isSafeInteger(version) || version < 1) return invalid
  const result = await db.rpc('remove_academic_video_link', {
    p_student: student, p_enrollment: enrollment, p_id: id, p_version: version,
  })
  if (result.error) return failure(result.error)
  refresh(student)
  return { ok: true, message: 'Đã gỡ link khỏi hồ sơ học tập.' }
}
