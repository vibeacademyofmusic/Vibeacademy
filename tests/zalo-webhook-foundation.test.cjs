const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const source = fs.readFileSync('lib/integrations/zalo/webhook.ts', 'utf8')
const route = fs.readFileSync('app/api/integrations/zalo/webhook/route.ts', 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const loaded = { exports: {} }
new Function('module', 'exports', 'require', transpiled)(loaded, loaded.exports, require)
const { acceptZaloWebhook, zaloEventMac } = loaded.exports

const APP = '1355275380325944240'
const OA = '4520912928458797082'
const SECRET = 'fixture-oa-secret-not-real'
const ENV = { appId: APP, oaId: OA, oaSecret: SECRET }

function envelope(body) {
  const raw = JSON.stringify(body)
  return {
    raw,
    body,
    signature: `mac=${zaloEventMac(body.app_id, raw, body.timestamp, SECRET)}`,
  }
}

function signed(overrides = {}) {
  return envelope({
    app_id: APP,
    sender: { id: '246845883529197922' },
    recipient: { id: OA },
    event_name: 'user_send_text',
    message: { text: 'Local fixture', msg_id: '96d3cdf3af150460909' },
    timestamp: '154390853474',
    ...overrides,
  })
}

function officialOaEvent(overrides = {}) {
  return envelope({
    app_id: APP,
    oa_id: OA,
    event_name: 'user_withdraw',
    timestamp: '154390853474',
    ...overrides,
  })
}

function memory() {
  const rows = []
  return {
    rows,
    async record(event) {
      const found = rows.find((row) => row.payloadDigest === event.payloadDigest)
      if (found) return { id: found.id, status: found.status, duplicate: true }
      const row = {
        id: `event-${rows.length + 1}`,
        status: event.supported ? 'ACCEPTED' : 'UNSUPPORTED',
        payloadDigest: event.payloadDigest,
        attempts: 1,
        event,
      }
      rows.push(row)
      return { id: row.id, status: row.status, duplicate: false }
    },
  }
}

test('valid webhook envelope is accepted once', async () => {
  const store = memory()
  const event = signed()
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { ok: true, duplicate: false, status: 'ACCEPTED' })
  assert.equal(store.rows.length, 1)
  assert.equal(store.rows[0].event.externalEventId, '96d3cdf3af150460909')
  assert.equal(store.rows[0].attempts, 1)
})

test('invalid signature is rejected and not stored', async () => {
  const store = memory()
  const event = signed()
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: 'mac=' + 'a'.repeat(64), env: ENV, record: store.record })
  assert.equal(result.status, 401)
  assert.equal(result.body.error, 'INVALID_SIGNATURE')
  assert.equal(store.rows.length, 0)
})

test('malformed JSON is rejected', async () => {
  const store = memory()
  const result = await acceptZaloWebhook({ rawBody: '{', signature: 'mac=' + 'a'.repeat(64), env: ENV, record: store.record })
  assert.equal(result.status, 400)
  assert.equal(result.body.error, 'MALFORMED_JSON')
  assert.equal(store.rows.length, 0)
})

test('duplicate delivery does not process twice', async () => {
  const store = memory()
  const event = signed()
  const first = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  const second = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  assert.equal(first.body.duplicate, false)
  assert.equal(second.status, 200)
  assert.equal(second.body.duplicate, true)
  assert.equal(store.rows.length, 1)
  assert.equal(store.rows[0].attempts, 1)
})

test('unsupported event is stored and still returns 200', async () => {
  const store = memory()
  const event = signed({ event_name: 'not_a_zalo_event', message: { text: 'Local fixture' } })
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  assert.equal(result.status, 200)
  assert.equal(result.body.status, 'UNSUPPORTED')
  assert.equal(store.rows.length, 1)
  assert.equal(store.rows[0].event.supported, false)
})

test('accepted response does not expose the fixture secret or payload', async () => {
  const store = memory()
  const event = signed()
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  const encoded = JSON.stringify(result)
  assert.equal(encoded.includes(SECRET), false)
  assert.equal(encoded.includes('Local fixture'), false)
  assert.equal(encoded.includes('access_token'), false)
})

test('signed secret material is refused before persistence', async () => {
  const store = memory()
  const event = signed({ access_token: 'not-a-real-token' })
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  assert.equal(result.status, 400)
  assert.equal(result.body.error, 'SECRET_MATERIAL_REFUSED')
  assert.equal(store.rows.length, 0)
  assert.equal(JSON.stringify(result).includes('not-a-real-token'), false)
})

test('official oa_id envelope without sender or recipient is accepted', async () => {
  const store = memory()
  const event = officialOaEvent()
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  assert.equal(result.status, 200)
  assert.equal(result.body.status, 'UNSUPPORTED')
  assert.equal(store.rows.length, 1)
  assert.equal(store.rows[0].event.eventType, 'user_withdraw')
  assert.equal(store.rows[0].event.supported, false)
  assert.equal(store.rows[0].event.externalEventId, null)
})

test('matching signature with a different top-level oa_id is rejected', async () => {
  const store = memory()
  const event = officialOaEvent({ oa_id: '999000111' })
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  assert.equal(result.status, 401)
  assert.equal(result.body.error, 'INVALID_SIGNATURE')
  assert.equal(store.rows.length, 0)
})

test('message event without oa_id is accepted when recipient is the OA', async () => {
  const store = memory()
  const event = signed()
  assert.equal(Object.prototype.hasOwnProperty.call(event.body, 'oa_id'), false)
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  assert.equal(result.status, 200)
  assert.equal(result.body.status, 'ACCEPTED')
})

test('message event without oa_id is accepted when sender is the OA', async () => {
  const store = memory()
  const event = signed({
    sender: { id: OA },
    recipient: { id: '246845883529197922' },
    event_name: 'oa_send_anonymous_text',
  })
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  assert.equal(result.status, 200)
  assert.equal(result.body.status, 'ACCEPTED')
})

test('matching oa_id does not accept an invalid signature', async () => {
  const store = memory()
  const event = officialOaEvent()
  const result = await acceptZaloWebhook({
    rawBody: event.raw,
    signature: `mac=${'b'.repeat(64)}`,
    env: ENV,
    record: store.record,
  })
  assert.equal(result.status, 401)
  assert.equal(result.body.error, 'INVALID_SIGNATURE')
  assert.equal(store.rows.length, 0)
})

test('signed event with no OA identity is rejected', async () => {
  const store = memory()
  const event = envelope({
    app_id: APP,
    sender: { id: '111' },
    recipient: { id: '222' },
    event_name: 'user_send_text',
    timestamp: '154390853474',
  })
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  assert.equal(result.status, 401)
  assert.equal(store.rows.length, 0)
})

test('duplicate official oa_id delivery stays idempotent', async () => {
  const store = memory()
  const event = officialOaEvent()
  const first = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  const second = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  assert.equal(first.status, 200)
  assert.equal(first.body.duplicate, false)
  assert.equal(second.status, 200)
  assert.equal(second.body.duplicate, true)
  assert.equal(store.rows.length, 1)
  assert.equal(store.rows[0].attempts, 1)
})

test('top-level msg_id is stored when message.msg_id is absent', async () => {
  const store = memory()
  const event = officialOaEvent({ msg_id: 'oa-event-msg-1' })
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  assert.equal(result.status, 200)
  assert.equal(store.rows[0].event.externalEventId, 'oa-event-msg-1')
  assert.equal(store.rows[0].event.payloadDigest, require('node:crypto').createHash('sha256').update(event.raw, 'utf8').digest('hex'))
})

test('handler source does not hard-code ids, secrets, or a live Zalo call', () => {
  for (const file of [source, route]) {
    assert.equal(file.includes(APP), false)
    assert.equal(file.includes(OA), false)
    assert.equal(file.includes('eyJ'), false)
    assert.equal(/zalo\.me|openapi\.zalo|graph\.zalo/.test(file), false)
    assert.equal(file.includes('fetch('), false)
  }
  assert.match(route, /X-ZEvent-Signature|x-zevent-signature/)
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(route, /ZALO_APP_SECRET/)
  assert.match(route, /ZALO_OA_ACCESS_TOKEN/)
  assert.match(route, /ZALO_OA_REFRESH_TOKEN/)
})
