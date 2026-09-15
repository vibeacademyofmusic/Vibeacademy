export const columns = ['legacy_reference', 'student_code', 'full_name', 'class_code', 'curriculum_code', 'level_code', 'started_at', 'tuition_plan_code', 'tuition_starts_on', 'student_status', 'tuition_status', 'currency', 'discount_type', 'discount_value', 'discount_name', 'final_amount', 'opening_paid_amount', 'opening_outstanding', 'base_ends_on', 'effective_ends_on', 'pause_starts_on', 'pause_ends_on'] as const

// All source values stay strings: money must not round through JavaScript Number.
export function parseLegacyCsv(input: string): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, '')
  if (!text || text.length > 500000 || text.includes('\0')) throw new Error('Tệp CSV trống, quá lớn hoặc không hợp lệ.')
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false, closed = false
  const field = () => { row.push(cell); cell = ''; closed = false }
  const line = () => { field(); if (row.some(value => value !== '')) rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else { quoted = false; closed = true }
      } else cell += c
    } else if (c === ',' || c === '\n' || c === '\r') {
      if (c === ',') field()
      else { line(); if (c === '\r' && text[i + 1] === '\n') i++ }
    } else if (c === '"' && !cell && !closed) quoted = true
    else if (closed || c === '"') throw new Error('Dấu ngoặc kép trong CSV không hợp lệ.')
    else cell += c
    if (rows.length > 501 || cell.length > 10000) throw new Error('Tệp vượt giới hạn 500 học viên hoặc ô dữ liệu quá dài.')
  }
  if (quoted) throw new Error('CSV thiếu dấu đóng ngoặc kép.')
  if (cell || row.length || closed) line()
  const headers = rows.shift()?.map(value => value.trim()) ?? []
  if (new Set(headers).size !== headers.length || columns.some(column => !headers.includes(column)) || headers.some(column => !columns.includes(column as typeof columns[number]))) throw new Error('Cột CSV phải khớp mẫu V1; không bỏ hoặc thêm cột.')
  if (!rows.length || rows.length > 500) throw new Error('Mỗi tệp cần từ 1 đến 500 học viên.')
  const references = new Set<string>()
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Dòng ${index + 2} không đúng số cột.`)
    const result = Object.fromEntries(headers.map((key, i) => [key, values[i]]))
    const reference = result.legacy_reference.trim()
    if (!reference || references.has(reference)) throw new Error(`Dòng ${index + 2} thiếu hoặc trùng mã nguồn.`)
    references.add(reference)
    return result
  })
}

export const fieldLabels: Record<typeof columns[number], string> = {
  legacy_reference: 'Mã nguồn', student_code: 'Mã học viên', full_name: 'Họ tên', class_code: 'Mã lớp',
  curriculum_code: 'Mã chương trình', level_code: 'Mã cấp độ', started_at: 'Ngày bắt đầu học',
  tuition_plan_code: 'Mã gói học phí', tuition_starts_on: 'Ngày bắt đầu kỳ học phí', student_status: 'Trạng thái học viên',
  tuition_status: 'Trạng thái học phí', currency: 'Tiền tệ', discount_type: 'Loại giảm giá', discount_value: 'Giá trị giảm giá',
  discount_name: 'Tên giảm giá / căn cứ', final_amount: 'Học phí sau giảm', opening_paid_amount: 'Đã thanh toán trước chuyển đổi',
  opening_outstanding: 'Công nợ đầu kỳ',
  base_ends_on: 'Ngày kết thúc cơ bản (đối chiếu)', effective_ends_on: 'Ngày kết thúc hiệu lực đã xác minh',
  pause_starts_on: 'Ngày bắt đầu bảo lưu hiện tại', pause_ends_on: 'Ngày kết thúc bảo lưu hiện tại',
}
export const statusLabels: Record<string, string> = { NEEDS_REVIEW: 'Cần kiểm tra', VALIDATED: 'Hợp lệ — chờ duyệt', READY: 'Sẵn sàng nhập', IMPORTED: 'Đã nhập', REJECTED: 'Đã từ chối', ROLLED_BACK: 'Đã đảo nhập dữ liệu' }
