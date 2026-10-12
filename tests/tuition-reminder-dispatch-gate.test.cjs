const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected } = require('./helpers/finance-operations.cjs')

const reminder = id(2)

test('the send action refuses a disabled template before opening a send', async () => {
  const h = harness({
    notification_templates: [{ template_key: 'ZALO_TUITION_REMINDER', provider: 'ZALO', enabled: false, provider_template_id: '645192' }],
  })
  const actions = h.load('../tuition/reminders/actions.ts')
  const result = await redirected(actions.confirmTuitionZalo, { reminder_id: reminder, parent_id: id(3) })
  assert.match(result.searchParams.get('error'), /đang tắt/)
  assert.equal(h.calls.some(call => call.rpc === 'begin_tuition_zalo_send'), false)
})

test('the send action refuses a caller who is not a super admin before opening a send', async () => {
  const h = harness({}, null, false)
  const actions = h.load('../tuition/reminders/actions.ts')
  await assert.rejects(actions.confirmTuitionZalo((() => {
    const form = new FormData()
    form.set('reminder_id', reminder)
    return form
  })()), error => error.url?.includes('/login'))
  assert.equal(h.calls.some(call => call.rpc === 'begin_tuition_zalo_send'), false)
})
