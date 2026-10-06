/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {harness,id,redirected,renderToStaticMarkup}=require('./helpers/finance-operations.cjs')
test('reminder timing respects inclusive calendar windows',()=>{
 const {timing}=harness().load('../tuition/reminders/data.ts')
 const r={status:'PENDING',window_start:'2026-10-01',window_end:'2026-10-07'}
 assert.equal(timing(r,'2026-09-30'),'Sắp đến hạn');assert.equal(timing(r,'2026-10-01'),'Đã cập nhật lịch báo');assert.equal(timing(r,'2026-10-07'),'Đã cập nhật lịch báo');assert.equal(timing(r,'2026-10-08'),'Quá hạn nhắc');assert.equal(timing({...r,status:'SKIPPED'},'2026-10-08'),'SKIPPED')
 const term={status:'PENDING',window_start:'2026-03-15',window_end:'2026-04-14',red_on:'2026-03-29',event_code:'RENEWAL_V1',duration_months_snapshot:3}
 assert.equal(timing(term,'2026-03-14'),'Sắp đến hạn');assert.equal(timing(term,'2026-03-15'),'Đã cập nhật lịch báo');assert.equal(timing(term,'2026-03-28'),'Đã cập nhật lịch báo');assert.equal(timing(term,'2026-03-29'),'Trong hạn · cảnh báo đỏ');assert.equal(timing(term,'2026-04-14'),'Trong hạn · cảnh báo đỏ');assert.equal(timing(term,'2026-04-15'),'Quá hạn nhắc')
 const quarter={status:'PENDING',window_start:'2026-09-29',window_end:'2026-10-05',event_code:'BALANCE_50_V1',duration_months_snapshot:3}
 assert.equal(timing(quarter,'2026-09-28'),'Sắp đến hạn');assert.equal(timing(quarter,'2026-09-29'),'Đến hạn thanh toán');assert.equal(timing(quarter,'2026-10-05'),'Đến hạn thanh toán');assert.equal(timing(quarter,'2026-10-06'),'Quá hạn thanh toán nợ')
 const balance={status:'PENDING',window_start:'2026-04-05',window_end:'2026-04-21',red_on:'2026-04-05',event_code:'BALANCE_50_V1',duration_months_snapshot:12}
 assert.equal(timing(balance,'2026-04-04'),'Sắp đến hạn');assert.equal(timing(balance,'2026-04-05'),'Trong hạn · cảnh báo đỏ');assert.equal(timing(balance,'2026-04-21'),'Trong hạn · cảnh báo đỏ');assert.equal(timing(balance,'2026-04-22'),'Quá hạn thanh toán nợ')
})
test('reminder server filters status branch plan and pagination',async()=>{
 const rows=[{id:id(1),status:'SKIPPED',branch_id_snapshot:id(2),tuition_plan_id:id(3)}]
 const h=harness()
 h.db.rpc=async(name,args)=>{
  h.calls.push({rpc:name,args})
  if(name!=='list_tuition_reminders') return {data:[],error:null}
  const found=rows.filter(row=>(!args.p_branch||row.branch_id_snapshot===args.p_branch)&&(!args.p_plan||row.tuition_plan_id===args.p_plan)&&(!args.p_state||row.status===args.p_state.toUpperCase()))
  return {data:found,error:null}
 }
 const data=await h.load('../tuition/reminders/data.ts').reminders(h.db,{state:'skipped',branch:id(2),plan:id(3)})
 assert.equal(data.data.length,1)
 assert.equal(h.calls[0].rpc,'list_tuition_reminders')
 assert.equal(h.calls[0].args.p_branch,id(2))
 assert.equal(h.calls[0].args.p_plan,id(3))
 assert.equal(h.calls[0].args.p_state,'skipped')
 assert.equal(h.calls[0].args.p_limit,26)
 assert.equal(h.calls[0].args.p_offset,0)
 assert.equal((await h.load('../tuition/reminders/data.ts').reminders(h.db,{state:'sent'})).data.length,0)
})
test('queue renders distinct branches and currencies with no send button',async()=>{
 const base={id:id(1),enrollment_tuition_id:id(10),window_start:'2026-10-01',window_end:'2026-10-07',status:'PENDING',starts_on:'2026-09-01',effective_ends_on:'2026-11-30',plan_name_snapshot:'3 tháng',branch_name_snapshot:'Cần Thơ',branch_id_snapshot:id(4),amount:4500000,currency:'VND',full_name:'Student A',student_code:'A'}
 const rows=[base,{...base,id:id(2),branch_name_snapshot:'Hà Nội',amount:123.45,currency:'USD',status:'SKIPPED',reason:'Đã trao đổi'},{...base,id:id(3),window_start:'2026-08-01',window_end:'2026-08-20',status:'PENDING'}]
 const h=harness()
 h.db.rpc=async(name,args)=>{
  h.calls.push({rpc:name,args})
  if(name==='has_role') return {data:true,error:null}
  if(name==='list_tuition_reminders') return {data:rows,error:null}
  if(name==='tuition_reminder_kpis') return {data:{upcoming:1,payment:0,week:0,red:0,overdue:1,sent:0},error:null}
  if(name==='tuition_visible_branches') return {data:[],error:null}
  if(name==='tuition_granted_branches') return {data:[id(4)],error:null}
  return {data:null,error:{message:'unavailable'}}
 }
 const html=renderToStaticMarkup(await h.load('../tuition/reminders/page.tsx').default({searchParams:Promise.resolve({})}))
 for(const text of ['Cần Thơ','Hà Nội','4.500.000','123,45','Đã trao đổi','Chưa có hóa đơn','Sắp đến hạn','Đã bỏ qua','Quá hạn nhắc','Cảnh báo','Gửi báo tự động qua Zalo','Phản hồi Zalo','Chưa phản hồi']) assert.ok(html.includes(text),text)
 const auto=renderToStaticMarkup(await h.load('../tuition/reminders/page.tsx').default({searchParams:Promise.resolve({auto:'1'})}))
 for(const text of ['Gửi thật đang tắt','Nhắc gia hạn không lấy số nợ']) assert.ok(auto.includes(text),text)
 assert.doesNotMatch(html,/PENDING/)
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
