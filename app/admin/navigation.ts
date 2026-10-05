import { isAfterSalesPath, isMarketingPath } from './business/workspaces'

export const trainingTabs: { name: string; href: string; studentTab?: string }[] = [
  { name: 'Học viên', href: '/admin/students' },
  { name: 'Chương trình học', href: '/admin/programs' },
  { name: 'Ca dạy', href: '/admin/classes', studentTab: 'teaching-shifts' },
  { name: 'Lịch học', href: '/admin/schedule', studentTab: 'schedule' },
  { name: 'Điểm danh', href: '/admin/attendance', studentTab: 'attendance' },
  { name: 'Cảnh báo chuyên cần', href: '/admin/attendance/retention' },
  { name: 'Báo cáo học tập', href: '/admin/reports/learning' },
  { name: 'Duyệt bảo lưu', href: '/admin/academic/pause-requests' },
  { name: 'Phản hồi buổi học', href: '/admin/feedback' },
  // Rooms belongs to the student workspace, never a separate sidebar group.
  { name: 'Phòng học', href: '/admin/rooms' },
]

export const studentTabs = trainingTabs.filter(tab => ['/admin/students', '/admin/rooms'].includes(tab.href))

export const systemTabs = [
  { name: 'Chi nhánh', href: '/admin/branches' },
  { name: 'Thông báo', href: '/admin/notifications' },
  { name: 'Tích hợp', href: '/admin/system/integrations' },
  { name: 'Chuyển dữ liệu học viên', href: '/admin/migration' },
]

export const navigationGroups: { name: string; items: NavigationItem[] }[] = [
  { name: 'TỔNG QUAN', items: [{ name: 'Bảng điều khiển', href: '/admin' }] },
  { name: 'VẬN HÀNH', items: [
    { name: 'Đào tạo', href: '/admin/students' },
    { name: 'Tổng quan tài chính', href: '/admin/finance' },
    { name: 'Học phí & Thanh toán', href: '/admin/finance/invoices', hideChildren: true, children: [
      { name: 'Hóa đơn', href: '/admin/finance/invoices' },
      { name: 'Học phí', href: '/admin/tuition' },
      { name: 'Thanh toán', href: '/admin/finance/payments' },
      { name: 'Công nợ', href: '/admin/finance/receivables' },
      { name: 'Hoàn tiền', href: '/admin/finance/refunds' },
      { name: 'Nhắc học phí', href: '/admin/tuition/reminders' },
    ] },
    { name: 'Số dư khách hàng', href: '/admin/finance/credits' },
    { name: 'Chi phí vận hành', href: '/admin/finance/operating-expenses' },
  ] },
  { name: 'HR', items: [
    { name: 'Tổng quan HR', href: '/admin/hr' },
    { name: 'Nhân sự & nghỉ phép', href: '/admin/employees', hideChildren: true, children: [
      { name: 'Hồ sơ nhân viên', href: '/admin/employees' },
      { name: 'Chấm công', href: '/admin/hr/attendance' },
      { name: 'Yêu cầu nghỉ phép', href: '/admin/employees/leave-requests' },
      { name: 'Chính sách nghỉ phép', href: '/admin/employees/leave-policies' },
    ] },
    { name: 'Lương & chi trả', href: '/admin/payroll', hideChildren: true, children: [
      { name: 'Mẫu lương & cấu hình', href: '/admin/hr/templates' },
      { name: 'Kỳ lương', href: '/admin/payroll' },
      { name: 'Công tác phí', href: '/admin/hr/expenses' },
      { name: 'Phiếu lương & chi trả', href: '/admin/hr/payslips' },
    ] },
    { name: 'Phân công và đối soát', href: '/admin/session-teachers', hideChildren: true, children: [
      { name: 'Phân công nhân viên', href: '/admin/session-teachers' },
      { name: 'Đối soát', href: '/admin/hr/teaching' },
    ] },
  ] },
  { name: 'KINH DOANH', items: [
    { name: 'Điều hành kinh doanh', href: '/admin/business' },
    { name: 'CRM & Tuyển sinh', href: '/admin/business/registrations' },
    { name: 'Báo cáo marketing', href: '/admin/business/marketing' },
    { name: 'Sau bán hàng', href: '/admin/business/after-sales' },
  ] },
  { name: 'HỆ THỐNG', items: [
    { name: 'Kho sách và vật tư', href: '/admin/inventory' },
    { name: 'Nhạc cụ theo serial', href: '/admin/instruments' },
    { name: 'Hệ thống', href: '/admin/branches' },
  ] },
]
// Context-only pages (journals, academic record, pauses/makeup) require a selected student/session.
// Existing learning report URLs remain under the training workspace.
export function isBusinessShellPath(pathname: string | null | undefined) {
  return pathname === '/admin/business' || Boolean(pathname?.startsWith('/admin/business/'))
}

export function isStudentOpsPath(pathname: string | null | undefined) {
  return pathname === '/admin/students' || Boolean(pathname && /^\/admin\/attendance\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname))
}

export function isCashierDeskPath(pathname: string | null | undefined) {
  return pathname === '/admin/finance/payments'
}

export function isPauseApprovalPath(pathname: string | null | undefined) {
  return pathname === '/admin/academic/pause-requests'
}

export function isTuitionCarePath(pathname: string | null | undefined) {
  return pathname === '/admin/tuition/reminders'
}

export type ShellMode = 'full' | 'business' | 'students' | 'business-students' | 'cashier' | 'academic' | 'tuition'

export function navigationForShell(businessOnly: boolean) {
  return businessOnly ? navigationGroups.filter(group => group.name === 'KINH DOANH') : navigationGroups
}

export function navigationForAccess(mode: ShellMode) {
  if (mode === 'full') return navigationGroups
  const business = navigationGroups.filter(group => group.name === 'KINH DOANH')
  const students = navigationGroups
    .filter(group => group.name === 'VẬN HÀNH')
    .map(group => ({ ...group, items: group.items.filter(item => item.href === '/admin/students') }))
  if (mode === 'business') return business
  if (mode === 'students') return students
  if (mode === 'cashier') return [{ name: 'VẬN HÀNH', items: [{ name: 'Thu tiền mặt', href: '/admin/finance/payments' }] }]
  if (mode === 'academic') return [{ name: 'VẬN HÀNH', items: [{ name: 'Duyệt bảo lưu', href: '/admin/academic/pause-requests' }] }]
  if (mode === 'tuition') return [{ name: 'VẬN HÀNH', items: [{ name: 'Nhắc học phí', href: '/admin/tuition/reminders' }] }]
  return [...business, ...students]
}

export type NavigationChild = { name: string; href: string }
export type NavigationItem = { name: string; href: string; children?: NavigationChild[]; hideChildren?: boolean }

function navigationLeaves() {
  return navigationGroups.flatMap(group => group.items.flatMap(item => item.children?.length ? item.children : [item]))
}

export function activeNavigationHref(pathname: string) {
  const section = workspaceSection(pathname)
  if (section === 'training') return '/admin/students'
  if (section === 'system') return '/admin/branches'
  if (pathname === '/admin/business/crm' || pathname.startsWith('/admin/business/crm/')) return '/admin/business/registrations'
  if (pathname === '/admin/employees/attendance' || pathname.startsWith('/admin/employees/attendance/')) {
    return '/admin/hr/attendance'
  }
  if (pathname === '/admin/academic' || pathname.startsWith('/admin/academic/') || pathname === '/admin/courses' || pathname.startsWith('/admin/courses/')) {
    return '/admin/programs'
  }
  if (pathname === '/admin/rooms' || pathname.startsWith('/admin/rooms/')) return '/admin/rooms'
  if (isMarketingPath(pathname)) return '/admin/business/marketing'
  if (isAfterSalesPath(pathname)) return '/admin/business/after-sales'
  if (
    pathname === '/admin/classes' || pathname.startsWith('/admin/classes/')
    || pathname === '/admin/schedule' || pathname.startsWith('/admin/schedule/')
    || pathname === '/admin/attendance' || pathname.startsWith('/admin/attendance/')
    || pathname === '/admin/reports/learning' || pathname.startsWith('/admin/reports/learning/')
    || pathname === '/admin/feedback' || pathname.startsWith('/admin/feedback/')
  ) {
    return '/admin/students'
  }
  return navigationLeaves()
    .filter(item => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
}

export function activeNavigationParent(pathname: string) {
  const leaf = activeNavigationHref(pathname)
  if (!leaf) return undefined
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if (item.children?.some(child => child.href === leaf)) return item.href
    }
  }
  return leaf
}
function inRoute(pathname: string, href: string) {
  return pathname === href.split('?')[0] || pathname.startsWith(href.split('?')[0] + '/')
}

function activeTab(pathname: string, tabs: { href: string }[]) {
  return tabs.filter(tab => inRoute(pathname, tab.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
}

export function workspaceSection(pathname: string): 'training' | 'system' | null {
  if (inRoute(pathname, '/admin/academic') || inRoute(pathname, '/admin/courses')) return 'training'
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
    ? trainingTabs.filter(tab => tab.href === '/admin/students' || tab.studentTab).map(tab => ({ ...tab, activeHref: tab.href, href: tab.studentTab ? `/admin/students?tab=${tab.studentTab}` : tab.href }))
    : []
}

export function activeWorkspaceTab(pathname: string, view?: string | null, tab?: string | null) {
  if (pathname === '/admin/students') {
    const aliases: Record<string, string> = { 'teaching-shifts': '/admin/classes', schedule: '/admin/schedule', attendance: '/admin/attendance', reports: '/admin/reports/learning', feedback: '/admin/feedback' }
    return aliases[tab || ''] || '/admin/students'
  }
  if (pathname === '/admin/academic/pause-requests') return '/admin/academic/pause-requests'
  if (pathname === '/admin/programs' || inRoute(pathname, '/admin/academic') || inRoute(pathname, '/admin/courses')) return '/admin/programs'
  if (inRoute(pathname, '/admin/rooms')) return '/admin/rooms'
  if (inRoute(pathname, '/admin/students')) return '/admin/students'
  return activeTab(pathname, [...trainingTabs, ...systemTabs])
}

export function activeStudentTab(pathname: string) {
  return activeTab(pathname, studentTabs)
}

// Preserve the existing program/course search filters when the shared bar
// replaces the former local mode switch. Selection/health filters are view-specific.
export function workspaceTabHref(pathname: string, search: { get(key: string): string | null }, href: string) {
  if (pathname !== '/admin/programs' || href.split('?')[0] !== '/admin/programs') return href
  const query = new URLSearchParams(href.split('?')[1] || '')
  for (const key of ['q', 'status']) {
    const value = search.get(key)
    if (value) query.set(key, value)
  }
  return query.size ? `/admin/programs?${query}` : '/admin/programs'
}
