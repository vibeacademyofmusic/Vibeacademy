'use client'

import { useMemo, useState } from 'react'

type Course = { id: string; name: string; curriculum_id: string }
type Level = { id: string; name: string; sequence_no: number }

export default function ClassCreateLevelFields({
  courses,
  levelsByCurriculum,
}: {
  courses: Course[]
  levelsByCurriculum: Record<string, Level[]>
}) {
  const [courseId, setCourseId] = useState('')
  const levels = useMemo(() => {
    const course = courses.find(c => c.id === courseId)
    if (!course) return []
    return levelsByCurriculum[course.curriculum_id] ?? []
  }, [courseId, courses, levelsByCurriculum])

  return (
    <>
      <label className="vibe-field">
        <span>Khóa học</span>
        <select name="course_id" required value={courseId} onChange={e => setCourseId(e.target.value)}>
          <option value="">Chọn khóa học</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="vibe-field">
        <span>Từ trình độ</span>
        <select name="accepted_from_level_id" defaultValue="" disabled={!levels.length}>
          <option value="">— (chưa cấu hình)</option>
          {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <label className="vibe-field">
        <span>Đến trình độ</span>
        <select name="accepted_to_level_id" defaultValue="" disabled={!levels.length}>
          <option value="">— (chưa cấu hình)</option>
          {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
    </>
  )
}
