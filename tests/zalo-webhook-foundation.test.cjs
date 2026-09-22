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

function assertPrivate(result, event) {
  const encoded = JSON.stringify(result.body) + JSON.stringify(result.diagnostic ?? {})
  assert.equal(encoded.includes(SECRET), false)
  assert.equal(encoded.includes(event.signature.slice(4)), false)
  assert.equal(encoded.includes(OA), false)
  assert.equal(encoded.includes(APP), false)
  assert.equal(encoded.includes('Local fixture'), false)
  assert.equal(result.body.error, 'INVALID_SIGNATURE')
  assert.equal(Object.prototype.hasOwnProperty.call(result.body, 'reason'), false)
}

test('missing signature is distinguished and stays rejected', async () => {
  const store = memory()
  const event = officialOaEvent()
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: null, env: ENV, record: store.record })
  assert.equal(result.status, 401)
  assert.equal(result.reason, 'SIGNATURE_HEADER_MISSING')
  assert.equal(result.diagnostic.signature_present, false)
  assert.equal(result.diagnostic.oa_identity_source, 'oa_id')
  assertPrivate(result, event)
  assert.equal(store.rows.length, 0)
})

test('bad signature header format is distinguished and stays rejected', async () => {
  const store = memory()
  const event = officialOaEvent()
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: 'sha256=abc', env: ENV, record: store.record })
  assert.equal(result.status, 401)
  assert.equal(result.reason, 'SIGNATURE_FORMAT_INVALID')
  assert.equal(result.diagnostic.signature_present, true)
  assertPrivate(result, event)
  assert.equal(store.rows.length, 0)
})

test('valid signature format with the wrong mac is distinguished', async () => {
  const store = memory()
  const event = officialOaEvent()
  const result = await acceptZaloWebhook({
    rawBody: event.raw,
    signature: `mac=${'b'.repeat(64)}`,
    env: ENV,
    record: store.record,
  })
  assert.equal(result.status, 401)
  assert.equal(result.reason, 'MAC_MISMATCH')
  assertPrivate(result, event)
  assert.equal(store.rows.length, 0)
})

test('valid mac for a different app id is distinguished', async () => {
  const store = memory()
  const event = officialOaEvent({ app_id: '999000111222' })
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  assert.equal(result.status, 401)
  assert.equal(result.reason, 'APP_ID_MISMATCH')
  assert.equal(result.diagnostic.app_id_present, true)
  assertPrivate(result, event)
  assert.equal(store.rows.length, 0)
})

test('valid mac and app with the wrong OA is distinguished', async () => {
  const store = memory()
  const event = officialOaEvent({ oa_id: '999000111' })
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
  assert.equal(result.status, 401)
  assert.equal(result.reason, 'OA_ID_MISMATCH')
  assert.equal(result.diagnostic.oa_identity_source, 'oa_id')
  assert.equal(result.diagnostic.event_name, 'user_withdraw')
  assertPrivate(result, event)
  assert.equal(store.rows.length, 0)
})

test('valid event is accepted and writes no rejection diagnostic', async () => {
  const store = memory()
  const event = officialOaEvent()
  const logs = []
  const original = console.info
  console.info = (line) => logs.push(String(line))
  try {
    const result = await acceptZaloWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, record: store.record })
    assert.equal(result.status, 200)
    assert.equal(result.reason, undefined)
    assert.equal(result.diagnostic, undefined)
    assert.equal(logs.length, 0)
    assert.equal(JSON.stringify(result.body).includes(SECRET), false)
  } finally {
    console.info = original
  }
})

test('staging rejection log contains only the safe diagnostic', async () => {
  const { logZaloRejection, zaloWebhookDiagnosticsEnabled } = loaded.exports
  const store = memory()
  const event = signed()
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: null, env: ENV, record: store.record })
  const logs = []
  const original = console.info
  console.info = (line) => logs.push(String(line))
  try {
    assert.equal(zaloWebhookDiagnosticsEnabled({}), false)
    assert.equal(zaloWebhookDiagnosticsEnabled({ VERCEL_PROJECT_PRODUCTION_URL: 'vibeacademy.vercel.app' }), false)
    assert.equal(zaloWebhookDiagnosticsEnabled({ VERCEL_PROJECT_PRODUCTION_URL: 'vibeacademy-staging.vercel.app' }), true)
    logZaloRejection(result.diagnostic)
  } finally {
    console.info = original
  }
  assert.equal(logs.length, 1)
  const logged = JSON.parse(logs[0])
  assert.deepEqual(logged, result.diagnostic)
  assert.equal(logs[0].includes(SECRET), false)
  assert.equal(logs[0].includes(OA), false)
  assert.equal(logs[0].includes(APP), false)
  assert.equal(logs[0].includes('Local fixture'), false)
  assert.equal(logged.component, 'zalo_webhook')
  assert.equal(logged.result, 'rejected')
  assert.equal(logged.reason, 'SIGNATURE_HEADER_MISSING')
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
  assert.match(route, /logZaloRejection\(result\.diagnostic\)/)
  assert.match(route, /zaloWebhookDiagnosticsEnabled\(process\.env\)/)
  assert.match(route, /NextResponse\.json\(result\.body/)
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(route, /ZALO_APP_SECRET/)
  assert.match(route, /ZALO_OA_ACCESS_TOKEN/)
  assert.match(route, /ZALO_OA_REFRESH_TOKEN/)
})

function macFixture() {
  const body = signed().body
  const raw = JSON.stringify(body, null, 2)
  const headerTimestamp = '174390853475'
  return { body, raw, headerTimestamp }
}

for (const candidate of ['official', 'header', 'reserialized']) {
  test(`MAC diagnostics distinguish ${candidate} without accepting alternate MACs`, async () => {
    const { body, raw, headerTimestamp } = macFixture()
    const signature = `mac=${zaloEventMac(APP, candidate === 'reserialized' ? JSON.stringify(body) : raw,
      candidate === 'header' ? headerTimestamp : body.timestamp, SECRET)}`
    const diagnostic = loaded.exports.diagnoseZaloMac({ appId: APP, rawBody: raw, parsedBody: body,
      bodyTimestamp: body.timestamp, headerTimestamp, oaSecret: SECRET, signature })
    assert.deepEqual(diagnostic, {
      component: 'zalo_webhook', result: 'mac_diagnostic', signature_header_present: true,
      zevent_timestamp_header_present: true, official_current_match: candidate === 'official',
      header_timestamp_match: candidate === 'header', reserialized_match: candidate === 'reserialized',
    })
    const store = memory()
    const result = await acceptZaloWebhook({ rawBody: raw, signature, headerTimestamp,
      macDiagnosticsEnabled: true, env: ENV, record: store.record })
    assert.equal(result.status, candidate === 'official' ? 200 : 401)
    assert.equal(store.rows.length, candidate === 'official' ? 1 : 0)
    assert.deepEqual(result.macDiagnostic, candidate === 'official' ? undefined : diagnostic)
    if (candidate !== 'official') assert.deepEqual(result.body, { ok: false, error: 'INVALID_SIGNATURE' })
  })
}

test('MAC diagnostics are absent for missing/malformed signatures, disabled mode, and valid signatures', async () => {
  const event = signed()
  for (const signature of [null, 'bad-format', event.signature]) {
    const result = await acceptZaloWebhook({ rawBody: event.raw, signature, macDiagnosticsEnabled: true, env: ENV, record: memory().record })
    assert.equal(result.macDiagnostic, undefined)
  }
  const result = await acceptZaloWebhook({ rawBody: event.raw, signature: 'mac=' + '0'.repeat(64), env: ENV, record: memory().record })
  assert.equal(result.status, 401)
  assert.equal(result.macDiagnostic, undefined)
})

test('route logs only the seven approved fields and preserves 401, including when an alternate matches', async () => {
  const { body, raw, headerTimestamp } = macFixture()
  const signature = `mac=${zaloEventMac(APP, raw, headerTimestamp, SECRET)}`
  for (const host of ['vibeacademy-staging.vercel.app', 'vibeacademy.vercel.app']) {
    for (const timestamp of [null, headerTimestamp]) {
      const logs = [], routeModule = { exports: {} }
      const fakeRequire = (name) => {
        if (name === '@supabase/supabase-js') return { createClient() { assert.fail('rejected request must not write') } }
        if (name === 'next/server') return { NextResponse: Response }
        if (name === '@/lib/integrations/zalo/webhook') return loaded.exports
        throw Error('unexpected dependency')
      }
      const js = ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
      new Function('module', 'exports', 'require', 'process', 'console', js)(routeModule, routeModule.exports, fakeRequire,
        { env: { ZALO_APP_ID: APP, ZALO_OA_ID: OA, ZALO_OA_SECRET_KEY: SECRET, VERCEL_PROJECT_PRODUCTION_URL: host } },
        { info: line => logs.push(line) })
      const headers = { 'x-zevent-signature': signature }
      if (timestamp !== null) headers['x-zevent-timestamp'] = timestamp
      const response = await routeModule.exports.POST(new Request('https://' + host + '/api/integrations/zalo/webhook', { method: 'POST', headers, body: raw }))
      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { ok: false, error: 'INVALID_SIGNATURE' })
      if (host === 'vibeacademy.vercel.app') { assert.deepEqual(logs, []); continue }
      assert.equal(logs.length, 1)
      assert.deepEqual(JSON.parse(logs[0]), {
        component: 'zalo_webhook', result: 'mac_diagnostic', signature_header_present: true,
        zevent_timestamp_header_present: timestamp !== null, official_current_match: false,
        header_timestamp_match: timestamp !== null, reserialized_match: false,
      })
      for (const forbidden of [SECRET, signature, signature.slice(4), raw, JSON.stringify(body), APP, OA, body.sender.id, body.message.text, headerTimestamp]) {
        assert.equal(logs[0].includes(forbidden), false)
      }
    }
  }
})
