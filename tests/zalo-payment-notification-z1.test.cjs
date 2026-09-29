/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve('.')

function load(file) {
  const compiled = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'module', 'exports', source)(require, compiled, compiled.exports)
  return compiled.exports
}

const loadTs = require('./helpers/zalo-module-loader.cjs')()
const outbound = loadTs(path.join(root, 'lib/integrations/zalo/outbound.ts'))
const worker = loadTs(path.join(root, 'lib/notifications/worker.ts'))
const migration = fs.readFileSync('supabase/migrations/20260923170000_zalo_payment_notification_z1.sql', 'utf8')
const workerSource = fs.readFileSync('lib/notifications/worker.ts', 'utf8')
const outboundSource = fs.readFileSync('lib/integrations/zalo/outbound.ts', 'utf8')
const paymentEngine = fs.readFileSync('supabase/migrations/20260915080000_payment_engine_v1.sql', 'utf8')

test('Z1-APP01 POSTED payment queues Zalo job at authoritative boundary', () => {
  assert.match(migration, /create trigger notification_tuition_payment_received/)
  assert.match(migration, /enqueue_tuition_payment_received/)
  assert.match(migration, /new\.status = 'POSTED'/)
  assert.doesNotMatch(migration, /invoice.*PAID.*enqueue/i)
  assert.match(paymentEngine, /create_payment\(/)
})

test('Z1-APP02 idempotency key includes payment recipient template channel', () => {
  assert.match(
    migration,
    /concat_ws\(':', 'TUITION_PAYMENT_RECEIVED', payment\.id::text, 'ZALO_PAYMENT_RECEIVED', parent\.channel_link_id::text, 'ZALO'\)/
  )
  assert.match(migration, /on conflict \(idempotency_key\) do nothing/)
})

test('Z1-APP03 / Z1-APP04 partial payment / invoice PAID not required', () => {
  assert.match(migration, /payment\.status is distinct from 'POSTED'/)
  assert.doesNotMatch(migration, /invoice.*status.*PAID/)
  assert.doesNotMatch(migration, /fully.?paid/i)
})

test('Z1-APP05 provider disabled never reports SENT', async () => {
  assert.equal(outbound.zaloTemplateIsSendable({
    provider_template_id: null,
    status: 'PENDING',
    enabled: false,
  }), false)
  assert.equal(outbound.zaloTemplateIsSendable({
    provider_template_id: 'tmpl-1',
    status: 'APPROVED',
    enabled: true,
  }), true)
  const result = await outbound.sendZaloTemplateMessage({
    providerUserId: '1',
    templateId: 'tmpl-1',
    parameters: {},
    idempotencyKey: 'k',
  })
  assert.equal(result.state, 'ZALO_PILOT_OUTBOUND_DISABLED')
  const job = {
    id: 'job',
    channel: 'ZALO',
    delivery_mode: 'LIVE',
    idempotency_key: 'stable',
    lease_token: 'lease',
    recipient_id: 'user',
    payload: { title: 'Hello', href: '/' },
  }
  const calls = []
  const queue = {
    claim: async () => job,
    complete: async (...args) => { calls.push(args) },
  }
  assert.equal(await worker.dispatch(queue, 'job', {}), 'FAILED')
  assert.equal(calls[0][2], null)
  assert.equal(calls[0][3], 'ZALO_PILOT_OUTBOUND_DISABLED')
})

test('Z1-APP06 no phone matching in recipient resolution', () => {
  assert.match(migration, /finance_zalo_parents/)
  assert.match(migration, /customer_channel_links/)
  assert.match(migration, /provider_user_id/)
  assert.doesNotMatch(migration, /students\.phone|profiles\.phone|registration.*phone/)
  assert.doesNotMatch(migration, /full_name.*channel|name matching/i)
})

test('Z1-APP07 two eligible parents fan out', () => {
  assert.match(migration, /for parent in/)
  assert.match(migration, /finance_zalo_parents\(payment\.student_id_snapshot\)/)
  assert.match(migration, /parent\.channel_link_id/)
})

test('Z1-APP08 secrets absent from client bundle paths', () => {
  const sources = [
    'lib/integrations/zalo/outbound.ts',
    'lib/integrations/zalo/admin.ts',
    'app/admin/system/integrations/zalo/page.tsx',
    'app/admin/system/integrations/zalo/view.tsx',
  ].map(file => fs.readFileSync(file, 'utf8')).join('\n')
  assert.equal(sources.includes('ZALO_APP_SECRET'), false)
  assert.equal(sources.includes('access_token='), false)
  assert.equal(/eyJ[A-Za-z0-9_-]{20,}/.test(sources), false)
  assert.doesNotMatch(outboundSource, /fetch\(|https?:\/\/openapi|graph\.zalo/)
  assert.doesNotMatch(migration, /ZALO_APP_SECRET|access_token|refresh_token|OA secret/i)
})

test('Z1-APP09 / Z1-APP10 existing IN_APP and queue still present', () => {
  assert.match(workerSource, /channel === 'ZALO'/)
  assert.match(workerSource, /ZALO_OUTBOUND_NOT_CONFIGURED/)
  assert.match(migration, /when 'ONBOARDING' then/)
  assert.match(migration, /when 'TUITION_REMINDER' then/)
  assert.match(migration, /deliver_in_app|notification_inbox|IN_APP/)
  assert.match(migration, /if p_event = 'TUITION_PAYMENT_RECEIVED' then/)
})

test('template registry seed stays fail-closed until Owner id', () => {
  assert.match(migration, /'ZALO_PAYMENT_RECEIVED'/)
  assert.match(migration, /'TUITION_PAYMENT_RECEIVED'/)
  assert.match(migration, /provider_template_id[\s\S]*null|'PENDING'|enabled[\s\S]*false/)
  assert.match(migration, /ZALO_RECIPIENT_NOT_LINKED/)
  assert.match(migration, /ZALO_OUTBOUND_NOT_CONFIGURED/)
  assert.match(migration, /drop trigger if exists notification_payment_confirmed/)
  assert.match(migration, /SKIPPED_NO_CHANNEL/)
})
