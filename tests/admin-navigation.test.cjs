/* eslint-disable @typescript-eslint/no-require-imports -- Verify the canonical menu against real routes. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { harness } = require('./helpers/finance-operations.cjs')
const { navigationGroups, activeNavigationHref } = harness().load('../navigation.ts')
test('operations consolidation does not expose finance to student-only staff', () => {
  const { navigationForAccess } = harness().load('../navigation.ts')
  assert.equal(navigationGroups.some(g => ['ĐÀO TẠO', 'TÀI CHÍNH'].includes(g.name)), false)
  for (const mode of ['students', 'business-students']) {
    const operations = navigationForAccess(mode).find(g => g.name === 'VẬN HÀNH')
    assert.deepEqual(operations.items.map(i => i.href), ['/admin/students'])
  }
  assert.equal(navigationForAccess('business').some(g => g.name === 'VẬN HÀNH'), false)
})
test('menu targets existing standalone routes only', () => {
  for (const group of navigationGroups) for (const item of group.items) {
    assert.ok(fs.existsSync('app' + item.href + '/page.tsx'), item.href)
    assert.ok(!item.href.includes('['))
    for (const child of item.children || []) {
      assert.ok(fs.existsSync('app' + child.href + '/page.tsx'), child.href)
      assert.ok(!child.href.includes('['))
    }
  }
})
test('active menu chooses the most specific existing URL', () => {
  assert.equal(activeNavigationHref('/admin/finance/invoices'), '/admin/finance/invoices')
  assert.equal(activeNavigationHref('/admin/tuition/reminders'), '/admin/tuition/reminders')
  assert.equal(activeNavigationHref('/admin/students/123'), '/admin/students')
  assert.equal(activeNavigationHref('/admin'), '/admin')
})
test('HR groups staff, pay, and assignment without a separate teacher entry', () => {
  const { activeNavigationParent } = harness().load('../navigation.ts')
  const hr = navigationGroups.find(g => g.name === 'HR').items
  assert.deepEqual(hr.map(item => item.name), ['Tổng quan HR', 'Nhân sự & nghỉ phép', 'Lương & chi trả', 'Phân công và đối soát'])
  assert.equal(hr.some(item => item.name === 'Giáo viên'), false)
  const people = hr.find(item => item.name === 'Nhân sự & nghỉ phép')
  assert.equal(people.children.find(item => item.name === 'Chấm công').href, '/admin/hr/attendance')
  assert.equal(people.children.filter(item => item.name === 'Chấm công').length, 1)
  assert.equal(navigationGroups.flatMap(g => g.items.flatMap(item => item.children || [item])).some(item => item.href === '/admin/employees/attendance'), false)
  assert.equal(activeNavigationHref('/admin/hr/attendance'), '/admin/hr/attendance')
  assert.equal(activeNavigationHref('/admin/employees/attendance'), '/admin/hr/attendance')
  assert.equal(activeNavigationParent('/admin/hr/attendance'), '/admin/employees')
  const assignment = hr.find(item => item.name === 'Phân công và đối soát')
  assert.equal(assignment.href, '/admin/session-teachers')
  assert.deepEqual(assignment.children.map(item => item.href), ['/admin/session-teachers', '/admin/hr/teaching'])
  assert.equal(activeNavigationHref('/admin/session-teachers'), '/admin/session-teachers')
  assert.equal(activeNavigationHref('/admin/hr/teaching'), '/admin/hr/teaching')
  assert.equal(activeNavigationParent('/admin/session-teachers'), '/admin/session-teachers')
  assert.equal(activeNavigationParent('/admin/hr/teaching'), '/admin/session-teachers')
  assert.equal(activeNavigationParent('/admin/hr/expenses'), '/admin/payroll')
  const matrix = fs.readFileSync('app/admin/hr/attendance/Matrix.tsx', 'utf8')
  assert.match(matrix, /\/admin\/employees\/attendance\?employee=\$\{selected\.person\.id\}&month=\$\{selected\.date\.slice\(0, 7\)\}/)
  assert.ok(fs.existsSync('app/admin/employees/attendance/page.tsx'))
})
test('business shell keeps unaudited admin routes out of the branch menu', () => {
  const { isBusinessShellPath, navigationForShell } = harness().load('../navigation.ts')
  assert.equal(isBusinessShellPath('/admin/business/reports'), true)
  assert.equal(activeNavigationHref('/admin/business/marketing'), '/admin/business/marketing')
  assert.equal(activeNavigationHref('/admin/business/reports'), '/admin/business/marketing')
  assert.equal(activeNavigationHref('/admin/business/campaigns'), '/admin/business/marketing')
  assert.equal(activeNavigationHref('/admin/business/after-sales'), '/admin/business/after-sales')
  assert.equal(activeNavigationHref('/admin/business/reactivation'), '/admin/business/after-sales')
  assert.equal(activeNavigationHref('/admin/business/instrument-customers'), '/admin/business/after-sales')
  assert.equal(isBusinessShellPath('/admin/finance'), false)
  assert.ok(navigationForShell(true).every(group => group.items.every(item => item.href.startsWith('/admin/business'))))
  const { navigationForAccess, isStudentOpsPath } = harness().load('../navigation.ts')
  assert.equal(isStudentOpsPath('/admin/students'), true)
  assert.equal(isStudentOpsPath('/admin/students/student-1'), false)
  assert.equal(isStudentOpsPath('/admin/attendance/fffdb18e-83f3-4f08-8c34-783f278100aa'), true)
  assert.equal(isStudentOpsPath('/admin/attendance/retention'), false)
  assert.equal(isStudentOpsPath('/admin/attendance/fffdb18e-83f3-4f08-8c34-783f278100aa/edit'), false)
  assert.deepEqual(navigationForAccess('students').flatMap(group => group.items.map(item => item.href)), ['/admin/students'])
  assert.ok(navigationForAccess('business-students').some(group => group.items.some(item => item.href === '/admin/students')))
  assert.ok(navigationForAccess('business-students').every(group => group.items.every(item => item.href.startsWith('/admin/business') || item.href === '/admin/students')))
})
test('unimplemented domains are omitted and existing finance routes are present', () => {
  assert.ok(!navigationGroups.some(g => /CRM/.test(g.name)))
  assert.deepEqual(navigationGroups.find(g => g.name === 'KINH DOANH').items.map(i => i.href), [
    '/admin/business',
    '/admin/business/registrations',
    '/admin/business/marketing',
    '/admin/business/after-sales',
  ])
  assert.equal(navigationGroups.some(g => g.name === 'E-LEARNING & KIỂM TRA'), false)
  assert.equal(navigationGroups.flatMap(g => g.items).some(i => i.href === '/admin/elearning'), false)
  assert.ok(fs.existsSync('app/admin/elearning/page.tsx'))
  assert.equal(navigationGroups.some(g => g.name === 'KHO & CỬA HÀNG'), false)
  assert.equal(navigationGroups.filter(g => g.name === 'HỆ THỐNG').length, 1)
  assert.equal(navigationGroups.at(-1).name, 'HỆ THỐNG')
  assert.deepEqual(navigationGroups.at(-1).items.map(i => i.href), ['/admin/inventory', '/admin/instruments', '/admin/branches'])
  assert.equal(navigationGroups.find(g => g.name === 'VẬN HÀNH').items.length, 5)
})

test('CRM aliases and registration share the consolidated navigation entry', () => {
  for (const path of ['/admin/business/crm','/admin/business/crm/lead-1','/admin/business/registrations','/admin/business/registrations/new','/admin/business/registrations/app-1']) {
    assert.equal(activeNavigationHref(path), '/admin/business/registrations')
  }
})

test('approved tuition and payment group keeps six routes and precise active state', () => {
  const { activeNavigationParent } = harness().load('../navigation.ts')
  const group = navigationGroups.find(g => g.name === 'VẬN HÀNH').items.find(i => i.name === 'Học phí & Thanh toán')
  assert.deepEqual(group.children.map(i => i.name), ['Hóa đơn','Học phí','Thanh toán','Công nợ','Hoàn tiền','Nhắc học phí'])
  assert.equal(group.hideChildren, true)
  for (const item of group.children) {
    assert.equal(activeNavigationHref(item.href), item.href)
    assert.equal(activeNavigationHref(item.href + '/detail'), item.href)
    assert.equal(activeNavigationParent(item.href), group.href)
  }
  for (const path of ['/admin/finance','/admin/finance/credits','/admin/finance/operating-expenses','/admin/payroll']) {
    assert.notEqual(activeNavigationParent(path), group.href)
  }
})

test('approved HR labels and deep links remain precise', () => {
  const { activeNavigationParent } = harness().load('../navigation.ts')
  const hr = navigationGroups.find(g => g.name === 'HR').items
  assert.deepEqual(hr.flatMap(i => i.children || []).map(i => i.name), [
    'Hồ sơ nhân viên', 'Chấm công', 'Yêu cầu nghỉ phép', 'Chính sách nghỉ phép',
    'Mẫu lương & cấu hình', 'Kỳ lương', 'Công tác phí', 'Phiếu lương & chi trả',
    'Phân công nhân viên', 'Đối soát',
  ])
  for (const group of hr.filter(i => i.children)) for (const child of group.children) {
    assert.equal(activeNavigationHref(child.href), child.href)
    assert.equal(activeNavigationParent(child.href + '/detail'), group.href)
  }
  assert.equal(activeNavigationParent('/admin/employees/attendance/detail'), '/admin/employees')
  assert.equal(activeNavigationHref('/admin/employees/person-1/compensation'), '/admin/employees')
  assert.equal(activeNavigationParent('/admin/hr'), '/admin/hr')
  assert.equal(activeNavigationParent('/admin/business/crm'), '/admin/business/registrations')
})

test('HR sidebar renders exactly four direct links without nested links or controls', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const Navigation = harness().load('../AdminNavigation.tsx').default
  for (const mobile of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(Navigation, { mobile }))
    const hr = html.match(/<section aria-label="HR">([\s\S]*?)<\/section>/)[1]
    assert.equal((hr.match(/<a /g) || []).length, 4)
    assert.doesNotMatch(hr, /<button|aria-expanded|Phân công nhân viên|Hồ sơ nhân viên/)
    for (const href of ['/admin/hr','/admin/employees','/admin/payroll','/admin/session-teachers']) assert.ok(hr.includes('href="' + href + '"'))
  }
})

test('HR and recruitment use the same wrapping workspace tabs, mounted once', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const h = harness()
  const { HrSectionNav } = h.load('../hr/SectionNav.tsx')
  const html = renderToStaticMarkup(React.createElement(HrSectionNav))
  assert.equal((html.match(/<nav /g) || []).length, 1)
  for (const label of ['Mẫu lương &amp; cấu hình','Kỳ lương','Công tác phí','Phiếu lương &amp; chi trả']) assert.ok(html.includes(label))
  assert.match(fs.readFileSync('app/admin/business/registrations/shell.tsx','utf8'), /<WorkspaceTabs/)
  assert.match(fs.readFileSync('app/admin/_components/workspace-tabs.module.css','utf8'), /flex-wrap: wrap/)
})

test('payroll retains its back link without a second cross-module navigation bar', () => {
  for (const file of ['Index','Workspace']) assert.doesNotMatch(fs.readFileSync(`app/admin/payroll/_ux/${file}.tsx`,'utf8'), /aria-label="Công và lương"/)
  assert.match(fs.readFileSync('app/admin/payroll/_ux/Workspace.tsx','utf8'), /href=\{back\}/)
})

 test('training and system preserve local routes and exact active destinations', () => {
  const n = harness().load('../navigation.ts')
  assert.deepEqual(n.navigationGroups.find(g => g.name === 'VẬN HÀNH').items.map(i => i.name), ['Đào tạo', 'Tổng quan tài chính', 'Học phí & Thanh toán', 'Số dư khách hàng', 'Chi phí vận hành'])
  assert.deepEqual(n.navigationGroups.find(g => g.name === 'HỆ THỐNG').items.map(i => i.name), ['Kho sách và vật tư', 'Nhạc cụ theo serial', 'Hệ thống'])
  for (const route of ['/admin/programs','/admin/academic/id','/admin/courses/id','/admin/classes/id','/admin/rooms','/admin/attendance/retention','/admin/reports/learning/id']) assert.equal(n.activeNavigationHref(route), '/admin/students')
  assert.equal(n.activeWorkspaceTab('/admin/programs','courses'), '/admin/programs')
  assert.equal(n.activeWorkspaceTab('/admin/academic/id'), '/admin/programs')
  assert.equal(n.activeWorkspaceTab('/admin/attendance/retention'), '/admin/attendance/retention')
  assert.equal(n.activeWorkspaceTab('/admin/rooms'), '/admin/rooms')
  assert.equal(n.activeStudentTab('/admin/rooms'), '/admin/rooms')
  assert.equal(n.activeNavigationHref('/admin/system/integrations/zalo'), '/admin/branches')
  assert.equal(n.activeWorkspaceTab('/admin/system/integrations/zalo'), '/admin/system/integrations')
  for(const mode of ['business','students','business-students']) {
    assert.deepEqual(n.workspaceTabsForAccess('/admin/rooms',mode), [])
    assert.deepEqual(n.workspaceTabsForAccess('/admin/branches',mode), [])
  }
  for(const tab of [...n.trainingTabs,...n.systemTabs,...n.studentTabs]) assert.ok(fs.existsSync('app'+tab.href.split('?')[0]+'/page.tsx'))
 })

test('legacy embedded training URLs select the single canonical tab', () => {
  const n = harness().load('../navigation.ts')
  const aliases = { 'teaching-shifts': '/admin/classes', schedule: '/admin/schedule', attendance: '/admin/attendance', reports: '/admin/reports/learning', feedback: '/admin/feedback' }
  for (const [tab, href] of Object.entries(aliases)) assert.equal(n.activeWorkspaceTab('/admin/students', null, tab), href)
  for (const tab of ['overview','students','waiting']) assert.equal(n.activeWorkspaceTab('/admin/students', null, tab), '/admin/students')
  assert.equal(n.trainingTabs.filter(t => t.name === 'Ca dạy').length, 1)
  assert.equal(n.trainingTabs.filter(t => t.name === 'Phòng học').length, 1)
  assert.doesNotMatch(fs.readFileSync('app/admin/students/ops-shell.tsx','utf8'), /<nav|bg-gray-950/)
  assert.equal((fs.readFileSync('app/admin/WorkspaceSectionTabs.tsx','utf8').match(/<WorkspaceTabs /g) || []).length, 1)
})

test('program/course switches share the training bar and preserve existing search filters', () => {
 const {workspaceTabHref} = harness().load('../navigation.ts')
 const search = new URLSearchParams('q=Piano&status=ACTIVE&gap=lesson&selected=one&error=old')
 assert.equal(workspaceTabHref('/admin/programs',search,'/admin/programs?view=courses'),'/admin/programs?view=courses&q=Piano&status=ACTIVE')
 assert.equal(workspaceTabHref('/admin/programs',search,'/admin/programs'),'/admin/programs?q=Piano&status=ACTIVE')
 assert.equal(workspaceTabHref('/admin/students',search,'/admin/programs'),'/admin/programs')
 assert.doesNotMatch(fs.readFileSync('app/admin/programs/page.tsx','utf8'), /aria-label="Chế độ vận hành"/)
})

test('room workspace does not repeat cross-module navigation as a dropdown', () => {
 const source = fs.readFileSync('app/admin/classes/_ops/Workspace.tsx','utf8')
 assert.doesNotMatch(source, /opsViews\.map|!embedded && <form action="\/admin\/classes"/)
})
