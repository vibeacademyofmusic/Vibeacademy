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
    { name: 'Cảnh báo chuyên cần', href: '/admin/attendance/retention' },
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
    { name: 'Chi phí vận hành', href: '/admin/finance/operating-expenses' },
    { name: 'Nhắc học phí', href: '/admin/tuition/reminders' },
  ] },
  { name: 'KHO & CỬA HÀNG', items: [{ name: 'Kho sách và vật tư', href: '/admin/inventory' }, { name: 'Nhạc cụ theo serial', href: '/admin/instruments' }] },
  { name: 'E-LEARNING & KIỂM TRA', items: [{ name: 'Nội dung học trực tuyến', href: '/admin/elearning' }] },
  { name: 'HR', items: [
    { name: 'Tổng quan HR', href: '/admin/hr' },
    { name: 'Nhân viên', href: '/admin/employees' },
    { name: 'Chấm công', href: '/admin/hr/attendance' },
    { name: 'Yêu cầu nghỉ phép', href: '/admin/employees/leave-requests' },
    { name: 'Chính sách nghỉ phép', href: '/admin/employees/leave-policies' },
    { name: 'Giáo viên', href: '/admin/teachers' },
    { name: 'Đối soát buổi dạy', href: '/admin/hr/teaching' },
    { name: 'Phân công buổi dạy', href: '/admin/session-teachers' },
    { name: 'Mẫu lương & cấu hình', href: '/admin/hr/templates' },
    { name: 'Kỳ lương', href: '/admin/payroll' },
    { name: 'Công tác phí', href: '/admin/hr/expenses' },
    { name: 'Phiếu lương & chi trả', href: '/admin/hr/payslips' },
  ] },
  { name: 'KINH DOANH', items: [
    { name: 'Điều hành kinh doanh', href: '/admin/business' },
    { name: 'CRM & Tuyển sinh', href: '/admin/business/registrations' },
    { name: 'Chiến dịch', href: '/admin/business/campaigns' },
    { name: 'Báo cáo kinh doanh', href: '/admin/business/reports' },
    { name: 'Khách hàng cũ', href: '/admin/business/reactivation' },
    { name: 'Khách mua đàn', href: '/admin/business/instrument-customers' },
  ] },
  { name: 'HỆ THỐNG', items: [{ name: 'Chi nhánh', href: '/admin/branches' }, { name: 'Thông báo', href: '/admin/notifications' }, { name: 'Tích hợp', href: '/admin/system/integrations' }, { name: 'Chuyển dữ liệu học viên', href: '/admin/migration' }] },
]
// Context-only pages (journals, academic record, pauses/makeup) require a selected student/session.
// The sole standalone report route lives under HỌC VIÊN; do not duplicate it or invent report routes.
export function isBusinessShellPath(pathname: string | null | undefined) {
  return pathname === '/admin/business' || Boolean(pathname?.startsWith('/admin/business/'))
}

export function isStudentOpsPath(pathname: string | null | undefined) {
  return pathname === '/admin/students'
}

export type ShellMode = 'full' | 'business' | 'students' | 'business-students'

export function navigationForShell(businessOnly: boolean) {
  return businessOnly ? navigationGroups.filter(group => group.name === 'KINH DOANH') : navigationGroups
}

export function navigationForAccess(mode: ShellMode) {
  if (mode === 'full') return navigationGroups
  const business = navigationGroups.filter(group => group.name === 'KINH DOANH')
  const students = navigationGroups
    .filter(group => group.name === 'HỌC VIÊN')
    .map(group => ({ ...group, items: group.items.filter(item => item.href === '/admin/students') }))
  if (mode === 'business') return business
  if (mode === 'students') return students
  return [...business, ...students]
}

export function activeNavigationHref(pathname: string) {
  if (pathname === '/admin/employees/attendance' || pathname.startsWith('/admin/employees/attendance/')) {
    return '/admin/hr/attendance'
  }
  return navigationGroups.flatMap(group => group.items)
    .filter(item => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
}
