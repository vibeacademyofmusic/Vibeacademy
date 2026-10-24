import { StatusBadge } from '@/app/admin/_components/vibe'
import { createClient } from '@/lib/supabase/server'
import { loadReferencePrograms, type ReferenceProgram } from '../legacy-reference-programs'

export default async function LegacyReferencePrograms({ studentId }: { studentId: string }) {
  const db = await createClient()
  let programs: ReferenceProgram[] = []
  let loadingError = false
  try {
    programs = (await loadReferencePrograms(db, [studentId])).get(studentId) ?? []
  } catch (error) {
    console.error('Cần Thơ reference programs could not be loaded', error)
    loadingError = true
  }

  if (!programs.length && !loadingError) return null
  return (
    <section className="vibe-card mt-5" aria-label="Chương trình tham chiếu Cần Thơ">
      <p className="vibe-eyebrow">Danh sách nguồn Cần Thơ</p>
      <h2 className="text-lg font-semibold">Chương trình tham chiếu</h2>
      {loadingError ? (
        <p className="text-sm text-[var(--vibe-red)]">Không tải được chương trình tham chiếu. Vui lòng thử lại.</p>
      ) : (
        <>
          <p className="text-sm text-[var(--vibe-muted)]">Dữ liệu theo bảng học viên đã gửi; chưa xác nhận ngày bắt đầu học và chưa kích hoạt lộ trình học tập.</p>
          <ul className="space-y-2">
            {programs.map(program => (
              <li key={`${program.name}-${program.grade ?? ''}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--vibe-line)] bg-[var(--vibe-surface-soft)] px-3 py-2">
                <span className="font-semibold text-[var(--vibe-navy)]">{program.name}</span>
                {program.grade && <span className="text-sm text-[var(--vibe-muted)]">Trình độ nguồn: {program.grade}</span>}
                <StatusBadge tone={program.mapped ? 'info' : 'warning'}>{program.mapped ? 'Đã ánh xạ tham chiếu' : 'Chưa ánh xạ'}</StatusBadge>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
