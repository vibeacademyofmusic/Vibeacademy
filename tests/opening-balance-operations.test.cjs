/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected, fixture, render, renderToStaticMarkup } = require('./helpers/finance-operations.cjs')
test('opening correction submits target value only; database owns delta and approval', async () => {
 const h=harness()
 await redirected(h.load('receivables/actions.ts').correctOpening,{opening_receivable_id:id(1),corrected_amount:'0',reason:'Correct baseline',confirm:'yes',idempotency_key:id(2),delta:'999',status:'POSTED'})
 assert.equal(h.calls.at(-1).args.p_operation,'OPENING_RECEIVABLE_CORRECTION')
 assert.equal(h.calls.at(-1).args.p_target_id,id(1))
 assert.deepEqual(h.calls.at(-1).args.p_details,{corrected_amount:'0'})
})
test('opening correction rejects invalid values before financial mutation', async () => {
 for(const corrected_amount of ['-1','NaN','1.234','1e5','']) {
  const h=harness()
  await redirected(h.load('receivables/actions.ts').correctOpening,{opening_receivable_id:id(1),corrected_amount,reason:'Correct baseline',confirm:'yes',idempotency_key:id(2)})
  assert.ok(h.calls.every(c=>c.rpc==='has_role'))
 }
})
test('opening allocation delegates to existing payment allocation RPC extension', async () => {
 const h=harness()
 await redirected(h.load('payments/actions.ts').allocateOpeningPayment,{payment_id:id(1),opening_receivable_id:id(2),amount:'1000000',invoice_id:id(3)})
 assert.deepEqual(h.calls.at(-1),{rpc:'allocate_payment_to_opening',args:{p_payment_id:id(1),p_opening_receivable_id:id(2),p_amount:'1000000'}})
})
test('refund page renders opening allocation without an invoice relationship', async () => {
 const data=fixture();data.payment_allocations[0].invoice_id=null;data.payment_allocations[0].invoices=null;data.payment_allocations[0].opening_receivable_id=id(70)
 const html=await render(harness(data),'refunds',{payment:id(4)})
 assert.match(html,/Công nợ mở sổ/);assert.doesNotMatch(html,/Không thể tải/)
})
test('opening approval displays original, previous, corrected and delta separately',async()=>{
 const request={id:id(7),operation:'OPENING_RECEIVABLE_CORRECTION',target_id:id(8),status:'PENDING_APPROVAL',maker_user_id:id(1),details:{corrected_amount:6000000},source_snapshot:{currency:'VND',original_amount:5500000,old_amount:5750000,corrected_amount:6000000,delta:250000,source_reference:'LEGACY-ROW-1',migration_batch_id:id(9)},created_at:'2026-09-16T00:00:00Z'}
 const h=harness({financial_approval_requests:[request]})
 const html=renderToStaticMarkup(await h.load('../../finance/page.tsx').default({searchParams:Promise.resolve({selected:id(7)})}))
 for(const text of ['5.500.000','5.750.000','6.000.000','250.000','LEGACY-ROW-1','không tạo thu tiền'])assert.ok(html.includes(text),text)
})
