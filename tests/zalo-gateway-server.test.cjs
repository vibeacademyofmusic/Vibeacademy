const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const { processWebhook, openStore, readForwardEnv, forwardPending } = require('../scripts/zalo/gateway-server.js')

const APP = '1355275380325944240'
const OA = '4520912928458797082'
const SECRET = 'fixture-oa-secret-not-real'
const ENV = { appId: APP, oaId: OA, oaSecret: SECRET }

function mac(raw, timestamp) {
  return crypto.createHash('sha256').update(`${APP}${raw}${timestamp}${SECRET}`, 'utf8').digest('hex')
}

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
  return { raw, signature: `mac=${mac(raw, body.timestamp)}` }
}

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-gateway-'))
  return openStore(path.join(dir, 'events.db'))
}

test('unsigned, bad signature, and malformed bodies are rejected and not stored', () => {
  const store = tempStore()
  const event = signed()
  assert.equal(processWebhook({ rawBody: event.raw, signature: null, env: ENV, store }).status, 401)
  assert.equal(processWebhook({
    rawBody: event.raw,
    signature: `mac=${'ab'.repeat(32)}`,
    env: ENV,
    store,
  }).body.error, 'INVALID_SIGNATURE')
  assert.equal(processWebhook({ rawBody: '{', signature: event.signature, env: ENV, store }).status, 400)
  assert.equal(processWebhook({ rawBody: '', signature: null, env: ENV, store }).status, 400)
})

test('Zalo console sample is acknowledged without a stored reply', () => {
  const store = tempStore()
  const sample = signed({
    sender: { id: '111111111111111111' },
    recipient: { id: '222222222222222222' },
    message: { msg_id: 'This is message id', text: 'This is testing message' },
  })
  const result = processWebhook({ rawBody: sample.raw, signature: sample.signature, env: ENV, store })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { ok: true, status: 'VERIFICATION' })
  const again = processWebhook({ rawBody: sample.raw, signature: sample.signature, env: ENV, store })
  assert.equal(again.status, 200)
  assert.equal(again.body.duplicate, undefined)
})

test('a signed click is stored once, acknowledged quickly, and queued for upstream delivery', () => {
  const store = tempStore()
  const click = signed({
    event_name: 'user_click_response_button',
    oa_id: OA,
    message: { tracking_id: 'tracking-fixture', data: 'Tiếp tục học', submit_time: '1790798177156' },
    msg_id: '808932e81f53670a3e45',
  })
  const first = processWebhook({ rawBody: click.raw, signature: click.signature, env: ENV, store })
  const second = processWebhook({ rawBody: click.raw, signature: click.signature, env: ENV, store })
  assert.equal(first.status, 200)
  assert.equal(first.body.queued, true)
  assert.equal(second.status, 200)
  assert.equal(second.body.duplicate, true)
  assert.equal(store.pending().length, 1)
})

test('an unsupported signed event is stored and acknowledged once', () => {
  const store = tempStore()
  const event = signed({ event_name: 'user_feedback' })
  const result = processWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, store })
  assert.equal(result.status, 200)
  assert.equal(result.body.status, 'UNSUPPORTED')
  const duplicate = processWebhook({ rawBody: event.raw, signature: event.signature, env: ENV, store })
  assert.equal(duplicate.body.duplicate, true)
})

test('a store failure does not acknowledge success', () => {
  const event = signed()
  const result = processWebhook({
    rawBody: event.raw,
    signature: event.signature,
    env: ENV,
    store: { save() { throw new Error('disk') } },
  })
  assert.equal(result.status, 500)
  assert.equal(result.body.error, 'WEBHOOK_NOT_RECORDED')
})

test('gateway forwards queued raw events without embedding a live upstream or secret', async () => {
  const store = tempStore()
  const click = signed({
    event_name: 'user_click_response_button',
    oa_id: OA,
    message: { tracking_id: 'tracking-forward', data: 'Tiếp tục học', submit_time: '1790798177156' },
    msg_id: '808932e81f53670a3e46',
  })
  processWebhook({ rawBody: click.raw, signature: click.signature, serverHeader: 'ZBS', env: ENV, store })
  const calls = []
  const forwardEnv = readForwardEnv({ GATEWAY_UPSTREAM_URL: 'https://staging.example.test/api/integrations/zalo/webhook' })
  const result = await forwardPending(store, forwardEnv, async (url, init) => {
    calls.push({ url, init })
    return { ok: true, status: 200 }
  })
  assert.equal(result.forwarded, 1)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://staging.example.test/api/integrations/zalo/webhook')
  assert.equal(calls[0].init.body, click.raw)
  assert.equal(calls[0].init.headers['x-zevent-signature'], click.signature)
  assert.equal(calls[0].init.headers['x-zevent-server'], 'ZBS')
  assert.equal(store.pending().length, 0)
  const source = fs.readFileSync('scripts/zalo/gateway-server.js', 'utf8')
  assert.equal(source.includes('staging.vibe.edu.vn'), false)
  assert.equal(source.includes(SECRET), false)
})

test('failed upstream delivery stays queued with retry metadata', async () => {
  const store = tempStore()
  const click = signed({
    event_name: 'user_click_response_button',
    oa_id: OA,
    message: { tracking_id: 'tracking-retry', data: 'Liên hệ', submit_time: '1790798177157' },
    msg_id: '808932e81f53670a3e47',
  })
  processWebhook({ rawBody: click.raw, signature: click.signature, env: ENV, store })
  const forwardEnv = readForwardEnv({ GATEWAY_UPSTREAM_URL: 'https://staging.example.test/api/integrations/zalo/webhook' })
  const result = await forwardPending(store, forwardEnv, async () => ({ ok: false, status: 503 }))
  assert.equal(result.failed, 1)
  assert.equal(store.pending().length, 0)
  const later = new Date(Date.now() + 10_000).toISOString()
  assert.equal(store.pending(20, later).length, 1)
})
