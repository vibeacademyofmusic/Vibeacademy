const LESSON_CODE = /^[A-Z0-9_-]{2,50}$/

export function normalizeLessonCode(value: string) {
  return value.trim().toUpperCase()
}

export function lessonCodeValid(code: string) {
  return LESSON_CODE.test(code)
}

export function nextLessonCode(codes: string[]) {
  const numbers = codes
    .map(code => /^L(\d+)$/.exec(code)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1
  return `L${String(next).padStart(2, '0')}`
}

export function lessonWriteError(error: { message?: string; code?: string } | null) {
  const message = error?.message ?? ''
  if (error?.code === '23505' || message.includes('Lesson code already exists')) return 'Mã Lesson đã tồn tại trong nhóm này.'
  if (message.includes('Invalid lesson code')) return 'Mã Lesson chỉ gồm chữ, số, dấu gạch dưới hoặc gạch ngang, từ 2 đến 50 ký tự.'
  if (message.includes('Lesson name is required')) return 'Tên Lesson là bắt buộc.'
  if (message.includes('Invalid sort order')) return 'Thứ tự Lesson không hợp lệ.'
  if (message.includes('Invalid lesson status')) return 'Trạng thái Lesson không hợp lệ.'
  if (message.includes('Invalid academic structure')) return 'Lesson không thuộc đúng môn và nhóm đánh giá.'
  if (message.includes('Lesson not found')) return 'Không tìm thấy Lesson.'
  if (message.includes('Unauthorized')) return 'Bạn không có quyền quản lý Lesson.'
  if (message.includes('Nhóm đánh giá hoàn thành')) return 'Nhóm đánh giá hoàn thành từ Lesson bắt buộc cần ít nhất một Lesson bắt buộc đang hoạt động.'
  if (message.includes('Invalid lesson order')) return 'Không thể đổi thứ tự Lesson.'
  return 'Không thể lưu Lesson.'
}

export function missingLessonParentMessage(completionRule: string) {
  if (completionRule === 'ALL_REQUIRED_COMPONENTS') return 'Bạn cần tạo Nhóm đánh giá trước khi thêm Lesson.'
  return 'Chưa có cấu trúc nội bộ để lưu Lesson. Hãy tạo Component trong Cấu trúc nội bộ trước.'
}
