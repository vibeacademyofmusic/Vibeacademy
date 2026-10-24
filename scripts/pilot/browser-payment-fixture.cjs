// Inject only a synthetic trusted-server event after browser intake. Never reads browser sessions.
const fs = require('node:fs')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { createClient } = require('@supabase/supabase-js')
const application = '45702ffd-c2d7-4909-a2ff-b2e81697939c'
const marker = 'VIBE-UI-EXEC-20260930'
const ok = r => { if (r.error) throw Error(r.error.message); return r.data }
async function main() {
  assert.equal(process.env.ZALO_PILOT_OUTBOUND, 'disabled')
  const status = execFileSync('node_modules/.bin/supabase', ['status', '--workdir', '/private/tmp/vibe-execution-20260930', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const env = Object.fromEntries([...status.matchAll(/^([A-Z0-9_]+)="([^\"]*)"$/gm)].map(m => [m[1], m[2]]))
  assert.equal(env.API_URL, 'http://127.0.0.1:56321')
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => { assert.equal(new URL(url).origin, env.API_URL); return fetch(url, { ...init, redirect: 'error' }) } } }
  const root = createClient(env.API_URL, env.SERVICE_ROLE_KEY, options)
  const actor = JSON.parse(fs.readFileSync('/private/tmp/vibe-execution-20260930/workflow-actors.json')).ADMIN
  const admin = createClient(env.API_URL, env.ANON_KEY, options)
  ok(await admin.auth.signInWithPassword({ email: actor.email, password: actor.password }))
  const read = async (table, id) => ok(await admin.from(table).select('*').eq('id', id).single())
  let app = await read('registration_applications', application)
  assert.equal(app.student_name, 'TEST UI EXEC 20260930')
  const terms = ok(await admin.from('registration_deposit_terms').select('*').eq('application_id', application).single())
  assert.equal(Number(terms.amount_due), 12000000)
  let orders = ok(await admin.from('registration_payos_orders').select('*').eq('application_id', application))
  if (app.status !== 'COMPLETED') {
    const denied = await admin.rpc('complete_registration_application', { p_request: crypto.randomUUID(), p_application: application, p_version: app.version, p_student: null, p_parent: null })
    assert.match(denied.error?.message || '', /PAYMENT_REQUIRED/)
    const order = ok(await admin.rpc('reserve_registration_payos_order', { p_application: application, p_request: crypto.randomUUID(), p_version: app.version }))
    ok(await root.rpc('activate_registration_payos_order', { p_order_code: order.order_code, p_amount: 12000000, p_payment_link_id: marker, p_checkout_url: 'https://pay.payos.vn/TEST-NOT-VISITED', p_qr_code: 'TEST' }))
    assert.equal(ok(await root.rpc('record_verified_payos_webhook', { p_order_code: order.order_code, p_payment_link_id: marker, p_reference: marker, p_amount: 12000000, p_currency: 'VND' })), 'COMPLETED')
    orders = ok(await admin.from('registration_payos_orders').select('*').eq('application_id', application))
  }
  assert.equal(orders.length, 1)
  assert.equal(ok(await root.rpc('record_verified_payos_webhook', { p_order_code: orders[0].order_code, p_payment_link_id: marker, p_reference: marker, p_amount: 12000000, p_currency: 'VND' })), 'ALREADY_PAID')
  app = await read('registration_applications', application)
  assert.equal(app.status, 'COMPLETED')
  const receipt = await read('payments', orders[0].finance_payment_id)
  assert.equal(receipt.student_id_snapshot, app.linked_student_id)
  assert.equal(receipt.branch_id_snapshot, app.branch_id)
  assert.equal(receipt.created_by, null)
  const evidence = { application, student: app.linked_student_id, payment: receipt.id, amount: receipt.amount, created_by: receipt.created_by, branch: receipt.branch_id_snapshot, event_replay: 'ALREADY_PAID', boundary: 'Synthetic trusted-server event; no provider networking or signature test' }
  fs.writeFileSync('docs/verification/execution-20260930/raw/browser-payment-fixture.json', JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify(evidence))
}
main().catch(e => { console.error(e.message); process.exitCode = 1 })
