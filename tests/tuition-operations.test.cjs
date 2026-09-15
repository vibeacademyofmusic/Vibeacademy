/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected, renderToStaticMarkup } = require('./helpers/finance-operations.cjs')
function fixture() {
 const term = { id:id(10),enrollment_id:id(11),tuition_plan_id:id(12),starts_on:'2026-09-01',base_ends_on:'2026-11-30',effective_ends_on:'2026-12-05',status:'ACTIVE',plan_name_snapshot:'Gói 3 tháng',branch_name_snapshot:'Cần Thơ',branch_id_snapshot:id(13),list_price:4500000,discount_amount:450000,discount_type:'PERCENT',discount_value:10,discount_name:'Ưu đãi',amount:4050000,currency:'VND',enrollments:{student_id:id(14),started_at:'2026-09-01',students:{full_name:'Học viên A',student_code:'HV-A'}},invoices:null }
 return { enrollment_tuition:[term], tuition_plans:[{id:id(12),name:'Gói 3 tháng',status:'ACTIVE'}],branches:[{id:id(13),name:'Cần Thơ'}],enrollments:[],invoice_receivables:[] }
}
async function render(h,params={}) { return renderToStaticMarkup(await h.load('../tuition/page.tsx').default({searchParams:Promise.resolve(params)})) }
test('tuition list shows money, dates and student with bounded query',async()=>{
 const h=harness(fixture()),html=await render(h)
 for(const text of ['Học viên A','4.050.000','4.500.000','30/11/2026','05/12/2026']) assert.ok(html.includes(text),text)
 const q=h.calls.find(c=>c.table==='enrollment_tuition');assert.deepEqual(q.range,[0,25]);assert.ok(!q.fields.includes('*'))
})
test('term detail exposes 5 pause extension days and discount before invoice',async()=>{
 const html=await render(harness(fixture()),{selected:id(10)})
 assert.match(html,/Được gia hạn 5 ngày/);assert.match(html,/Lưu chiết khấu/);assert.match(html,/Tạo hóa đơn/)
})
test('any invoice including CANCELLED locks discount and links financial context',async()=>{
 const f=fixture();f.enrollment_tuition[0].invoices={id:id(20),invoice_number:'INV-X',status:'CANCELLED'}
 f.invoice_receivables=[{enrollment_tuition_id:id(10),invoice_id:id(20),invoice_number:'INV-X',invoice_status:'CANCELLED',receivable_status:'CANCELLED',total_amount:4050000,outstanding_balance:0,currency:'VND'}]
 const html=await render(harness(f),{selected:id(10)})
 assert.match(html,/Không thể thay đổi chiết khấu/);assert.doesNotMatch(html,/Lưu chiết khấu/);assert.match(html,/invoices\?selected=/)
})
test('tuition filters and second page applied server side',async()=>{
 const f=fixture();f.enrollment_tuition=Array.from({length:27},(_,i)=>({...f.enrollment_tuition[0],id:id(100+i)}))
 const h=harness(f),result=await h.load('../tuition/data.ts').terms(h.db,{page:'2',branch:id(13),plan:id(12),currency:'VND',status:'ACTIVE'})
 assert.equal(result.data.length,2);assert.equal(result.more,false);assert.deepEqual(h.calls[0].range,[25,50])
 assert.equal((await h.load('../tuition/data.ts').terms(h.db,{currency:'USD'})).data.length,0)
})
test('create validates input before mutation',async()=>{
 const h=harness(),action=h.load('../tuition/actions.ts').createTerm
 const form=new FormData();form.set('discount_type','NONE');form.set('starts_on','2026-02-30')
 const result=await action({},form);assert.ok(result.error);assert.deepEqual(h.calls.map(c=>c.rpc),['has_role'])
})
test('create uses RPC and never submits client price snapshots',async()=>{
 const h=harness(),action=h.load('../tuition/actions.ts').createTerm
 const result=await redirected(f=>action({},f),{enrollment_id:id(11),tuition_plan_id:id(12),starts_on:'2026-09-01',discount_type:'NONE',discount_value:'0',intent:'save',confirm:'yes',amount:'1',currency:'USD'})
 assert.ok(result.searchParams.get('selected'));const call=h.calls.find(c=>c.rpc==='create_tuition_term');assert.ok(call);assert.ok(!('p_amount' in call.args));assert.ok(!('p_currency' in call.args))
})
test('edit discount uses guarded RPC and auth blocks non admins',async()=>{
 const h=harness();await redirected(f=>h.load('../tuition/actions.ts').editDiscount({},f),{tuition_id:id(10),discount_type:'PERCENT',discount_value:'10',discount_name:'Offer',intent:'save',confirm:'yes'})
 assert.ok(h.calls.some(c=>c.rpc==='update_tuition_discount'))
 const denied=harness({},null,false);const url=await redirected(f=>denied.load('../tuition/actions.ts').editDiscount({},f),{})
 assert.equal(url.pathname,'/login');assert.equal(denied.calls.length,1)
})
test('calendar month filters cross year and dates measure entitlement not raw pause totals',()=>{
 const data=harness().load('../tuition/data.ts')
 assert.deepEqual(data.monthRange(true,'2026-12-31'),['2027-01-01','2027-02-01']);assert.equal(data.daysBetween('2024-02-28','2024-03-01'),2)
})
module.exports={fixture}
