import { PianoTechniqueDetails } from '@/app/admin/academic/piano-technique-details'
import VideoLinks from '@/app/_components/academic-video-links/VideoLinks'
import type { VideoLinkContext } from '@/lib/academic-video-links'
import { gradeProgressPercent } from '@/app/admin/students/[id]/academic-progress'
import { displayLabel } from '@/lib/display'

type TechniqueItem = { id: string; code: string; name: string; status: string; teacher_notes?: string; next_practice?: string }
type Component = { items?: TechniqueItem[]; id: string; name: string; status: string; is_required: boolean; progressStatus: string }
type Subject = Component & { completion_rule: string; components: Component[] }
export type Program = { program_id: string; curriculum: string; status: string; is_primary: boolean; current_level_id: string | null; levels: { id: string; name: string; status: string; subjects: Subject[] }[] }

export default function Journey({ programs, studentId, videos = {} }: { programs: Program[]; studentId?: string; videos?: Record<string, VideoLinkContext> }) {
  return <div className="space-y-5">{programs.map(program => <section key={program.program_id} className="space-y-3 rounded border p-4">
    <h3 className="text-lg font-semibold">{program.curriculum}{program.is_primary && ' — Chương trình chính'}</h3>
    <p>{displayLabel(program.status)}</p>
    {studentId && videos[program.program_id] && <VideoLinks studentId={studentId} enrollmentId={program.program_id} context={videos[program.program_id]}/>}
    {program.levels.map(level => {
      const percent = gradeProgressPercent(level.status, level.subjects)
      return <details key={level.id} open={level.status === 'IN_PROGRESS'} className="rounded border p-3">
        <summary className="cursor-pointer font-medium">{level.name} — {level.status === 'AVAILABLE' ? 'Sẵn sàng bắt đầu' : displayLabel(level.status)}{percent !== null && ` · ${percent}%`}</summary>
        {level.status !== 'COMPLETED' && percent === null && <p className="mt-2 text-sm">Chưa có tỷ lệ hoàn thành được xác nhận.</p>}
        <ul className="mt-3 space-y-3">{level.subjects.filter(s => s.status === 'ACTIVE').map(subject => <li key={subject.id}>
          <p>{subject.name} — {displayLabel(subject.progressStatus)}{!subject.is_required && ' (Tự chọn)'}</p>
          {subject.completion_rule !== 'DIRECT_ASSESSMENT' && <ul className="ml-4 text-sm">{subject.components.filter(c => c.status === 'ACTIVE').map(component => <li key={component.id}>{component.name} — {displayLabel(component.progressStatus)}{!component.is_required && ' (Tự chọn)'}
            {component.items?.length ? <ul className="mt-3 space-y-3">{component.items.map(lesson => <li key={lesson.id} className="vibe-card">
              <p className="font-medium">{lesson.name} — {displayLabel(lesson.status)}</p>
              {lesson.teacher_notes && <p className="mt-2 whitespace-pre-wrap">Nhận xét: {lesson.teacher_notes}</p>}
              {lesson.next_practice && <p className="mt-2 whitespace-pre-wrap">Cần luyện tiếp: {lesson.next_practice}</p>}
              <details className="mt-2"><summary className="cursor-pointer">Yêu cầu và hướng dẫn kỹ thuật</summary><PianoTechniqueDetails code={lesson.code}/></details>
            </li>)}</ul> : null}
          </li>)}</ul>}
        </li>)}</ul>
      </details>
    })}
  </section>)}</div>
}
