const { test } = require('node:test')
const assert = require('node:assert/strict')
const ts = require('typescript')
const { readFileSync } = require('node:fs')
const { harness, id, redirected } = require('./helpers/finance-operations.cjs')
const url = 'https://pay.payos.vn/web/abcdefgh12345678'
function setup({ authorized = true, state = 'RESERVED', persistenceError = null, checkoutError = null } = {}) {
  const fixtures = { tuition_renewal_cases: [{ id: id(2), reminder_id: id(3), branch_id: id(4) }], tuition_payos_orders: [{ case_id: id(2), order_code: 12345, amount: 2750000, description: 'HP TEST', state, payment_link_id: state === 'PENDING' ? 'abcdefgh12345678' : null, checkout_url: state === 'PENDING' ? url : null }] }
  const h = harness(fixtures)
  let providerCalls = [], serviceCalls = 0
  h.db.rpc = async (name, args) => {
    h.calls.push({ rpc: name, args })
    if (name === 'begin_tuition_renewal') return { data: { case_id: id(2), result: 'created' } }
    if (name === 'has_permission') return { data: authorized }
    throw Error('Notice unavailable')
  }
  const mocks = {
    './dialog-context': harness().load('../tuition/reminders/dialog-context.ts'),
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect(target) { throw Object.assign(Error('redirect'), { url: target }) } },
    '../../finance/operations': { signedInClient: async () => h.db, uuidPattern: /^[a-f0-9-]{36}$/ },
    '@/lib/integrations/tuition/checkout-link': harness().load('../../../lib/integrations/tuition/checkout-link.ts'),
    '@/lib/integrations/tuition/renewal-status': { PAYMENT_TEMPLATE_REQUEST: 'TEMPLATE' },
    '@/lib/integrations/tuition/payment-zbs': {},
    '@/lib/integrations/tuition/renewal-payos': { async openTuitionPayosCheckout(input, env, fresh) {
      providerCalls.push({ input, fresh })
      return checkoutError ? { error: checkoutError } : { checkout: { ...input, paymentLinkId: 'abcdefgh12345678', checkoutUrl: url, qrCode: '' } }
    } },
    '@supabase/supabase-js': { createClient: () => ({ rpc: async () => {
      serviceCalls++
      if (persistenceError) return { error: persistenceError }
      Object.assign(fixtures.tuition_payos_orders[0], { state: 'PENDING', payment_link_id: 'abcdefgh12345678', checkout_url: url })
      return { data: 'ACTIVATED' }
    } }) },
  }
  const code = ts.transpileModule(readFileSync('app/admin/tuition/reminders/renewal-actions.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const mod = { exports: {} }
  new Function('require','module','exports',code)(name => { assert.ok(name in mocks, name); return mocks[name] }, mod, mod.exports)
  return { actions: mod.exports, providerCalls, serviceCount: () => serviceCalls, h }
}
const values = { reminder_id: id(3), plan_code: 'VIBE_3_MONTHS', payment_option: 'DEPOSIT_50', starts_on: '2026-11-01', due_on: '2026-10-31' }
test('fresh checkout persists then redirects to provider despite notice failure', async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock'
  try {
    const h = setup(); assert.equal((await redirected(h.actions.createTuitionRenewal,values)).href,url)
    assert.equal(h.serviceCount(),1); assert.equal(h.providerCalls[0].fresh,true)
  } finally { if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl; if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey }
})
test('persisted pending link reopens without provider creation',async () => {
  const h=setup({state:'PENDING'}); assert.equal((await redirected(h.actions.retryTuitionPayos,{case_id:id(2)})).href,url); assert.equal(h.providerCalls.length,0); assert.equal(h.serviceCount(),0)
})
test('branch denial prevents all provider and service activity',async () => {
  const h=setup({authorized:false}); const result=await redirected(h.actions.retryTuitionPayos,{case_id:id(2)}); assert.equal(result.searchParams.get('renew'),id(3)); assert.match(result.searchParams.get('error'),/không có quyền/); assert.equal(h.providerCalls.length,0); assert.equal(h.serviceCount(),0)
})
test('ambiguous retry reconciles existing order, preserves selected case on actionable failure',async () => {
  const h=setup({checkoutError:'PAYOS_HTTP_503: cần đối chiếu'}); const result=await redirected(h.actions.retryTuitionPayos,{case_id:id(2)}); assert.equal(result.searchParams.get('renew'),id(3)); assert.match(result.searchParams.get('error'),/PAYOS_HTTP_503/); assert.equal(h.providerCalls[0].fresh,false); assert.equal(h.serviceCount(),0)
})
test('submitted price is rejected before renewal mutation',async () => {
  const h=setup(); const result=await redirected(h.actions.createTuitionRenewal,{...values,amount_due:1}); assert.equal(result.searchParams.get('renew'),id(3)); assert.equal(h.h.calls.length,0)
})
test('untrusted checkout URLs cannot be opened',() => {
  const links=harness().load('../../../lib/integrations/tuition/checkout-link.ts'); assert.equal(links.tuitionCheckoutUrl('abcdefgh12345678',url),url)
  for (const bad of ['javascript:alert(1)',url+'?redirect=evil','https://pay.payos.vn.evil/web/abcdefgh12345678',url.replace('abcdefgh12345678','differentid')]) assert.equal(links.tuitionCheckoutUrl('abcdefgh12345678',bad),null)
})
test('persistence failure retains selected case and never opens provider URL',async () => {
  const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'; process.env.SUPABASE_SERVICE_ROLE_KEY='mock'
  try {
    const h=setup({persistenceError:{code:'P0001'}}); const result=await redirected(h.actions.createTuitionRenewal,values)
    assert.equal(result.pathname,'/admin/tuition/reminders'); assert.equal(result.searchParams.get('renew'),id(3)); assert.match(result.searchParams.get('error'),/P0001/); assert.equal(h.serviceCount(),1)
  } finally { if(oldUrl===undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl; if(oldKey===undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey }
})
