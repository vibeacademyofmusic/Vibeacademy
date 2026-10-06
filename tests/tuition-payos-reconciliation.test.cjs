const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness } = require('./helpers/finance-operations.cjs')
const env = { PAYOS_CLIENT_ID:'mock', PAYOS_API_KEY:'mock', PAYOS_CHECKSUM_KEY:'mock', PAYOS_PUBLIC_ORIGIN:'https://app.example', NEXT_PUBLIC_APP_URL:'http://localhost:3000' }
const input = { orderCode:12345,amount:2750000,description:'HP TEST' }
const data = { id:'abcdefgh12345678',orderCode:12345,amount:2750000,amountPaid:0,amountRemaining:2750000,status:'PENDING',transactions:[] }
function setup(t, handler) {
  const h=harness(), client=h.load('../../../lib/integrations/payos/client.ts'), payos=h.load('../../../lib/integrations/tuition/renewal-payos.ts'), calls=[]
  t.mock.method(globalThis,'fetch',async (url,options) => { calls.push({ url, method:options.method || 'GET' }); return handler(client,url,options) })
  return { client,payos,calls }
}
function signed(client, value) { return Response.json({code:'00',data:value,signature:client.payosDataSignature(value,'mock')}) }
test('retry recovers signed unpaid provider order with one GET and no POST',async t => {
  const h=setup(t,client=>signed(client,data)); const result=await h.payos.openTuitionPayosCheckout(input,env)
  assert.equal(result.checkout.checkoutUrl,'https://pay.payos.vn/web/abcdefgh12345678'); assert.deepEqual(h.calls.map(c=>c.method),['GET'])
})
test('timeout after provider creation reconciles the same order without second POST',async t=>{
  const h=setup(t,(client,url,options)=>{ if(options.method==='POST') throw Error('timeout'); return signed(client,data) })
  assert.equal((await h.payos.openTuitionPayosCheckout(input,env,true)).checkout.orderCode,input.orderCode); assert.deepEqual(h.calls.map(c=>c.method),['POST','GET'])
})
test('provider query failure blocks retry instead of treating absence as permission to create',async t=>{
  const h=setup(t,()=>Response.json({code:'231' })); assert.match((await h.payos.openTuitionPayosCheckout(input,env)).error,/PAYOS_LOOKUP_231/); assert.deepEqual(h.calls.map(c=>c.method),['GET'])
})
test('tampered signed provider response cannot become a persisted checkout',async t=>{
  const h=setup(t,client=>Response.json({code:'00',data:{...data,amount:1},signature:client.payosDataSignature(data,'mock')})); assert.match((await h.payos.openTuitionPayosCheckout(input,env)).error,/PAYOS_SIGNATURE_REJECTED/)
})
test('partial payment, wrong amount and terminal orders require reconciliation, never another create',async t=>{
  let response=data; const h=setup(t,client=>signed(client,response))
  for(const changes of [{amount:1},{amountPaid:100,amountRemaining:2749900},{status:'PAID'},{status:'CANCELLED'},{orderCode:999},{transactions:[{amount:1}]}]) {
    response={...data,...changes}; assert.match((await h.payos.openTuitionPayosCheckout(input,env)).error,/PAYOS_RECONCILIATION_REQUIRED/)
  }
  assert.equal(h.calls.every(c=>c.method==='GET'),true)
})
test('return and cancel retain selected reminder safely',()=>{
  const payos=harness().load('../../../lib/integrations/tuition/renewal-payos.ts'), reminder='dea2ce6f-b45c-4ebc-a91d-0c4d3c50702f'
  const urls=payos.payosTuitionReturnUrls(env,reminder)
  assert.equal(new URL(urls.returnUrl).searchParams.get('renew'),reminder)
  assert.equal(new URL(urls.cancelUrl).searchParams.get('renew'),reminder)
  assert.equal(new URL(urls.cancelUrl).searchParams.get('payos'),'cancel')
  assert.equal(new URL(payos.payosTuitionReturnUrls(env,'bad&evil=yes').returnUrl).search,'')
})
