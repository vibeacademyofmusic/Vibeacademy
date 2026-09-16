/* eslint-disable @typescript-eslint/no-require-imports -- Verify the canonical menu against real routes. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { harness } = require('./helpers/finance-operations.cjs')
const { navigationGroups, activeNavigationHref } = harness().load('../navigation.ts')
test('menu targets existing standalone routes only', () => {
  for (const group of navigationGroups) for (const item of group.items) {
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
test('unimplemented domains are omitted and existing finance routes are present', () => {
  assert.ok(!navigationGroups.some(g => /CRM|E-LEARNING/.test(g.name)))
  assert.deepEqual(navigationGroups.find(g => g.name === 'KHO & CỬA HÀNG').items.map(i => i.href), ['/admin/inventory'])
  assert.equal(navigationGroups.find(g => g.name === 'TÀI CHÍNH').items.length, 8)
})
