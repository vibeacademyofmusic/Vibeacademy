const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected, renderToStaticMarkup } = require('./helpers/finance-operations.cjs')
const input = { kind:'REGISTRATION',source_id:id(2),request_id:id(3),amount:'2750000',expected_paid:'0',cash_acknowledged:'yes',due_on:'2026-12-01',note:' Tại quầy ' }

test('cash action posts one atomic RPC and refreshes financial and registration views', async () => {
  const h=harness(), calls=[]
  h.db.rpc=async (name,args) => { calls.push({name,args});return {data:{payment_id:id(4)},error:null} }
  const url=await redirected(h.load('counter-cash/actions.ts').recordCounterCash,input)
  assert.equal(calls.length,1);assert.equal(calls[0].name,'record_counter_cash')
  assert.equal(calls[0].args.p_amount,2750000);assert.equal(calls[0].args.p_note,'Tại quầy')
  assert.equal(calls[0].args.p_cash_acknowledged,true)
  assert.equal(url.searchParams.get('cash_receipt'),id(4));assert.equal(url.searchParams.has('cash_request'),false)
  assert.ok(h.invalidated.includes('/admin/finance/receivables'))
})
test('missing physical receipt acknowledgement, decimals and hostile values never call the database', async () => {
  for (const change of [{cash_acknowledged:''},{amount:'-1'},{amount:'1.5'},{amount:'9007199254740992'},{source_id:'not-a-uuid'},{expected_paid:'NaN'},{due_on:'2026-02-30'},{kind:'OTHER'}]) {
    const h=harness();const url=await redirected(h.load('counter-cash/actions.ts').recordCounterCash,{...input,...change})
    assert.ok(url.searchParams.get('cash_error'));assert.equal(h.calls.length,0)
  }
})
test('database rejection and connection loss preserve request identity and do not claim receipt success', async () => {
  for (const error of ['CASH_STALE_BALANCE','CASH_ONLINE_ORDER_OPEN','CASH_UNAUTHORIZED','network']) {
    const h=harness();h.db.rpc=async()=>{if(error==='network')throw new Error('connection closed');return {data:null,error:{message:error}}}
    const url=await redirected(h.load('counter-cash/actions.ts').recordCounterCash,input)
    assert.equal(url.searchParams.get('cash_request'),id(3));assert.ok(url.searchParams.get('cash_error'))
    assert.equal(url.searchParams.has('cash_receipt'),false);assert.deepEqual(h.invalidated,[])
  }
})
test('cash panel presents actual balance and blocks submission when unpaid QR or permissions require review', () => {
  const panel=harness().load('counter-cash/CashCollection.tsx').default
  const props={kind:'REGISTRATION',sourceId:id(2),total:5500000,paid:2750000,threshold:2750000,allowed:true,blocked:false,today:'2026-10-29'}
  const markup=renderToStaticMarkup(panel(props))
  assert.match(markup,/<input(?=[^>]*name="amount")(?=[^>]*max="2750000")[^>]*>/)
  assert.match(markup,/name="cash_acknowledged"/)
  assert.doesNotMatch(renderToStaticMarkup(panel({...props,blocked:true})),/<form/)
  assert.doesNotMatch(renderToStaticMarkup(panel({...props,allowed:false})),/<form/)
  assert.doesNotMatch(renderToStaticMarkup(panel({...props,paid:5500000})),/<form/)
})
test('cash renewal prepares the bill without opening a provider checkout', async () => {
  const h=harness(),calls=[]
  h.db.rpc=async(name,args)=>{calls.push({name,args});return {data:name==='tuition_reminder_prepare_allowed'?true:{result:'created',case_id:id(4)},error:null}}
  const url=await redirected(h.load('../tuition/reminders/renewal-actions.ts').createTuitionRenewal,{reminder_id:id(2),collection_method:'CASH',plan_code:'VIBE_3_MONTHS',payment_option:'DEPOSIT_50',starts_on:'2026-12-01',due_on:'2026-12-15',note:''})
  assert.deepEqual(calls.map(c=>c.name),['tuition_reminder_prepare_allowed','begin_tuition_cash_renewal'])
  assert.equal(url.pathname,'/admin/tuition/reminders');assert.equal(url.searchParams.get('renew'),id(2))
  assert.ok(!h.calls.some(c=>c.table==='tuition_payos_orders'))
})
