const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file) {
  const cache = new Map()
  function read(target) {
    target = path.resolve(target)
    if (cache.has(target)) return cache.get(target)
    const loaded = { exports: {} }
    cache.set(target, loaded.exports)
    const code = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const localRequire = (name) => {
      if (name === 'server-only') return {}
      if (!name.startsWith('.')) return require(name)
      const next = path.resolve(path.dirname(target), name)
      return read(fs.existsSync(next + '.ts') ? next + '.ts' : next)
    }
    new Function('exports', 'require', 'module', code)(loaded.exports, localRequire, loaded)
    return loaded.exports
  }
  return read(file)
}

const send = load('lib/integrations/zalo/tuition-test-send.ts')
const exact = {
  studentCode: 'TEST-ZALO-HP',
  phone: '0900000918',
  templateId: '645192',
  trackingId: 'abc123',
  eventCode: 'RENEWAL_V1',
  parameters: { ...send.TUITION_TEST_PARAMETERS },
}
const armed = { ZALO_TUITION_TEST_SEND: 'TEST-ZALO-HP', ZALO_APP_SECRET: 'secret' }
const credential = async () => ({ access_token: 'token', expires_at: new Date(Date.now() + 3600000).toISOString(), state: 'READY' })

function transport(steps) {
  const calls = []
  return {
    calls,
    async transport(url, init) {
      calls.push({ url, method: init.method, body: init.body })
      const step = steps[calls.length - 1]
      if (!step) throw new Error('unexpected call')
      if (step.throw) throw new Error('timeout')
      return { status: step.status ?? 200, json: async () => step.json }
    },
  }
}

test('other recipients, templates, and an unarmed process never call Zalo', async () => {
  const blocked = transport([])
  assert.equal((await send.sendAuthorizedTuitionTest(exact, {}, { transport: blocked.transport, readCredential: credential })).state, 'BLOCKED')
  assert.equal((await send.sendAuthorizedTuitionTest({ ...exact, studentCode: 'OTHER' }, armed, { transport: blocked.transport, readCredential: credential })).state, 'BLOCKED')
  assert.equal((await send.sendAuthorizedTuitionTest({ ...exact, templateId: '640377' }, armed, { transport: blocked.transport, readCredential: credential })).state, 'BLOCKED')
  assert.equal((await send.sendAuthorizedTuitionTest({ ...exact, eventCode: 'BALANCE_50_V1' }, armed, { transport: blocked.transport, readCredential: credential })).state, 'BLOCKED')
  assert.equal((await send.sendAuthorizedTuitionTest({ ...exact, phone: '0900000111' }, armed, { transport: blocked.transport, readCredential: credential })).state, 'BLOCKED')
  assert.equal((await send.sendAuthorizedTuitionTest({ ...exact, parameters: { ...exact.parameters, amount: '1' } }, armed, { transport: blocked.transport, readCredential: credential })).state, 'BLOCKED')
  assert.equal(blocked.calls.length, 0)
})

test('the authorized notice is posted once and acceptance is not delivery', async () => {
  const mock = transport([
    { json: { error: 0, data: { status: 'ENABLE', templateId: 645192 } } },
    { json: { error: 0, data: { msg_id: 'msg-test-1' } } },
  ])
  const result = await send.sendAuthorizedTuitionTest(exact, armed, { transport: mock.transport, readCredential: credential })
  assert.deepEqual(result, { state: 'ACCEPTED', messageId: 'msg-test-1', delivered: false, providerError: 0, httpStatus: 200 })
  assert.equal(mock.calls.length, 2)
  assert.equal(mock.calls[1].method, 'POST')
  const body = JSON.parse(mock.calls[1].body)
  assert.equal(body.template_id, '645192')
  assert.equal(body.phone, '84900000918')
  assert.deepEqual(body.template_data, send.TUITION_TEST_PARAMETERS)
  assert.equal(body.tracking_id, 'abc123')
})

test('a timeout after the template check is not posted again', async () => {
  const mock = transport([
    { json: { error: 0, data: { status: 'ENABLE', templateId: 645192 } } },
    { throw: true },
  ])
  const result = await send.sendAuthorizedTuitionTest(exact, armed, { transport: mock.transport, readCredential: credential })
  assert.equal(result.state, 'AMBIGUOUS')
  assert.equal(mock.calls.filter(call => call.method === 'POST').length, 1)
})

test('manual send stays closed until ZALO_PILOT_OUTBOUND is enabled and posts the notice once', async () => {
  const notice = {
    studentCode: 'RUA-CON',
    phone: '0907507918',
    templateId: '645192',
    trackingId: 'trackmanual1',
    eventCode: 'RENEWAL_V1',
    parameters: {
      student_name: 'Rùa con',
      student_code: 'RUA-CON',
      days_left: '3',
      period: '29/07/2026-28/10/2026',
      amount: '5500000',
      due_date: '28102026',
    },
  }
  const closed = transport([])
  assert.equal((await send.sendManualTuitionZalo(notice, { ZALO_APP_SECRET: 'secret' }, { transport: closed.transport, readCredential: credential })).state, 'BLOCKED')
  assert.equal((await send.sendManualTuitionZalo({ ...notice, templateId: '640377' }, { ZALO_PILOT_OUTBOUND: 'enabled', ZALO_APP_SECRET: 'secret' }, { transport: closed.transport, readCredential: credential })).state, 'BLOCKED')
  assert.equal(closed.calls.length, 0)
  const mock = transport([
    { json: { error: 0, data: { status: 'ENABLE', templateId: 645192 } } },
    { json: { error: 0, data: { msg_id: 'msg-manual-1' } } },
  ])
  const result = await send.sendManualTuitionZalo(notice, { ZALO_PILOT_OUTBOUND: 'enabled', ZALO_APP_SECRET: 'secret' }, { transport: mock.transport, readCredential: credential })
  assert.equal(result.state, 'ACCEPTED')
  assert.equal(result.delivered, false)
  assert.equal(JSON.parse(mock.calls[1].body).template_data.student_name, 'Rùa con')
  assert.equal(JSON.parse(mock.calls[1].body).template_id, '645192')
  const timedOut = transport([
    { json: { error: 0, data: { status: 'ENABLE', templateId: 645192 } } },
    { throw: true },
  ])
  assert.equal((await send.sendManualTuitionZalo(notice, { ZALO_PILOT_OUTBOUND: 'enabled', ZALO_APP_SECRET: 'secret' }, { transport: timedOut.transport, readCredential: credential })).state, 'AMBIGUOUS')
})

test('a disabled template is not sent', async () => {
  const mock = transport([{ json: { error: 0, data: { status: 'PENDING', templateId: 645192 } } }])
  const result = await send.sendAuthorizedTuitionTest(exact, armed, { transport: mock.transport, readCredential: credential })
  assert.equal(result.state, 'TEMPLATE_NOT_ENABLED')
  assert.equal(mock.calls.some(call => call.method === 'POST'), false)
})

test('invalid appsecret_proof never rotates credentials or posts a message', async () => {
  let refreshes=0, posts=0
  const result=await send.sendAuthorizedTuitionTest(exact,armed,{
    readCredential:credential,
    refreshCredential:async()=>{refreshes++;return credential()},
    transport:async(url,init)=>{if(init.method==='POST')posts++;return {status:200,json:async()=>({error:-1241,message:'Invalid appsecret_proof'})}},
  })
  assert.equal(result.state,'ZALO_PROOF_INVALID')
  assert.equal(refreshes,0)
  assert.equal(posts,0)
})
