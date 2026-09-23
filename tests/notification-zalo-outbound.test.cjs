const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const outboundSource = fs.readFileSync('lib/integrations/zalo/outbound.ts', 'utf8')
const workerSource = fs.readFileSync('lib/notifications/worker.ts', 'utf8')
const zaloPage = fs.readFileSync('app/admin/system/integrations/zalo/page.tsx', 'utf8')
const queuePage = fs.readFileSync('app/admin/notifications/page.tsx', 'utf8')
const navigation = fs.readFileSync('app/admin/navigation.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260923050000_notification_zalo_outbound_v1.sql', 'utf8')
const transpiled = ts.transpileModule(outboundSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const loaded = { exports: {} }
new Function('module', 'exports', 'require', transpiled)(loaded, loaded.exports, require)

test('disabled Zalo adapter never reports a send', async () => {
  const result = await loaded.exports.sendZaloTemplateMessage({
    providerUserId: '246845883529197922',
    templateId: 'not-approved',
    parameters: { portal_url: '/my-learning' },
    idempotencyKey: 'domain:test',
  })
  assert.deepEqual(result, { state: 'ZALO_OUTBOUND_NOT_CONFIGURED' })
  assert.equal(outboundSource.includes('fetch('), false)
  assert.equal(outboundSource.includes('ZALO_OA_ACCESS_TOKEN'), false)
  assert.equal(outboundSource.includes('ZALO_OA_REFRESH_TOKEN'), false)
  assert.equal(outboundSource.includes('ZALO_APP_SECRET'), false)
})

test('worker refuses a Zalo job before any provider', () => {
  assert.match(workerSource, /job\.channel === 'ZALO'/)
  assert.match(workerSource, /PROVIDER_NOT_CONFIGURED/)
  assert.equal(workerSource.includes('access_token'), false)
})

test('Zalo admin shows the disabled outbound catalogue and no secrets', () => {
  assert.match(navigation, /href: '\/admin\/system\/integrations'/)
  assert.match(zaloPage, /Chưa kích hoạt/)
  assert.match(zaloPage, /OA package Cơ bản/)
  assert.match(zaloPage, /ZALO_TEMPLATE_LABELS/)
  assert.match(zaloPage, /Template ID/)
  assert.match(zaloPage, /Trạng thái duyệt/)
  assert.match(zaloPage, /Enabled/)
  assert.match(zaloPage, /approvalLabel/)
  for (const key of ['ZALO_REGISTRATION_CONFIRMED', 'ZALO_PAYMENT_CONFIRMED', 'ZALO_CLASS_ASSIGNED', 'ZALO_LEARNING_REPORT_PUBLISHED', 'ZALO_TUITION_REMINDER', 'ZALO_COURSE_EXPIRING']) {
    assert.match(outboundSource, new RegExp(key))
  }
  assert.equal(outboundSource.includes('provider_template_id'), false)
  assert.equal(zaloPage.includes('ZALO_OA_ACCESS_TOKEN'), false)
  assert.equal(zaloPage.includes('ZALO_OA_REFRESH_TOKEN'), false)
  assert.equal(zaloPage.includes('ZALO_APP_SECRET'), false)
  assert.equal(zaloPage.includes('provider_user_id'), false)
})

test('registration template mapping stays database-configured and disabled', () => {
  const mapping = fs.readFileSync('supabase/migrations/20260923052000_zalo_registration_template_mapping_v1.sql', 'utf8')
  assert.match(mapping, /ZALO_REGISTRATION_CONFIRMED/)
  assert.match(mapping, /status = 'PENDING'/)
  assert.match(mapping, /enabled = false/)
  assert.match(mapping, /set_notification_template_mapping/)
  assert.equal(mapping.includes('ZALO_OA_ACCESS_TOKEN'), false)
  assert.equal(/provider_template_id\s*=\s*'[^']+'/.test(mapping), false)
})

test('operations queue can filter the outbound states without exposing a payload', () => {
  assert.match(queuePage, /SKIPPED_NO_CHANNEL/)
  assert.match(queuePage, /RETRYING/)
  assert.match(queuePage, /name="event"/)
  assert.match(queuePage, /name="branch"/)
  assert.match(queuePage, /name="on"/)
  assert.match(queuePage, /Người nhận Zalo: đã ẩn/)
  assert.equal(queuePage.includes("select('id,recipient_id,channel,delivery_mode,template_key,entity_type,entity_id,status,attempts,error_code,created_at')"), true)
  assert.equal(queuePage.includes('payload'), false)
})

test('migration keeps payment success independent of Zalo', () => {
  assert.match(migration, /exception/)
  assert.match(migration, /PAYMENT_CONFIRMED/)
  assert.match(migration, /REGISTRATION_COMPLETED/)
  assert.match(migration, /CLASS_ASSIGNED/)
  assert.match(migration, /LEARNING_REPORT_PUBLISHED/)
  assert.match(migration, /SKIPPED_NO_CHANNEL/)
  assert.equal(migration.includes('parent_phone'), false)
  assert.equal(migration.includes('ZALO_OA_ACCESS_TOKEN'), false)
})
