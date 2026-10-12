const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { harness, id, redirected } = require('./helpers/finance-operations.cjs')

test('the server send check uses the send permission, not reminder view', () => {
  const sql = fs.readFileSync('supabase/migrations/20261012140000_tuition_reminder_send_permission.sql', 'utf8')
  assert.match(sql, /tuition\.reminder\.send/)
  assert.doesNotMatch(sql, /tuition_branch_granted\([^)]*'tuition\.reminder\.view'/)
  assert.match(sql, /does not grant that permission to TUITION_CARE/)
})

const reminder = id(2)

const enabledTemplate = { template_key: 'ZALO_TUITION_REMINDER', provider: 'ZALO', enabled: true, provider_template_id: '645192' }

test('the send action refuses a disabled template before opening a send', async () => {
  const h = harness({
    sendAllowed: true,
    notification_templates: [{ template_key: 'ZALO_TUITION_REMINDER', provider: 'ZALO', enabled: false, provider_template_id: '645192' }],
  })
  const actions = h.load('../tuition/reminders/actions.ts')
  const result = await redirected(actions.confirmTuitionZalo, { reminder_id: reminder, parent_id: id(3) })
  assert.match(result.searchParams.get('error'), /đang tắt/)
  assert.equal(h.calls.some(call => call.rpc === 'begin_tuition_zalo_send'), false)
})

test('a staff grant on another branch is refused before a send', async () => {
  const h = harness({ sendAllowed: false, notification_templates: [enabledTemplate] })
  const actions = h.load('../tuition/reminders/actions.ts')
  const result = await redirected(actions.confirmTuitionZalo, { reminder_id: reminder, parent_id: id(3) })
  assert.match(result.searchParams.get('error'), /chi nhánh này/)
  assert.equal(h.calls.some(call => call.rpc === 'begin_tuition_zalo_send'), false)
})

test('a granted branch still does not send while real delivery is off', async () => {
  const h = harness({ sendAllowed: true, notification_templates: [enabledTemplate] })
  const actions = h.load('../tuition/reminders/actions.ts')
  const blocked = await redirected(actions.confirmTuitionZalo, { reminder_id: reminder, parent_id: id(3) })
  assert.match(blocked.searchParams.get('error'), /Gửi thật đang tắt/)
  assert.equal(h.calls.some(call => call.rpc === 'begin_tuition_zalo_send'), false)
})

test('a granted branch passes the permission check and still does not send when the reminder is missing', async () => {
  const previous = process.env.ZALO_PILOT_OUTBOUND
  process.env.ZALO_PILOT_OUTBOUND = 'enabled'
  try {
    const h = harness({ sendAllowed: true, notification_templates: [enabledTemplate] })
    const actions = h.load('../tuition/reminders/actions.ts')
    const result = await redirected(actions.confirmTuitionZalo, { reminder_id: reminder, parent_id: id(3) })
    assert.match(result.searchParams.get('error'), /Không tìm thấy/)
    assert.equal(h.calls.some(call => call.rpc === 'tuition_reminder_send_allowed'), true)
    assert.equal(h.calls.some(call => call.rpc === 'begin_tuition_zalo_send'), false)
  } finally {
    if (previous == null) delete process.env.ZALO_PILOT_OUTBOUND
    else process.env.ZALO_PILOT_OUTBOUND = previous
  }
})
