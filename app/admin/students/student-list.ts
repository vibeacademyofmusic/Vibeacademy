/** Group by stable profile ID, preserving every distinct teaching-shift enrollment. */
export function groupStudentRows<T extends { student_id: string; enrollment_id: string }>(rows: T[]) {
  const groups = new Map<string, { student_id: string; rows: T[] }>()
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.enrollment_id)) continue
    seen.add(row.enrollment_id)
    const group = groups.get(row.student_id) ?? { student_id: row.student_id, rows: [] }
    group.rows.push(row)
    groups.set(row.student_id, group)
  }
  return [...groups.values()]
}

/** Read all authorized filtered rows before grouping/paging students, including API-size boundaries. */
export async function loadStudentRows<T>(fetchPage: (offset: number, limit: number) => Promise<T[]>) {
  const rows: T[] = []
  const size = 500
  for (let offset = 0; ; offset += size) {
    const page = await fetchPage(offset, size)
    rows.push(...page)
    if (page.length < size) return rows
  }
}
