/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');const assert=require('node:assert/strict')
const {harness,id,redirected,fixture,render}=require('./helpers/finance-operations.cjs')
test('credit application passes only approved target and amount, never client owner or balance',async()=>{
 const h=harness();await redirected(h.load('credits/actions.ts').applyCredit,{credit_id:id(1),obligation:'invoice:'+id(2),amount:'400000',reason:'Future invoice',confirm:'yes',idempotency_key:id(3),student_id:id(4),remaining_credit:'999999'})
 assert.deepEqual(h.calls.at(-1).args.p_details,{amount:'400000',invoice_id:id(2)});assert.equal(h.calls.at(-1).args.p_target_id,id(1));assert.equal(h.calls.at(-1).args.p_operation,'APPLY_CUSTOMER_CREDIT')
})
test('credit application rejects forged obligation kinds IDs and negative amounts',async()=>{
 for(const change of [{obligation:'student:'+id(2)},{obligation:'invoice:invalid'},{obligation:'invoice:'+id(2)+':extra'},{amount:'-1'}]){
  const h=harness();await redirected(h.load('credits/actions.ts').applyCredit,{credit_id:id(1),obligation:'invoice:'+id(2),amount:'100',reason:'Apply',confirm:'yes',idempotency_key:id(3),...change});assert.ok(h.calls.every(c=>c.rpc==='has_role'))
 }
})
test('credit refund uses financial approval with Vietnam actual refund time',async()=>{
 const h=harness();await redirected(h.load('credits/actions.ts').refundCredit,{credit_id:id(1),amount:'200000',refunded_at:'2026-09-16T10:00',reason:'Refund unused credit',confirm:'yes',idempotency_key:id(3)})
 assert.equal(h.calls.at(-1).args.p_operation,'REFUND_CUSTOMER_CREDIT');assert.deepEqual(h.calls.at(-1).args.p_details,{amount:'200000',refunded_at:'2026-09-16T10:00:00+07:00'})
})
test('credit refund UI cannot offer duplicate allocation into a receivable',async()=>{
 const f=fixture();f.refunds=[{id:id(6),payment_id:id(4),amount:100,currency:'VND',status:'POSTED',refunded_at:'2026-09-16T00:00:00Z',payments:{payment_number:'PAY-TEST'}}];f.customer_credit_uses=[{id:id(70),credit_id:id(71),refund_id:f.refunds[0].id,amount:100}]
 const html=await render(harness(f),'refunds',{selected:f.refunds[0].id})
 assert.match(html,/credit/);assert.doesNotMatch(html,/name="payment_allocation_id"/)
})
test('payment effective allocation total subtracts released credit without changing originals',async()=>{
 const h=harness();const fn=h.load('payments/data.ts').effectiveAllocationTotal
 const a=[{amount:4000000,released_to_credit:1000000},{amount:400000}]
 assert.equal(fn(a),3400000);assert.equal(a[0].amount,4000000)
})
test('credit detail renders remaining liability and explicit approval forms',async()=>{
 const credit={id:id(1),student_id:id(2),branch_id:id(3),payment_id:id(4),currency:'VND',amount:1000000,applied_amount:400000,refunded_amount:200000,remaining_credit:400000,created_at:'2026-09-16T00:00:00Z'}
 const h=harness({customer_credit_balances:[credit],students:[{id:id(2),full_name:'Credit learner',student_code:'CR1'}]})
 const html=await render(h,'credits',{selected:id(1)})
 assert.match(html,/400\.000/);assert.match(html,/name="credit_id"/);assert.match(html,/name="idempotency_key"/);assert.match(html,/Credit learner/)
})
