import plan from './piano-technique-2025-2026.json'
export type TechniqueLesson = {
  grade: number; code: string; name: string; kind: string; sortOrder: number; official: boolean;
  source: string; page: number; pdfPage: number; key?: string; formText?: string; handText?: string;
  octaves?: number; articulation?: string; inversion?: string; resolve?: boolean; start?: string; choice?: string; technique?: string;
}
export const techniqueGrades = plan as { grade: number; page: number; lessons: TechniqueLesson[] }[]
const lessons = new Map(techniqueGrades.flatMap(g => g.lessons.map(l => [l.code, l] as const)))
export const techniqueLesson = (code?: string | null) => code ? lessons.get(code) : undefined
export const techniqueGeneralRules = 'Thuộc lòng; lên và xuống đủ phạm vi; các nốt đều nhau; không dùng pedal. HT thường cách một quãng tám, trừ chỉ định riêng. Có thể chọn quãng xuất phát phù hợp nếu vẫn đủ phạm vi. Dùng cách bấm ngón tạo kết quả âm nhạc tốt. Tốc độ trang 14 là hướng dẫn, không phải ngưỡng đậu.'
export function techniquePractice(lesson: TechniqueLesson) {
  const motor = lesson.kind === 'arpeggio' || lesson.kind === 'dominant' || lesson.kind === 'diminished'
  return {
    objective: lesson.official ? `Thực hiện ${lesson.technique?.toLowerCase()} đúng giọng/nốt, tay, phạm vi và cách chơi đã ghi; tự trình bày từ trí nhớ.` : 'Hiểu quy định và tự xác định nội dung cần luyện; không tạo điều kiện thi hay điểm đậu mới.',
    practice: motor ? 'Nhận diện các âm hợp âm và thể hợp âm; tập từng vị trí bàn tay, nối chuyển ngón chậm rồi mở rộng đủ phạm vi. Giữ tiếng đều, tránh căng cổ tay.' : 'Đọc tên nốt và xác định dấu hóa; tập chậm điểm chuyển ngón và đổi hướng. Tăng dần độ liền mạch khi giữ được nhịp đều, tư thế thoải mái.',
    errors: lesson.kind.includes('apart') || lesson.kind.includes('thirds') || lesson.kind.includes('sixths') ? 'Nhầm khoảng cách giữa hai tay với hai nốt đồng thời trong một tay; chọn sai nốt trên/dưới; mất độ đều khi chuyển ngón.' : 'Sai dấu hóa hoặc dạng thứ; sai nốt bắt đầu, số quãng tám, tay hoặc articulation; dừng ở điểm chuyển ngón; dùng pedal để che tiếng không đều.',
    checklist: ['Đúng giọng/nốt xuất phát và dấu hóa', 'Đúng dạng thứ / thể hợp âm và quyền lựa chọn', 'Đúng tay và vị trí hai tay', 'Đủ quãng tám, cả chiều lên và xuống', 'Đúng legato/staccato; thuộc lòng và đều nốt', ...(lesson.resolve ? ['Kết thúc giải về chủ âm'] : []), 'Ghi nhận xét và nội dung cần luyện tiếp cho đúng mã lesson'],
  }
}
