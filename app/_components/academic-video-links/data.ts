import { createClient } from '@/lib/supabase/server'
import type { VideoLinkContext } from '@/lib/academic-video-links'

export async function loadVideoLinks(studentId: string, enrollmentId: string): Promise<VideoLinkContext> {
  const db = await createClient()
  const result = await db.rpc('academic_video_link_context', {
    p_student: studentId,
    p_enrollment: enrollmentId,
  })
  if (result.error || !result.data) throw new Error('Không thể tải link video học tập. Vui lòng thử lại.')
  return result.data as VideoLinkContext
}
