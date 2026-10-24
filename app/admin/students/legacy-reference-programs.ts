import type { createClient } from '@/lib/supabase/server'

// This batch contains the owner-provided Cần Thơ opening list. Its fee dates
// are not academic start dates, so these rows must never become enrollments.
export const CAN_THO_OPENING_BATCH_ID = 'b52d8476-7446-5130-abf8-04f0a67c992c'

type ReferenceRow = {
  target_student_id: string | null
  source_excel_row: number
  curriculum_id: string | null
  level_id: string | null
  program_state: string
  normalized_payload: unknown
}

export type ReferenceProgram = {
  name: string
  grade: string | null
  mapped: boolean
  sourceRow: number
}

const programNames: Record<string, string> = {
  PIANO: 'Piano',
  GUITAR: 'Guitar',
  VIOLIN: 'Violin',
  DRUM: 'Trống',
  DRUMS: 'Trống',
  VOCAL: 'Thanh nhạc',
  HARP: 'Harp',
  ELECTRIC: 'Electric',
}

function sourceText(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 80) : ''
}

export function groupReferencePrograms(rows: ReferenceRow[]) {
  const grouped = new Map<string, ReferenceProgram[]>()
  for (const row of [...rows].sort((a, b) => a.source_excel_row - b.source_excel_row)) {
    if (!row.target_student_id) continue
    const payload = row.normalized_payload && typeof row.normalized_payload === 'object'
      ? row.normalized_payload as Record<string, unknown>
      : {}
    const code = sourceText(payload.source_program).toUpperCase()
    if (!code) continue
    const grade = sourceText(payload.original_grade) || null
    const program = {
      name: programNames[code] ?? code,
      grade,
      mapped: row.program_state === 'MAPPED_AWAITING_ACADEMIC_START'
        && Boolean(row.curriculum_id && row.level_id),
      sourceRow: row.source_excel_row,
    }
    const list = grouped.get(row.target_student_id) ?? []
    if (!list.some(item => item.name === program.name && item.grade === program.grade)) {
      list.push(program)
      grouped.set(row.target_student_id, list)
    }
  }
  return grouped
}

export async function loadReferencePrograms(
  db: Awaited<ReturnType<typeof createClient>>,
  studentIds: string[],
) {
  if (!studentIds.length) return new Map<string, ReferenceProgram[]>()
  const { data, error } = await db.from('legacy_student_opening_rows')
    .select('target_student_id, source_excel_row, curriculum_id, level_id, program_state, normalized_payload')
    .eq('import_batch_id', CAN_THO_OPENING_BATCH_ID)
    .eq('disposition', 'IMPORT')
    .in('target_student_id', studentIds)
    .order('source_excel_row')
  if (error) throw error
  return groupReferencePrograms((data ?? []) as ReferenceRow[])
}
