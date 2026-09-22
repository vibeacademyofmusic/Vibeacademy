// UI suggestions only: generate_learning_report remains the authority.
export function monthlyPeriod(startedAt: string, latestEnd?: string) {
  const anchor = new Date((latestEnd ?? startedAt) + 'T00:00:00Z')
  const year = anchor.getUTCFullYear(), month = anchor.getUTCMonth()
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  if (latestEnd) return {
    start: iso(new Date(Date.UTC(year, month + 1, 1))),
    end: iso(new Date(Date.UTC(year, month + 2, 0))),
    first: false,
  }
  return {
    start: startedAt,
    end: iso(new Date(Date.UTC(year, month + (anchor.getUTCDate() === 1 ? 1 : 2), 0))),
    first: true,
  }
}
export const generationErrors: Record<string, string> = {
  'Invalid closed report period': 'Kỳ báo cáo không hợp lệ hoặc chưa kết thúc. Ngày kết thúc phải trước hôm nay theo giờ Việt Nam.',
  'Enrollment does not overlap period': 'Kỳ báo cáo không thuộc thời gian ghi danh hoặc ghi danh chưa có ngày bắt đầu.',
  'First monthly report must cover the enrollment start calendar month': 'Học viên bắt đầu ngày 1: báo cáo tháng đầu tiên phải bao phủ trọn tháng bắt đầu khóa.',
  'First monthly report must start on the enrollment start date and end on the last day of the following month': 'Báo cáo tháng đầu tiên phải bắt đầu từ ngày học viên bắt đầu khóa và kết thúc vào ngày cuối tháng kế tiếp.',
  'Monthly report must cover a full calendar month': 'Các báo cáo tháng tiếp theo phải bao phủ trọn một tháng dương lịch.',
  'Monthly report must stay within enrollment dates; use END_OF_COURSE for a shortened final period': 'Báo cáo tháng phải nằm trong thời gian ghi danh. Nếu khóa kết thúc trước cuối kỳ, hãy dùng Tổng kết cuối khóa.',
  'Monthly report overlaps an existing report': 'Kỳ báo cáo tháng bị trùng với báo cáo đã có, kể cả báo cáo đã hủy. Hãy mở báo cáo cũ hoặc chọn kỳ tiếp theo.',
}
