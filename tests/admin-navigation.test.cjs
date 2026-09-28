/* eslint-disable @typescript-eslint/no-require-imports -- Verify the canonical menu against real routes. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { harness } = require('./helpers/finance-operations.cjs')
const { navigationGroups, activeNavigationHref, trainingTabs, studentTabs, systemTabs, activeWorkspaceTab, activeStudentTab, workspaceTabsForAccess } = harness().load('../navigation.ts')
test('menu targets existing standalone routes only', () => {
  for (const item of [...navigationGroups.flatMap(group => group.items), ...trainingTabs, ...studentTabs, ...systemTabs]) {
    assert.ok(fs.existsSync('app' + item.href + '/page.tsx'), item.href)
    assert.ok(!item.href.includes('['))
  }
})
test('active menu chooses the most specific existing URL', () => {
  assert.equal(activeNavigationHref('/admin/finance/invoices'), '/admin/finance/invoices')
  assert.equal(activeNavigationHref('/admin/tuition/reminders'), '/admin/tuition/reminders')
  assert.equal(activeNavigationHref('/admin/students/123'), '/admin/students')
  assert.equal(activeNavigationHref('/admin'), '/admin')
})
test('consolidated workspaces retain deep links and select the most specific tab', () => {
  for (const item of [...trainingTabs, ...studentTabs]) {
    assert.equal(activeNavigationHref(item.href + '/record'), '/admin/students')
  }
  for (const item of systemTabs) {
    assert.equal(activeNavigationHref(item.href + '/record'), '/admin/branches')
    assert.equal(activeWorkspaceTab(item.href + '/record'), item.href)
  }
  assert.equal(activeWorkspaceTab('/admin/attendance/retention'), '/admin/attendance/retention')
  assert.equal(activeWorkspaceTab('/admin/attendance/session-1'), '/admin/attendance')
  assert.equal(activeWorkspaceTab('/admin/rooms/room-1'), '/admin/students')
  assert.equal(activeStudentTab('/admin/rooms/room-1'), '/admin/rooms')
  assert.equal(activeStudentTab('/admin/students/student-1'), '/admin/students')
  assert.equal(activeWorkspaceTab('/admin/rooms-extra'), null)
  assert.equal(activeWorkspaceTab('/admin/system/integrations-extra'), null)
  assert.ok(!navigationGroups.some(group => ['ĐÀO TẠO', 'HỌC VIÊN', 'TÀI CHÍNH'].includes(group.name)))
  assert.equal(navigationGroups.find(group => group.name === 'VẬN HÀNH').items.filter(item => item.href === '/admin/students').length, 1)
  assert.equal(navigationGroups.find(group => group.name === 'HỆ THỐNG').items.length, 1)
})
test('workspace tabs never extend restricted staff access to rooms or settings', () => {
  for (const mode of ['students', 'business-students']) {
    assert.deepEqual(workspaceTabsForAccess('/admin/students', mode).map(tab => tab.href), ['/admin/students'])
    for (const item of [...trainingTabs, ...studentTabs, ...systemTabs]) {
      if (item.href !== '/admin/students') assert.deepEqual(workspaceTabsForAccess(item.href, mode), [])
    }
    assert.deepEqual(workspaceTabsForAccess('/admin/students/student-1', mode), [])
  }
  assert.deepEqual(workspaceTabsForAccess('/admin/students', 'business'), [])
})
test('HR Chấm công opens the canonical attendance workspace', () => {
  const hr = navigationGroups.find(g => g.name === 'HR').items
  assert.equal(hr.find(item => item.name === 'Chấm công').href, '/admin/hr/attendance')
  assert.equal(hr.filter(item => item.name === 'Chấm công').length, 1)
  assert.equal(navigationGroups.flatMap(g => g.items).some(item => item.href === '/admin/employees/attendance'), false)
  assert.equal(activeNavigationHref('/admin/hr/attendance'), '/admin/hr/attendance')
  assert.equal(activeNavigationHref('/admin/employees/attendance'), '/admin/hr/attendance')
  const matrix = fs.readFileSync('app/admin/hr/attendance/Matrix.tsx', 'utf8')
  assert.match(matrix, /\/admin\/employees\/attendance\?employee=\$\{selected\.person\.id\}&month=\$\{selected\.date\.slice\(0, 7\)\}/)
  assert.ok(fs.existsSync('app/admin/employees/attendance/page.tsx'))
})
test('business shell keeps unaudited admin routes out of the branch menu', () => {
  const { isBusinessShellPath, navigationForShell } = harness().load('../navigation.ts')
  assert.equal(isBusinessShellPath('/admin/business/reports'), true)
  assert.equal(isBusinessShellPath('/admin/finance'), false)
  assert.ok(navigationForShell(true).every(group => group.items.every(item => item.href.startsWith('/admin/business'))))
  const { navigationForAccess, isStudentOpsPath } = harness().load('../navigation.ts')
  assert.equal(isStudentOpsPath('/admin/students'), true)
  assert.equal(isStudentOpsPath('/admin/students/student-1'), false)
  assert.deepEqual(navigationForAccess('students').flatMap(group => group.items.map(item => item.href)), ['/admin/students'])
  assert.ok(navigationForAccess('business-students').some(group => group.items.some(item => item.href === '/admin/students')))
  assert.ok(navigationForAccess('business-students').every(group => group.items.every(item => item.href.startsWith('/admin/business') || item.href === '/admin/students')))
})
test('unimplemented domains are omitted and existing finance routes are present', () => {
  assert.ok(!navigationGroups.some(g => /CRM/.test(g.name)))
  assert.deepEqual(navigationGroups.find(g => g.name === 'KINH DOANH').items.map(i => i.href), [
    '/admin/business',
    '/admin/business/registrations',
    '/admin/business/campaigns',
    '/admin/business/reports',
    '/admin/business/reactivation',
    '/admin/business/instrument-customers',
  ])
  assert.ok(!navigationGroups.some(g => g.name === 'E-LEARNING & KIỂM TRA'))
  assert.ok(!navigationGroups.flatMap(g => g.items).some(item => item.href.startsWith('/admin/elearning')))
  assert.deepEqual(navigationGroups.find(g => g.name === 'KHO & CỬA HÀNG').items.map(i => i.href), ['/admin/inventory', '/admin/instruments'])
  assert.equal(navigationGroups.find(g => g.name === 'VẬN HÀNH').items.length, 10)
})
