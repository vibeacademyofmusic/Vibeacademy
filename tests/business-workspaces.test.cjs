/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const { harness } = require('./helpers/finance-operations.cjs')

const {
  marketingHref,
  afterSalesHref,
  resolveMarketingTab,
  resolveAfterSalesTab,
  legacyMarketingRedirect,
  legacyAfterSalesRedirect,
  hiddenBusinessHrefs,
  defaultMarketingTab,
  defaultAfterSalesTab,
} = harness().load('../business/workspaces.ts')

test('marketing opens the report tab unless that permission is missing', () => {
  assert.equal(defaultMarketingTab({ reports: true, campaigns: true, returning: false, instruments: false }), 'reports')
  assert.equal(defaultMarketingTab({ reports: false, campaigns: true, returning: false, instruments: false }), 'campaigns')
  assert.deepEqual(resolveMarketingTab(undefined, { reports: true, campaigns: false, returning: false, instruments: false }), { tab: 'reports', denied: false })
  assert.deepEqual(resolveMarketingTab('campaigns', { reports: true, campaigns: false, returning: false, instruments: false }), { tab: null, denied: true })
  assert.deepEqual(resolveMarketingTab('reports', { reports: false, campaigns: true, returning: false, instruments: false }), { tab: null, denied: true })
})

test('after-sales keeps the two relationships on separate tabs', () => {
  assert.equal(defaultAfterSalesTab({ reports: false, campaigns: false, returning: true, instruments: true }), 'returning')
  assert.equal(defaultAfterSalesTab({ reports: false, campaigns: false, returning: false, instruments: true }), 'instruments')
  assert.deepEqual(resolveAfterSalesTab('instruments', { reports: false, campaigns: false, returning: true, instruments: false }), { tab: null, denied: true })
  assert.deepEqual(resolveAfterSalesTab(undefined, { reports: false, campaigns: false, returning: false, instruments: true }), { tab: 'instruments', denied: false })
})

test('old list routes redirect to the matching tab and keep supported filters', () => {
  const reports = legacyMarketingRedirect('reports', { from: '2026-09-01', to: '2026-09-26', branch: 'branch-1', campaign: 'camp-1', ignored: 'no' })
  assert.equal(reports, marketingHref('reports', { from: '2026-09-01', to: '2026-09-26', branch: 'branch-1', campaign: 'camp-1' }))
  assert.doesNotMatch(reports, /ignored/)
  const campaigns = legacyMarketingRedirect('campaigns', { status: 'ACTIVE', platform: 'ZALO' })
  assert.match(campaigns, /\/admin\/business\/marketing\?/)
  assert.match(campaigns, /tab=campaigns/)
  assert.match(campaigns, /status=ACTIVE/)
  assert.match(campaigns, /platform=ZALO/)
  const returning = legacyAfterSalesRedirect('returning', { status: 'INTERESTED', branch: 'branch-1' })
  assert.match(returning, /tab=returning/)
  assert.match(returning, /status=INTERESTED/)
  assert.match(returning, /branch=branch-1/)
  const instruments = legacyAfterSalesRedirect('instruments', { view: 'care', filter: 'FOLLOW_UP' })
  assert.equal(instruments, afterSalesHref('instruments', { view: 'care', filter: 'FOLLOW_UP' }))
})

test('a workspace stays in the menu only when one of its tabs is allowed', () => {
  assert.deepEqual(hiddenBusinessHrefs({ reports: true, campaigns: false, returning: false, instruments: false }), ['/admin/business/after-sales'])
  assert.deepEqual(hiddenBusinessHrefs({ reports: false, campaigns: false, returning: false, instruments: true }), ['/admin/business/marketing'])
  assert.deepEqual(hiddenBusinessHrefs({ reports: false, campaigns: false, returning: false, instruments: false }), ['/admin/business/marketing', '/admin/business/after-sales'])
})
