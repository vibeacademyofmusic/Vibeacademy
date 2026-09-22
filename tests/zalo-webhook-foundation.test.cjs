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

const { zaloBootstrapEnabled } = loaded.exports
const STAGING = { ZALO_WEBHOOK_BOOTSTRAP_MODE: 'true', VERCEL_PROJECT_PRODUCTION_URL: 'vibeacademy-staging.vercel.app' }

test('bootstrap requires literal true and the staging project hostname', () => {
  assert.equal(zaloBootstrapEnabled(STAGING), true)
  for (const flag of [undefined, 'false', 'TRUE', '1', ' true ']) {
    assert.equal(zaloBootstrapEnabled({ ...STAGING, ZALO_WEBHOOK_BOOTSTRAP_MODE: flag }), false)
  }
  for (const host of [undefined, 'vibeacademy.vercel.app', 'other.vercel.app']) {
    assert.equal(zaloBootstrapEnabled({ ...STAGING, VERCEL_PROJECT_PRODUCTION_URL: host }), false)
  }
})

for (const signature of [null, 'mac=' + 'a'.repeat(64)]) {
  test(`bootstrap false rejects ${signature ? 'invalid' : 'missing'} signature`, async () => {
    const store = memory()
    const result = await acceptZaloWebhook({ rawBody: signed().raw, signature, env: ENV, bootstrapMode: false, record: store.record })
    assert.equal(result.status, 401)
    assert.equal(store.rows.length, 0)
  })
  test(`bootstrap true acknowledges ${signature ? 'invalid' : 'missing'} signature without persistence`, async () => {
    const store = memory()
    const result = await acceptZaloWebhook({ rawBody: signed().raw, signature, env: ENV, bootstrapMode: true, record: store.record })
    assert.deepEqual(result, { status: 200, body: { ok: true, bootstrap: true, processed: false } })
    assert.equal(store.rows.length, 0)
  })
}

test('bootstrap valid signed event follows normal processing and replay is idempotent', async () => {
  const store = memory(), event = signed()
  const input = { rawBody: event.raw, signature: event.signature, env: ENV, bootstrapMode: true, record: store.record }
  const first = await acceptZaloWebhook(input)
  const replay = await acceptZaloWebhook(input)
  assert.deepEqual(first.body, { ok: true, duplicate: false, status: 'ACCEPTED' })
  assert.deepEqual(replay.body, { ok: true, duplicate: true, status: 'ACCEPTED' })
  assert.equal(store.rows.length, 1)
})

test('valid signed secret material still follows strict rejection in bootstrap mode', async () => {
  const event = signed({ access_token: 'private-fixture' })
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, bootstrapMode: true,
    record: async () => { assert.fail('must not persist') } })
  assert.equal(result.status, 400)
  assert.equal(result.body.error, 'SECRET_MATERIAL_REFUSED')
})

test('empty and non-event bootstrap probes never reach persistence', async () => {
  for (const rawBody of ['', '{}', '{', 'null']) {
    const result = await acceptZaloWebhook({ rawBody, signature: null, env: ENV, bootstrapMode: true,
      record: async () => { assert.fail('must not persist') } })
    assert.deepEqual(result.body, { ok: true, bootstrap: true, processed: false })
  }
})

test('route bootstrap creates no database client, has no network calls, and logs only safe metadata', async () => {
  const routeJs = ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }, logs = []
  const env = { ...STAGING, ZALO_APP_ID: APP, ZALO_OA_ID: OA, ZALO_OA_SECRET_KEY: SECRET }
  const fakeRequire = (name) => {
    if (name === '@supabase/supabase-js') return { createClient() { assert.fail('no DB client or business mutation allowed') } }
    if (name === 'next/server') return { NextResponse: Response }
    if (name === '@/lib/integrations/zalo/webhook') return loaded.exports
    throw new Error(`Unexpected dependency: ${name}`)
  }
  new Function('module', 'exports', 'require', 'process', 'console', 'fetch', routeJs)(module, module.exports, fakeRequire,
    { env }, { info: (entry) => logs.push(entry) }, () => assert.fail('no outbound network calls allowed'))
  for (const signature of [null, 'private-invalid-signature']) {
    const headers = { 'content-type': 'application/json' }
    if (signature) headers['x-zevent-signature'] = signature
    const response = await module.exports.POST(new Request('https://vibeacademy-staging.vercel.app/api/integrations/zalo/webhook', {
      method: 'POST', headers, body: JSON.stringify({ secret: 'private-payload' }),
    }))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true, bootstrap: true, processed: false })
  }
  assert.equal(logs.length, 2)
  for (const [index, entry] of logs.entries()) {
    assert.deepEqual(Object.keys(entry).sort(), ['event', 'httpResult', 'signaturePresent', 'timestamp'])
    assert.equal(entry.event, 'zalo_bootstrap_probe_received')
    assert.equal(entry.httpResult, 200)
    assert.equal(entry.signaturePresent, index === 1)
    assert.ok(Number.isFinite(Date.parse(entry.timestamp)))
    assert.equal(JSON.stringify(entry).includes('private'), false)
  }
})
