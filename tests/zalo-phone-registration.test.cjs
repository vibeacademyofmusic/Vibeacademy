const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')

function load(file, localRequire) {
  const transpiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  new Function('module', 'exports', 'require', transpiled)(loaded, loaded.exports, localRequire)
  return loaded.exports
}

const proof = load('lib/integrations/zalo/app-secret-proof.ts', require)
const readiness = load('lib/integrations/zalo/readiness.ts', (id) => id === './app-secret-proof' ? proof : require(id))
const errors = load('lib/integrations/zalo/errors.ts', require)
const phone = load('lib/integrations/zalo/phone.ts', (id) => id === './errors' ? errors : id === './readiness' ? readiness : id === './app-secret-proof' ? proof : require(id))
const oauth = { getZaloCredential: async () => ({app_id:'123456789',oa_id:'987654321',access_token:process.env.ZALO_OA_ACCESS_TOKEN ?? 'mock',version:1}), blockCredential:async()=>{}, connectionError:()=> 'ZALO_CREDENTIAL_STORE_UNAVAILABLE' }
const dispatch = load('lib/integrations/zalo/preview-dispatch.ts', (id) => id === 'server-only' ? {} : id === './oauth' ? oauth : id === './readiness' ? readiness : id === './phone' ? phone : require(id))
const { normalizeVnPhone, maskVnPhone, sendZaloPhoneTemplate, ZALO_PHONE_TEMPLATE_URL } = phone
const { zaloAppSecretProof } = proof
const phoneEnv = { ZALO_OA_ACCESS_TOKEN: 'token', ZALO_APP_SECRET: 'app-secret' }
function expectedProof(token = 'token', secret = 'app-secret') {
  return crypto.createHmac('sha256', secret).update(token).digest('hex')
}
const { dispatchPreviewRegistrationZalo } = dispatch

const parameters = {
  customer_name: 'Phụ huynh',
  registration_code: 'DK-TEST',
  student_name: 'Học viên',
  program_name: 'Piano',
  branch_name: 'Cần Thơ',
  order_code: 'DK-TEST',
  payment_status: 'Đã nhận cọc 50%',
}

test('vietnamese phones normalize to the country-code form and mask', () => {
  assert.equal(normalizeVnPhone('0987654321'), '84987654321')
  assert.equal(normalizeVnPhone('+84 987 654 321'), '84987654321')
  assert.equal(normalizeVnPhone('84987654321'), '84987654321')
  assert.equal(normalizeVnPhone('12345'), null)
  assert.equal(normalizeVnPhone('abc0987654321'), null)
  assert.equal(normalizeVnPhone('0987654321ext1'), null)
  assert.equal(maskVnPhone('84987654321'), '8498…321')
})

test('phone sender uses msg_id and does not call without a token', async () => {
  let calls = 0
  const blocked = await sendZaloPhoneTemplate({
    jobId: 'job', phone: '0987654321', templateId: '640377', parameters, trackingId: 'abc123', registrationCompleted: true, allowlisted: true,
  }, {}, async () => { calls += 1; return { json: async () => ({}) } })
  assert.equal(blocked.state, 'ZALO_OUTBOUND_NOT_CONFIGURED')
  assert.equal(calls, 0)
  const missingSecret = await sendZaloPhoneTemplate({
    jobId: 'job', phone: '0987654321', templateId: '640377', parameters, trackingId: 'abc123', registrationCompleted: true, allowlisted: true,
  }, { ZALO_OA_ACCESS_TOKEN: 'token', ZALO_OA_SECRET_KEY: 'oa-webhook-secret' }, async () => { calls += 1; return { json: async () => ({}) } })
  assert.equal(missingSecret.state, 'ZALO_OUTBOUND_NOT_CONFIGURED')
  assert.equal(calls, 0)
  const sent = await sendZaloPhoneTemplate({
    jobId: 'job', phone: '0987654321', templateId: '640377', parameters, trackingId: 'abc123', registrationCompleted: true, allowlisted: true,
  }, phoneEnv, async (url, init) => {
    calls += 1
    assert.equal(url, ZALO_PHONE_TEMPLATE_URL)
    assert.equal(init.headers.access_token, 'token')
    assert.equal(init.headers.appsecret_proof, expectedProof())
    assert.equal(init.headers.appsecret_proof, zaloAppSecretProof('token', 'app-secret'))
    assert.notEqual(init.headers.appsecret_proof, expectedProof('token', 'oa-webhook-secret'))
    assert.equal(JSON.parse(init.body).phone, '84987654321')
    assert.equal(JSON.parse(init.body).template_data.payment_status, 'Đã nhận cọc 50%')
    assert.equal(JSON.stringify(init).includes(init.headers.appsecret_proof) && init.body.includes(init.headers.appsecret_proof), false)
    return { json: async () => ({ error: 0, data: { msg_id: 'phone-msg-1' } }) }
  })
  assert.equal(sent.state, 'ACCEPTED')
  assert.equal(sent.messageId, 'phone-msg-1')
  assert.equal(sent.delivered, false)
})

test('phone rejection, OA-only error, and timeout stay distinct', async () => {
  const env = phoneEnv
  const message = { jobId: 'job', phone: '84987654321', templateId: '640377', parameters, trackingId: 'abc123', registrationCompleted: true, allowlisted: true }
  assert.equal((await sendZaloPhoneTemplate(message, env, async () => ({ json: async () => ({ error: -124 }) }))).state, 'ZALO_TOKEN_INVALID')
  assert.equal((await sendZaloPhoneTemplate(message, env, async () => ({ json: async () => ({ error: -216 }) }))).state, 'AMBIGUOUS')
  assert.equal((await sendZaloPhoneTemplate(message, env, async () => { throw new Error('timeout') })).state, 'AMBIGUOUS')
  assert.equal((await sendZaloPhoneTemplate({ ...message, parameters: { ...parameters, payment_status: 'Sai trạng thái' } }, env, async () => { throw new Error('must-not-send') })).state, 'RECIPIENT_INELIGIBLE')
  assert.equal((await sendZaloPhoneTemplate({ ...message, parameters: { ...parameters, payment_status: 'Đã thanh toán đủ' } }, env, async () => ({ json: async () => ({ error: 0, data: { msg_id: 'full-msg' } }) }))).state, 'ACCEPTED')
})

test('unarmed gate and a failed claim make no provider call', async () => {
  let calls = 0
  const transport = async () => { calls += 1; return { json: async () => ({ error: 0, data: { msg_id: 'x' } }) } }
  const unarmed = await dispatchPreviewRegistrationZalo({ rpc: async () => ({ data: [{ decision: 'NOT_ARMED' }], error: null }) }, 1, transport)
  assert.equal(unarmed, 'NOT_ARMED')
  const claimed = await dispatchPreviewRegistrationZalo({
    rpc: async (fn) => fn === 'preview_zalo_dispatch_decision'
      ? { data: [{ decision: 'SEND', job_id: '11111111-1111-4111-8111-111111111111', provider_user_id: '84987654321', idempotency_key: 'k', parameters, delivery_channel: 'PHONE' }], error: null }
      : { data: {state:'ALREADY_ACCEPTED'}, error: null },
  }, 1, transport, phoneEnv)
  assert.equal(claimed, 'ALREADY_ACCEPTED')
  assert.equal(calls, 0)
})

test('one claimed phone job records acceptance and a timeout is not retried', async () => {
  process.env.ZALO_OA_ACCESS_TOKEN = 'test-token'
  process.env.ZALO_APP_SECRET = 'test-app-secret'
  const calls = []
  const rpcLog = []
  const admin = {
    async rpc(fn, args) {
      rpcLog.push(fn)
      if (fn === 'preview_zalo_dispatch_decision') {
        return { data: [{ decision: 'SEND', job_id: '11111111-1111-4111-8111-111111111111', provider_user_id: '84987654321', idempotency_key: 'k', parameters, delivery_channel: 'PHONE' }], error: null }
      }
      if (fn === 'authorize_zalo_registration_outbound') return {data:'STARTED',error:null}
      if (fn === 'claim_zalo_registration_attempt') return { data: rpcLog.filter(item => item === fn).length === 1 ? {state:'CLAIMED',attemptId:'attempt1',jobId:'11111111-1111-4111-8111-111111111111',phone:'84987654321',parameters} : {state:'AMBIGUOUS'}, error: null }
      return { data: args.p_message_id ? 'ACCEPTED' : 'AMBIGUOUS', error: null }
    },
  }
  const accepted = await dispatchPreviewRegistrationZalo(admin, 260000001, async (url, init) => {
    calls.push(JSON.parse(init.body).tracking_id)
    assert.equal(url, ZALO_PHONE_TEMPLATE_URL)
    assert.equal(init.headers.appsecret_proof, zaloAppSecretProof('test-token', 'test-app-secret'))
    return { json: async () => ({ error: 0, data: { msg_id: 'phone-msg-2' } }) }
  })
  assert.equal(accepted, 'ACCEPTED')
  assert.deepEqual(calls, ['11111111111141118111111111111111'])
  const again = await dispatchPreviewRegistrationZalo(admin, 260000001, async () => { throw new Error('must-not-send') })
  assert.equal(again, 'AMBIGUOUS')
  assert.equal(calls.length, 1)
  delete process.env.ZALO_OA_ACCESS_TOKEN
  delete process.env.ZALO_APP_SECRET
})


test('unknown provider responses stay ambiguous', async () => {
  const message = { jobId: 'job', phone: '84987654321', templateId: '640377', parameters, trackingId: 'abc123', registrationCompleted: true, allowlisted: true }
  for (const body of [null, {}, { error: '0' }, { error: 0, data: {} }]) {
    assert.equal((await sendZaloPhoneTemplate(message, phoneEnv, async () => ({ json: async () => body }))).state, 'AMBIGUOUS')
  }
})

test('dispatcher records safe provider codes and reports database failure', async () => {
  const old = {token:process.env.ZALO_OA_ACCESS_TOKEN,secret:process.env.ZALO_APP_SECRET}
  process.env.ZALO_OA_ACCESS_TOKEN='test'; process.env.ZALO_APP_SECRET='test'
  try {
    for (const [error,expected] of [[-124,'ZALO_TOKEN_INVALID'],[-117,'ZALO_PROVIDER_-117'],[-132,'ZALO_PROVIDER_-132']]) {
      let saved
      let failed=false
      const admin={async rpc(fn,args){
        if(fn==='preview_zalo_dispatch_decision') return {data:[{decision:'SEND',job_id:'11111111-1111-4111-8111-111111111111',provider_user_id:'84987654321',idempotency_key:'k',parameters,delivery_channel:'PHONE'}],error:null}
        if(fn==='authorize_zalo_registration_outbound')return {data:'STARTED',error:null}
        if(fn==='claim_zalo_registration_attempt')return {data:{state:'CLAIMED',attemptId:'attempt1',jobId:'11111111-1111-4111-8111-111111111111',phone:'84987654321',parameters},error:null}
        saved=args;return failed?{data:null,error:{message:'unavailable'}}:{data:'REJECTED',error:null}
      }}
      const transport=async()=>({json:async()=>({error,message:'private response not to be stored'})})
      await dispatchPreviewRegistrationZalo(admin,1,transport)
      assert.equal(saved.p_error,expected)
      assert.deepEqual(Object.keys(saved).sort(),['p_attempt','p_error','p_http','p_message_id','p_provider_error','p_state'])
      failed=true
      assert.equal(await dispatchPreviewRegistrationZalo(admin,1,transport),'ZALO_ACCEPTANCE_UNKNOWN')
    }
  } finally {
    if(old.token===undefined)delete process.env.ZALO_OA_ACCESS_TOKEN;else process.env.ZALO_OA_ACCESS_TOKEN=old.token
    if(old.secret===undefined)delete process.env.ZALO_APP_SECRET;else process.env.ZALO_APP_SECRET=old.secret
  }
})
