/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {harness,id,redirected,renderToStaticMarkup}=require('./helpers/finance-operations.cjs')
const base='../../finance/'
test('financial request carries idempotency and target but no client maker or approved status',async()=>{
 const h=harness()
 await redirected(h.load(base+'actions.ts').requestAction,{operation:'REFUND',payment_id:id(1),amount:'20',refunded_at:'2026-09-16T08:00',reason:'Test refund',confirm:'yes',idempotency_key:id(2),maker_user_id:id(3),status:'POSTED'})
 const call=h.calls.at(-1)
 assert.equal(call.rpc,'request_financial_action');assert.equal(call.args.p_operation,'REFUND')
 assert.deepEqual(call.args.p_details,{amount:'20',refunded_at:'2026-09-16T08:00:00+07:00',notes:null})
 assert.equal(call.args.p_idempotency_key,id(2));assert.equal(call.args.maker_user_id,undefined)
})
test('correction sends corrected value and original line; database alone calculates delta',async()=>{
 const h=harness()
 await redirected(h.load(base+'actions.ts').requestAction,{operation:'PAYROLL_CORRECTION',payroll_id:id(1),source_line:'earning:'+id(3),corrected_amount:'0',run_type:'NEXT_OPEN_PERIOD',reason:'Reverse original error',confirm:'yes',idempotency_key:id(2),delta:99999})
 assert.deepEqual(h.calls.at(-1).args.p_details,{corrected_amount:'0',run_type:'NEXT_OPEN_PERIOD',earning_id:id(3)})
})
test('invalid correction identifiers amounts and run types are rejected before mutation',async()=>{
 for(const change of [{source_line:'earning:bad'},{corrected_amount:'NaN'},{corrected_amount:'1.234'},{run_type:'REOPEN'},{idempotency_key:''}]) {
  const h=harness()
  await redirected(h.load(base+'actions.ts').requestAction,{operation:'PAYROLL_CORRECTION',payroll_id:id(1),source_line:'earning:'+id(3),corrected_amount:'100',run_type:'NEXT_OPEN_PERIOD',reason:'Correction',confirm:'yes',idempotency_key:id(2),...change})
  assert.ok(h.calls.every(c=>['has_role','is_global_super_admin'].includes(c.rpc)))
 }
})
test('normal approval never auto-overrides and accepts no client approver',async()=>{
 const h=harness()
 await redirected(h.load(base+'actions.ts').reviewAction,{request_id:id(1),action:'approve',note:'Reviewed',confirm:'yes',approver_user_id:id(9)})
 assert.deepEqual(h.calls.at(-1),{rpc:'approve_financial_action',args:{p_request_id:id(1),p_note:'Reviewed',p_override_type:null,p_override_reason:null}})
})
test('invalid emergency override is blocked and explicit override reason reaches RPC',async()=>{
 const h=harness(),action=h.load(base+'actions.ts').reviewAction
 const form={request_id:id(1),action:'approve',note:'Reviewed',confirm:'yes',override_type:'MAKER_CHECKER_EMERGENCY'}
 await redirected(action,form);assert.ok(h.calls.every(c=>['has_role','is_global_super_admin'].includes(c.rpc)))
 await redirected(action,{...form,override_reason:'Documented urgent exception'})
 assert.equal(h.calls.at(-1).args.p_override_reason,'Documented urgent exception')
})
test('cancel uses separate RPC and cannot carry an approval override',async()=>{
 const h=harness();await redirected(h.load(base+'actions.ts').reviewAction,{request_id:id(1),action:'cancel',note:'Replace request',confirm:'yes'})
 assert.deepEqual(h.calls.at(-1),{rpc:'cancel_financial_action',args:{p_request_id:id(1),p_reason:'Replace request'}})
})
test('unauthorized finance workspace actions stop before financial RPC',async()=>{
 const h=harness({},null,false)
 const result=await redirected(h.load(base+'actions.ts').reviewAction,{request_id:id(1),action:'approve',note:'Reviewed',confirm:'yes'})
 assert.equal(result.pathname,'/login');assert.ok(h.calls.every(c=>['has_role','is_global_super_admin'].includes(c.rpc)))
})
test('pending own request displays source amounts and maker warning',async()=>{
 const request={id:id(7),operation:'REFUND',target_id:id(8),branch_id:id(9),reason:'Approved workflow test',status:'PENDING_APPROVAL',maker_user_id:id(1),approver_user_id:null,created_at:'2026-09-16T00:00:00Z',details:{amount:100},source_snapshot:{payment_number:'PAY-ORIGINAL',amount:1000,currency:'VND'},result_id:null}
 const h=harness({financial_approval_requests:[request]})
 const html=renderToStaticMarkup(await h.load(base+'page.tsx').default({searchParams:Promise.resolve({selected:id(7)})}))
 for(const value of ['PAY-ORIGINAL','1.000','100','Bạn là người lập','name="idempotency_key"'])assert.ok(html.includes(value),value)
})
test('posted correction displays immutable source and computed delta with no review form',async()=>{
 const request={id:id(7),operation:'PAYROLL_CORRECTION',target_id:id(8),branch_id:id(9),reason:'Correction test',status:'POSTED',maker_user_id:id(1),approver_user_id:id(2),created_at:'2026-09-16T00:00:00Z',details:{run_type:'OFF_CYCLE_CORRECTION'},source_snapshot:{payroll:{teacher_name:'Original teacher',currency:'VND'},original_amount:1000,corrected_amount:900,delta:-100},result_id:id(7)}
 const h=harness({financial_approval_requests:[request]})
 const html=renderToStaticMarkup(await h.load(base+'page.tsx').default({searchParams:Promise.resolve({selected:id(7)})}))
 assert.match(html,/Bảng lương gốc được giữ nguyên/);assert.match(html,/Đợt correction khẩn cấp riêng/);assert.doesNotMatch(html,/name="request_id"/)
})
test('issued invoice cancellation requests approval; forged draft status still calls guarded legacy RPC',async()=>{
 const h=harness()
 await redirected(h.load('invoices/actions.ts').cancelInvoice,{invoice_id:id(1),invoice_status:'ISSUED',reason:'Wrong issued invoice',confirm:'yes',idempotency_key:id(2)})
 assert.equal(h.calls.at(-1).rpc,'request_financial_action');assert.equal(h.calls.at(-1).args.p_operation,'CANCEL_INVOICE')
 await redirected(h.load('invoices/actions.ts').cancelInvoice,{invoice_id:id(1),invoice_status:'DRAFT',reason:'Draft only',confirm:'yes'})
 assert.equal(h.calls.at(-1).rpc,'cancel_invoice')
})
test('approval audit renders APPROVED before POSTED when timestamps are equal',async()=>{
 const request={id:id(7),operation:'REFUND',target_id:id(8),status:'POSTED',maker_user_id:id(1),details:{},source_snapshot:{amount:10},created_at:'2026-09-16T00:00:00Z'}
 const h=harness({financial_approval_requests:[request],financial_approval_events:[{id:id(1),request_id:id(7),event:'POSTED',performed_at:'2026-09-16T00:00:00Z'},{id:id(2),request_id:id(7),event:'APPROVED',performed_at:'2026-09-16T00:00:00Z'}]})
 const html=renderToStaticMarkup(await h.load(base+'page.tsx').default({searchParams:Promise.resolve({selected:id(7)})}))
 assert.ok(html.indexOf('>APPROVED<')<html.indexOf('>POSTED<'))
})
test('finance payroll review shows scoped earning and adjustment details read-only',async()=>{
 const h=harness({payroll_periods:[{id:id(1),status:'FINALIZED',starts_on:'2026-09-01'}],teacher_payrolls:[{id:id(2),period_id:id(1),teacher_name:'Review teacher',currency:'VND'}],payroll_earning_lines:[{id:id(3),payroll_id:id(2),earning_type:'MONTHLY_BASE',amount:1000}],payroll_adjustments:[{id:id(4),payroll_id:id(2),kind:'CORRECTION',reason:'Original source correction',amount:100}]})
 const html=renderToStaticMarkup(await h.load(base+'payroll/[period]/page.tsx').default({params:Promise.resolve({period:id(1)}),searchParams:Promise.resolve({payroll:id(2)})}))
 assert.match(html,/MONTHLY_BASE/);assert.match(html,/Original source correction/);assert.doesNotMatch(html,/<form/)
})
