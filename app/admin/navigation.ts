export const trainingTabs = [
  { name: 'Học viên', href: '/admin/students' },
  { name: 'Chương trình học', href: '/admin/academic' },
  { name: 'Khóa học', href: '/admin/courses' },
  { name: 'Lớp học', href: '/admin/classes' },
  { name: 'Lịch học', href: '/admin/schedule' },
  { name: 'Điểm danh', href: '/admin/attendance' },
  { name: 'Cảnh báo chuyên cần', href: '/admin/attendance/retention' },
  { name: 'Báo cáo học tập', href: '/admin/reports/learning' },
  { name: 'Phản hồi buổi học', href: '/admin/feedback' },
]

export const studentTabs = [
  { name: 'Học viên', href: '/admin/students' },
  { name: 'Phòng học', href: '/admin/rooms' },
]

export const systemTabs = [
  { name: 'Chi nhánh', href: '/admin/branches' },
  { name: 'Thông báo', href: '/admin/notifications' },
  { name: 'Tích hợp', href: '/admin/system/integrations' },
  { name: 'Chuyển dữ liệu học viên', href: '/admin/migration' },
]

export const navigationGroups = [
  { name: 'TỔNG QUAN', items: [{ name: 'Bảng điều khiển', href: '/admin' }] },
  { name: 'VẬN HÀNH', items: [
    { name: 'Đào tạo', href: '/admin/students' },
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
  { name: 'HỆ THỐNG', items: [{ name: 'Hệ thống', href: '/admin/branches' }] },
]
// Context-only pages (journals, academic record, pauses/makeup) require a selected student/session.
// Learning reports remain in the Đào tạo workspace under VẬN HÀNH at their existing URL.
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
    .map(group => ({ ...group, items: group.items.filter(item => item.href === '/admin/students') }))
    .filter(group => group.items.length > 0)
  if (mode === 'business') return business
  if (mode === 'students') return students
  return [...business, ...students]
}

export function activeNavigationHref(pathname: string) {
  const section = workspaceSection(pathname)
  if (section === 'training') return '/admin/students'
  if (section === 'system') return '/admin/branches'
  if (pathname === '/admin/employees/attendance' || pathname.startsWith('/admin/employees/attendance/')) {
    return '/admin/hr/attendance'
  }
  return navigationGroups.flatMap(group => group.items)
    .filter(item => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
}

function inRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

function activeTab(pathname: string, tabs: { href: string }[]) {
  return tabs.filter(tab => inRoute(pathname, tab.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
}

export function workspaceSection(pathname: string): 'training' | 'system' | null {
  if (activeTab(pathname, trainingTabs) || activeTab(pathname, studentTabs)) return 'training'
  if (activeTab(pathname, systemTabs)) return 'system'
  return null
}

// Menu visibility follows the existing server-side shell boundary. Grouping
// rooms under students must never grant room access to student-placement staff.
export function workspaceTabsForAccess(pathname: string, mode: ShellMode) {
  const section = workspaceSection(pathname)
  if (mode === 'full') {
    return section === 'training' ? trainingTabs : section === 'system' ? systemTabs : []
  }
  return (mode === 'students' || mode === 'business-students') && isStudentOpsPath(pathname)
    ? studentTabs.filter(tab => tab.href === '/admin/students')
    : []
}

export function activeWorkspaceTab(pathname: string) {
  if (activeTab(pathname, studentTabs)) return '/admin/students'
  return activeTab(pathname, [...trainingTabs, ...systemTabs])
}

export function activeStudentTab(pathname: string) {
  return activeTab(pathname, studentTabs)
}
