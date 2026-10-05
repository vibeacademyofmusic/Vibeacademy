import { gradeProgressPercent } from '@/app/admin/students/[id]/academic-progress'
import { displayLabel } from '@/lib/display'

type Component = { id: string; name: string; status: string; is_required: boolean; progressStatus: string }
type Subject = Component & { completion_rule: string; components: Component[] }
export type Program = { program_id: string; curriculum: string; status: string; is_primary: boolean; current_level_id: string | null; levels: { id: string; name: string; status: string; subjects: Subject[] }[] }

export default function Journey({ programs }: { programs: Program[] }) {
  return <div className="space-y-5">{programs.map(program => <section key={program.program_id} className="space-y-3 rounded border p-4">
    <h3 className="text-lg font-semibold">{program.curriculum}{program.is_primary && ' — Chương trình chính'}</h3>
    <p>{displayLabel(program.status)}</p>
    {program.levels.map(level => {
      const percent = gradeProgressPercent(level.status, level.subjects)
      return <details key={level.id} open={level.status === 'IN_PROGRESS'} className="rounded border p-3">
        <summary className="cursor-pointer font-medium">{level.name} — {level.status === 'AVAILABLE' ? 'Sẵn sàng bắt đầu' : displayLabel(level.status)}{percent !== null && ` · ${percent}%`}</summary>
        {level.status !== 'COMPLETED' && percent === null && <p className="mt-2 text-sm">Chưa có tỷ lệ hoàn thành được xác nhận.</p>}
        <ul className="mt-3 space-y-3">{level.subjects.filter(s => s.status === 'ACTIVE').map(subject => <li key={subject.id}>
          <p>{subject.name} — {displayLabel(subject.progressStatus)}{!subject.is_required && ' (Tự chọn)'}</p>
          {subject.completion_rule !== 'DIRECT_ASSESSMENT' && <ul className="ml-4 text-sm">{subject.components.filter(c => c.status === 'ACTIVE').map(component => <li key={component.id}>{component.name} — {displayLabel(component.progressStatus)}{!component.is_required && ' (Tự chọn)'}</li>)}</ul>}
        </li>)}</ul>
      </details>
    })}
  </section>)}</div>
}
