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

function signed(overrides = {}) {
  const body = {
    app_id: APP,
    sender: { id: '246845883529197922' },
    recipient: { id: OA },
    event_name: 'user_send_text',
    message: { text: 'Local fixture', msg_id: '96d3cdf3af150460909' },
    timestamp: '154390853474',
    ...overrides,
  }
  const raw = JSON.stringify(body)
  return {
    raw,
    body,
    signature: `mac=${zaloEventMac(body.app_id, raw, body.timestamp, SECRET)}`,
  }
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
