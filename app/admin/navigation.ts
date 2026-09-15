export const navigationGroups = [
  { name: 'TỔNG QUAN', items: [{ name: 'Bảng điều khiển', href: '/admin' }] },
  { name: 'ĐÀO TẠO', items: [
    { name: 'Chương trình học', href: '/admin/academic' },
    { name: 'Khóa học', href: '/admin/courses' },
  ] },
  { name: 'VẬN HÀNH', items: [
    { name: 'Lớp học', href: '/admin/classes' },
    { name: 'Phòng học', href: '/admin/rooms' },
    { name: 'Lịch học', href: '/admin/schedule' },
    { name: 'Điểm danh', href: '/admin/attendance' },
    { name: 'Phân công giáo viên theo buổi', href: '/admin/session-teachers' },
  ] },
  { name: 'HỌC VIÊN', items: [
    { name: 'Học viên', href: '/admin/students' },
    { name: 'Báo cáo học tập', href: '/admin/reports/learning' },
    { name: 'Phản hồi buổi học', href: '/admin/feedback' },
  ] },
  { name: 'TÀI CHÍNH', items: [
    { name: 'Tổng quan tài chính', href: '/admin/finance' },
    { name: 'Học phí', href: '/admin/tuition' },
    { name: 'Hóa đơn', href: '/admin/finance/invoices' },
    { name: 'Thanh toán', href: '/admin/finance/payments' },
    { name: 'Công nợ', href: '/admin/finance/receivables' },
    { name: 'Hoàn tiền', href: '/admin/finance/refunds' },
    { name: 'Số dư khách hàng', href: '/admin/finance/credits' },
    { name: 'Nhắc học phí', href: '/admin/tuition/reminders' },
  ] },
  { name: 'NHÂN SỰ', items: [
    { name: 'Nhân viên', href: '/admin/employees' },
    { name: 'Giáo viên', href: '/admin/teachers' },
    { name: 'Bảng lương', href: '/admin/payroll' },
  ] },
  { name: 'HỆ THỐNG', items: [{ name: 'Chi nhánh', href: '/admin/branches' }, { name: 'Chuyển dữ liệu học viên', href: '/admin/migration' }] },
]
// Context-only pages (journals, academic record, pauses/makeup) require a selected student/session.
// The sole standalone report route lives under HỌC VIÊN; do not duplicate it or invent report routes.
export function activeNavigationHref(pathname: string) {
  return navigationGroups.flatMap(group => group.items)
    .filter(item => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
}
