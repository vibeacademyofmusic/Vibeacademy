/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {harness,id,redirected,renderToStaticMarkup}=require('./helpers/finance-operations.cjs')
test('reminder timing respects inclusive calendar windows',()=>{
 const {timing}=harness().load('../tuition/reminders/data.ts')
 const r={status:'PENDING',window_start:'2026-10-01',window_end:'2026-10-07'}
 assert.equal(timing(r,'2026-09-30'),'Sắp đến hạn');assert.equal(timing(r,'2026-10-01'),'Đến hạn hôm nay');assert.equal(timing(r,'2026-10-07'),'Đến hạn hôm nay');assert.equal(timing(r,'2026-10-08'),'Quá hạn nhắc');assert.equal(timing({...r,status:'SKIPPED'},'2026-10-08'),'SKIPPED')
})
test('reminder server filters status branch plan and pagination',async()=>{
 const h=harness({tuition_reminder_operations:[{id:id(1),status:'SKIPPED',branch_id_snapshot:id(2),tuition_plan_id:id(3)}]})
 const data=await h.load('../tuition/reminders/data.ts').reminders(h.db,{state:'skipped',branch:id(2),plan:id(3)})
 assert.equal(data.data.length,1);assert.deepEqual(h.calls[0].range,[0,25]);assert.equal((await h.load('../tuition/reminders/data.ts').reminders(h.db,{state:'sent'})).data.length,0)
})
test('queue renders distinct branches and currencies with no send button',async()=>{
 const base={id:id(1),enrollment_tuition_id:id(10),window_start:'2026-10-01',window_end:'2026-10-07',status:'PENDING',starts_on:'2026-09-01',effective_ends_on:'2026-11-30',plan_name_snapshot:'3 tháng',branch_name_snapshot:'Cần Thơ',amount:4500000,currency:'VND',full_name:'Student A',student_code:'A'}
 const h=harness({tuition_reminder_operations:[base,{...base,id:id(2),branch_name_snapshot:'Hà Nội',amount:123.45,currency:'USD',status:'SKIPPED',reason:'Đã trao đổi'}]})
 const html=renderToStaticMarkup(await h.load('../tuition/reminders/page.tsx').default({searchParams:Promise.resolve({})}))
 for(const text of ['Cần Thơ','Hà Nội','4.500.000','123,45','Đã trao đổi','Chưa có hóa đơn']) assert.ok(html.includes(text),text)
 assert.doesNotMatch(html,/>Gửi ngay</)
})
test('skip and cancel go through resolution RPC with reason',async()=>{
 for(const status of ['SKIPPED','CANCELLED']) { const h=harness();await redirected(h.load('../tuition/reminders/actions.ts').resolveReminder,{reminder_id:id(1),status,reason:'Test reason'});assert.deepEqual(h.calls[1].args,{p_reminder_id:id(1),p_status:status,p_reason:'Test reason'}) }
})
test('fake sent and missing reasons rejected without RPC',async()=>{
 for(const values of [{status:'SENT',reason:'fake'},{status:'SKIPPED',reason:''}]) { const h=harness();const url=await redirected(h.load('../tuition/reminders/actions.ts').resolveReminder,{reminder_id:id(1),...values});assert.ok(url.searchParams.get('error'));assert.equal(h.calls.length,1) }
})
test('generation has no caller supplied date or delivery status; admin required',async()=>{
 const h=harness();await redirected(h.load('../tuition/reminders/actions.ts').generateReminders,{date:'2099-01-01',status:'SENT'});assert.equal(h.calls[1].rpc,'generate_tuition_reminders');assert.equal(h.calls[1].args,undefined)
 const denied=harness({},null,false);assert.equal((await redirected(denied.load('../tuition/reminders/actions.ts').generateReminders,{})).pathname,'/login');assert.equal(denied.calls.length,1)
})
