const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const source = fs.readFileSync('lib/integrations/zalo/readiness.ts', 'utf8')
const proofSource = fs.readFileSync('lib/integrations/zalo/app-secret-proof.ts', 'utf8')
function load(file) {
  const transpiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  const localRequire = (id) => id === './app-secret-proof' ? proofModule : require(id)
  new Function('module', 'exports', 'require', transpiled)(loaded, loaded.exports, localRequire)
  return loaded.exports
}
const proofModule = load('lib/integrations/zalo/app-secret-proof.ts')
const { sendZaloTemplateMessage, zaloOutboundReadiness, zaloOneJobAllows, ZALO_TEMPLATE_PARAMETERS } = load('lib/integrations/zalo/readiness.ts')

const message = {
  jobId: 'job-one',
  providerUserId: 'owner-zalo-user',
  templateId: '640377',
  registrationCompleted: true,
  parameters: {
    customer_name: 'Phu huynh PayOS',
    registration_code: 'DK-20260925-266C422B8595',
    student_name: 'PayOS Can Tho Synthetic',
    program_name: 'Guitar Preview',
    branch_name: 'Vibe Academy Cần Thơ',
    order_code: 'DK-20260925-266C422B8595',
    payment_status: 'Đã nhận cọc 50%',
  },
  idempotencyKey: 'domain:REGISTRATION_COMPLETED:preview',
}

test('template 640377 stays blocked without credentials or a send flag', async () => {
  const ready = zaloOutboundReadiness({})
  assert.equal(ready.appId, '1355275380325944240')
  assert.equal(ready.oaId, '4520912928458797082')
  assert.equal(ready.sendEnabled, false)
  assert.equal(ready.blocked, true)
  assert.deepEqual(ready.missingSecrets, ['ZALO_OA_ACCESS_TOKEN', 'ZALO_OA_REFRESH_TOKEN', 'ZALO_APP_SECRET', 'ZALO_OA_SECRET_KEY'])
  assert.deepEqual(await sendZaloTemplateMessage(message, {}), { state: 'ZALO_OUTBOUND_NOT_CONFIGURED' })
  assert.equal(source.includes('fetch('), false)
})

function mockTransport(responses) {
  const calls = []
  return {
    calls,
    transport: async (url, init) => {
      calls.push({ url, init })
      const next = responses.shift()
      return { async json() { return next } }
    },
  }
}

const enabled = {
  ZALO_TEMPLATE_SEND_ENABLED: 'true',
  ZALO_OA_ACCESS_TOKEN: 'access',
  ZALO_OA_REFRESH_TOKEN: 'refresh',
  ZALO_APP_SECRET: 'secret',
  ZALO_OA_SECRET_KEY: 'oa-secret',
  ZALO_TEMPLATE_SEND_JOB_ID: 'job-one',
  ZALO_TEMPLATE_SEND_RECIPIENT_ID: 'owner-zalo-user',
}

test('mocked Zalo UID send covers denial, expiry, rejection, and acceptance', async () => {
  assert.equal(source.includes('https://openapi.zalo.me/v3.0/oa/message/template'), true)
  assert.equal(source.includes('fetch('), false)
  const denied = mockTransport([])
  assert.deepEqual(await sendZaloTemplateMessage({ ...message, jobId: 'job-old' }, enabled, denied.transport), { state: 'ZALO_ONE_JOB_DENIED' })
  assert.deepEqual(await sendZaloTemplateMessage({ ...message, providerUserId: 'other-parent' }, enabled, denied.transport), { state: 'ZALO_ONE_JOB_DENIED' })
  assert.deepEqual(await sendZaloTemplateMessage({ ...message, registrationCompleted: false }, enabled, denied.transport), { state: 'ZALO_ONE_JOB_DENIED' })
  assert.equal(denied.calls.length, 0)
  const duplicate = mockTransport([])
  assert.deepEqual(await sendZaloTemplateMessage({ ...message, acceptedMessageId: 'msg-1' }, enabled, duplicate.transport), { state: 'ACCEPTED', messageId: 'msg-1', delivered: false, duplicate: true })
  assert.equal(duplicate.calls.length, 0)
  const expired = mockTransport([{ error: -220 }])
  assert.deepEqual(await sendZaloTemplateMessage(message, enabled, expired.transport), { state: 'ZALO_TOKEN_INVALID' })
  assert.equal(expired.calls.length, 1)
  assert.equal(expired.calls.some(call => call.url.includes('access_token')), false)
  const rejected = mockTransport([{ error: -109 }])
  assert.deepEqual(await sendZaloTemplateMessage(message, enabled, rejected.transport), { state: 'PROVIDER_REJECTED', providerError: -109 })
  const accepted = mockTransport([{ error: 0, data: { message_id: 'msg-accepted', user_id: 'owner-zalo-user' }, sent_time: '1' }])
  const result = await sendZaloTemplateMessage(message, enabled, accepted.transport)
  assert.deepEqual(result, { state: 'ACCEPTED', messageId: 'msg-accepted', delivered: false, duplicate: false })
  const sent = JSON.parse(accepted.calls[0].init.body)
  assert.equal(sent.user_id, 'owner-zalo-user')
  assert.equal(sent.template_id, '640377')
  assert.equal(sent.template_data.payment_status, 'Đã nhận cọc 50%')
  assert.equal(Object.hasOwn(sent, 'phone'), false)
  assert.equal(accepted.calls[0].init.headers.access_token, 'access')
  assert.equal(accepted.calls[0].init.headers.appsecret_proof, proofModule.zaloAppSecretProof('access', 'secret'))
  assert.equal(proofSource.includes('createHmac'), true)
  assert.equal(proofSource.includes('ZALO_OA_SECRET_KEY'), false)
})

test('payOS completion dispatches only an armed allowlisted job', () => {
  const route = fs.readFileSync('app/api/integrations/payos/webhook/route.ts', 'utf8')
  const dispatcher = fs.readFileSync('lib/integrations/zalo/preview-dispatch.ts', 'utf8')
  assert.match(route, /dispatchPreviewRegistrationZalo/)
  assert.match(dispatcher, /decision\s*!==\s*'SEND'/)
  assert.match(dispatcher, /claim_zalo_registration_attempt/)
  assert.match(dispatcher, /finish_zalo_registration_attempt/)
  assert.match(dispatcher, /ZALO_UID_DURABLE_CLAIM_REQUIRED/)
  assert.equal(dispatcher.includes('delivered_at'), false)
})

test('public proxy forwards only payOS and Zalo callbacks', () => {
  const proxy = fs.readFileSync('scripts/payos-webhook-proxy.cjs', 'utf8')
  assert.match(proxy, /\/api\/integrations\/payos\/webhook/)
  assert.match(proxy, /\/api\/integrations\/zalo\/webhook/)
  assert.match(proxy, /PREVIEW_CALLBACK_ONLY/)
})

test('deposit wording stays outside the template parameter', () => {
  const page = fs.readFileSync('app/admin/business/registrations/[id]/page.tsx', 'utf8')
  const connection = fs.readFileSync('app/admin/business/registrations/[id]/ZaloConnection.tsx', 'utf8')
  assert.match(page, /Trạng thái thu dự kiến trong tin: \{zaloPreview\.payment_status\}/)
  assert.match(page, /Bản xem trước không xác nhận đã nhận tiền hoặc đã gửi tin/)
  assert.equal(page.includes('payment_status: {zaloPreview.payment_status} —'), false)
  assert.match(connection, /widget_interaction_accepted/)
  assert.equal(connection.includes('parent_phone'), false)
})
