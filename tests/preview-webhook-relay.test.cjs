const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const test = require('node:test')
const { relayRequest } = require('../hooks-preview-relay/relay.cjs')
const { handleNodeRequest } = require('../hooks-preview-relay/handler.cjs')

function fetchOk(seen) {
  return async (url, init) => {
    seen.push({ url: String(url), body: Buffer.from(init.body).toString('utf8'), headers: init.headers, redirect: init.redirect })
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

test('relay forwards both webhook posts and preserves the raw body and signature headers', async () => {
  const seen = []
  const raw = '{"data":{"orderCode":260925102,"amount":2750000},"signature":"abc"}'
  const payos = await relayRequest(new Request('https://hooks-preview.vibe.edu.vn/api/integrations/payos/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
    body: raw,
  }), 'https://tunnel.example.test', fetchOk(seen))
  const zalo = await relayRequest(new Request('https://hooks-preview.vibe.edu.vn/api/integrations/zalo/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-zevent-signature': 'mac', 'x-zevent-timestamp': '1710000000000', 'x-zevent-server': 'ZNS' },
    body: '{"event_name":"widget_interaction_accepted"}',
  }), 'https://tunnel.example.test/', fetchOk(seen))
  assert.equal(payos.status, 200)
  assert.equal(zalo.status, 200)
  assert.equal(seen[0].body, raw)
  assert.equal(seen[0].redirect, 'manual')
  assert.equal(seen[0].headers.authorization, undefined)
  assert.equal(seen[1].headers['x-zevent-signature'], 'mac')
  assert.equal(seen[1].headers['x-zevent-timestamp'], '1710000000000')
  assert.equal(seen[1].headers['x-zevent-server'], 'ZNS')
  assert.equal(seen[1].url, 'https://tunnel.example.test/api/integrations/zalo/webhook')
})

test('relay rejects other paths and methods without calling upstream', async () => {
  let calls = 0
  const fetchImpl = async () => { calls += 1; return new Response('no') }
  const cases = [
    ['POST', '/admin'],
    ['GET', '/login'],
    ['GET', '/api/integrations/payos/webhook'],
    ['PUT', '/api/integrations/zalo/webhook'],
    ['POST', '/api/health/supabase'],
  ]
  for (const [method, path] of cases) {
    const response = await relayRequest(new Request(`https://hooks-preview.vibe.edu.vn${path}`, { method }), 'https://tunnel.example.test', fetchImpl)
    assert.equal(response.status, 404)
    assert.match(await response.text(), /PREVIEW_CALLBACK_ONLY/)
  }
  assert.equal(calls, 0)
})

test('relay rejects a missing or non-https upstream', async () => {
  const request = new Request('https://hooks-preview.vibe.edu.vn/api/integrations/zalo/webhook', { method: 'POST', body: '{}' })
  for (const upstream of [undefined, '', 'http://127.0.0.1:55321', 'not a url']) {
    const response = await relayRequest(request, upstream, async () => { throw new Error('called') })
    assert.equal(response.status, 503)
    assert.match(await response.text(), /PREVIEW_UPSTREAM_UNSET/)
  }
})

test('relay preserves an upstream failure status and reports timeout or network failure', async () => {
  const failed = await relayRequest(new Request('https://hooks-preview.vibe.edu.vn/api/integrations/payos/webhook', {
    method: 'POST',
    body: '{}',
  }), 'https://tunnel.example.test', async () => new Response('{"ok":false}', { status: 503 }))
  assert.equal(failed.status, 503)
  const timedOut = await relayRequest(new Request('https://hooks-preview.vibe.edu.vn/api/integrations/payos/webhook', {
    method: 'POST',
    body: '{}',
  }), 'https://tunnel.example.test', () => new Promise(() => {}), { timeoutMs: 20 })
  assert.equal(timedOut.status, 504)
  const dropped = await relayRequest(new Request('https://hooks-preview.vibe.edu.vn/api/integrations/zalo/webhook', {
    method: 'POST',
    body: '{}',
  }), 'https://tunnel.example.test', async () => { throw new Error('socket') })
  assert.equal(dropped.status, 502)
})

test('vercel entry keeps the raw body, disables body parsing, and does not log', async () => {
  const files = [
    'hooks-preview-relay/relay.cjs',
    'hooks-preview-relay/handler.cjs',
    'hooks-preview-relay/api/integrations/payos/webhook.js',
    'hooks-preview-relay/api/integrations/zalo/webhook.js',
  ]
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    assert.equal(source.includes('console.'), false)
    for (const secret of ['SUPABASE', 'PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY', 'ZALO_OA_']) {
      assert.equal(source.includes(secret), false)
    }
  }
  assert.match(fs.readFileSync('hooks-preview-relay/api/integrations/payos/webhook.js', 'utf8'), /bodyParser: false/)
  const seen = []
  const req = {
    method: 'POST',
    url: '/api/integrations/zalo/webhook',
    headers: { host: 'hooks-preview.vibe.edu.vn', 'content-type': 'application/json', 'x-zevent-signature': 'mac', 'x-zevent-server': 'ZNS' },
    async *[Symbol.asyncIterator]() { yield Buffer.from('{"event_name":"widget_interaction_accepted"}') },
  }
  const res = { statusCode: 0, headers: {}, setHeader(name, value) { this.headers[name] = value }, end(body) { this.body = body } }
  await handleNodeRequest(req, res, { PREVIEW_WEBHOOK_UPSTREAM: 'https://tunnel.example.test' }, fetchOk(seen))
  assert.equal(res.statusCode, 200)
  assert.equal(seen[0].body, '{"event_name":"widget_interaction_accepted"}')
  assert.equal(seen[0].headers['x-zevent-signature'], 'mac')
  assert.equal(seen[0].headers['x-zevent-server'], 'ZNS')
})

test('exact Zalo verifier file is served before the catch-all', async () => {
  const file = 'hooks-preview-relay/zalo_verifierKlcQC8Z773rCw98af_mUELp-p0smY1TJD3Ks.html'
  const bytes = fs.readFileSync(file)
  assert.equal(bytes.length, 233)
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), '72d04062810677c5f9e54886b66174ae6d7a2c7d099f71d55eaf95d05b54693a')
  const routing = JSON.parse(fs.readFileSync('hooks-preview-relay/vercel.json', 'utf8'))
  assert.equal(routing.rewrites[0].source, '/zalo_verifierKlcQC8Z773rCw98af_mUELp-p0smY1TJD3Ks.html')
  assert.equal(routing.rewrites[1].destination, '/api/blocked')
  assert.equal(JSON.stringify(routing).includes('*.html'), false)
  const handler = require('../hooks-preview-relay/api/zalo-verifier.js')
  async function call(method) {
    const res = { statusCode: 0, headers: {}, setHeader(name, value) { this.headers[name] = value }, end(body) { this.body = body } }
    await handler({ method }, res)
    return res
  }
  const get = await call('GET')
  const head = await call('HEAD')
  const post = await call('POST')
  assert.equal(get.statusCode, 200)
  assert.equal(crypto.createHash('sha256').update(get.body).digest('hex'), '72d04062810677c5f9e54886b66174ae6d7a2c7d099f71d55eaf95d05b54693a')
  assert.equal(head.statusCode, 200)
  assert.equal(head.body, undefined)
  assert.equal(post.statusCode, 404)
  assert.match(String(post.body), /PREVIEW_CALLBACK_ONLY/)
})
