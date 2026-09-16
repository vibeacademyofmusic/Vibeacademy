/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict')
const {harness,id,redirected,render}=require('./helpers/finance-operations.cjs')
test('attendance request carries evidence in Vietnam time, never client checker or salary deduction',async()=>{
 const h=harness();await redirected(h.load('../employees/attendance/actions.ts').requestAttendance,{employee_id:id(1),work_date:'2026-09-08',shift_code:'PM',revision:0,status:'LATE',arrived_at:'2026-09-08T14:15',departed_at:'2026-09-08T21:00',reason:'Evidence',idempotency_key:id(2),checker:id(3),deduction:'900000'})
 const c=h.calls.at(-1);assert.equal(c.rpc,'request_employee_attendance');assert.equal(c.args.p_arrived,'2026-09-08T14:15:00+07:00');assert.ok(!('checker' in c.args));assert.ok(!('deduction' in c.args))
})
test('attendance review delegates maker checker to database',async()=>{
 const h=harness();await redirected(h.load('../employees/attendance/actions.ts').reviewAttendance,{request_id:id(1),decision:'APPROVED',reason:'Independent check',maker:id(2)})
 assert.deepEqual(h.calls.at(-1),{rpc:'review_employee_attendance',args:{p_request:id(1),p_decision:'APPROVED',p_reason:'Independent check'}})
})
test('attendance actions deny unauthorized account before mutation',async()=>{
 const h=harness({},null,false);await redirected(h.load('../employees/attendance/actions.ts').requestTrip,{reason:'Denied'});assert.equal(h.calls.length,1)
})
test('leave quota allows explicit zero but rejects omitted or fractional quota',async()=>{
 for(const paid_minutes of ['', '-1','0.5']){const h=harness();await redirected(h.load('../employees/attendance/actions.ts').configureLeave,{reason:'Policy',paid_minutes});assert.equal(h.calls.length,1)}
 const h=harness();await redirected(h.load('../employees/attendance/actions.ts').configureLeave,{reason:'Policy',paid_minutes:'0',unit_code:'ST'});assert.equal(h.calls.at(-1).args.p_minutes,0)
})
test('calendar range handles year boundary and leap year',()=>{
 const {monthRange}=harness().load('../employees/attendance/data.ts');assert.deepEqual(monthRange('2028-02'),{month:'2028-02',from:'2028-02-01',to:'2028-02-29'});assert.equal(monthRange('2026-12').to,'2026-12-31')
})
test('employee attendance empty UI makes payroll limitation explicit',async()=>{
 const html=await render(harness(),'../employees/attendance');assert.match(html,/chưa tự quy đổi/);assert.match(html,/Chọn nhân viên/);assert.doesNotMatch(html,/Hạn mức phép có lương|Lưu chính sách phép/)
})
test('policy editing lives only on dedicated policy page and uses existing RPC',async()=>{
 const h=harness();const html=await render(h,'../employees/leave-policies');assert.match(html,/Lưu chính sách phép/);assert.doesNotMatch(html,/Gửi chấm công/)
 assert.ok(!h.calls.some(c=>c.table==='employee_attendance_requests'||c.rpc==='employee_schedule'))
 const url=await redirected(h.load('../employees/attendance/actions.ts').configureLeave,{reason:'Policy',paid_minutes:'210',unit_code:'HQ'});assert.equal(url.pathname,'/admin/employees/leave-policies')
})
test('dedicated leave action reuses canonical attendance request and independent review',async()=>{
 const h=harness();const a=h.load('../employees/attendance/actions.ts')
 const url=await redirected(a.requestLeave,{employee_id:id(1),work_date:'2026-09-14',shift_code:'PM',revision:0,status:'PAID_LEAVE',reason:'Leave',idempotency_key:id(9)})
 assert.equal(url.pathname,'/admin/employees/leave-requests');assert.equal(h.calls.at(-1).rpc,'request_employee_attendance');assert.equal(h.calls.at(-1).args.p_status,'PAID_LEAVE')
 await redirected(a.reviewLeave,{request_id:id(9),decision:'REJECTED',reason:'Rejected'});assert.equal(h.calls.at(-1).rpc,'review_employee_attendance')
 assert.ok(h.invalidated.includes('/admin/employees/attendance'))
})
test('attendance and leave submission boundaries reject the other workflow status',async()=>{
 for(const [action,status] of [['requestAttendance','PAID_LEAVE'],['requestAttendance','UNPAID_LEAVE'],['requestLeave','WORKED']]){
 const h=harness();await redirected(h.load('../employees/attendance/actions.ts')[action],{status,reason:'Test'});assert.equal(h.calls.length,1)
 }
 for(const action of ['requestLeave','reviewLeave','configureLeave']){const h=harness({},null,false);await redirected(h.load('../employees/attendance/actions.ts')[action],{reason:'Denied',paid_minutes:0});assert.equal(h.calls.length,1)}
})
test('loaders isolate leave requests before limiting and never load policy for attendance',async()=>{
 const fixtures={employee_attendance_requests:[{id:id(2),employee_id:id(1),work_date:'2026-09-14',proposed_status:'PAID_LEAVE'},{id:id(3),employee_id:id(1),work_date:'2026-09-14',proposed_status:'WORKED'}]}
 for(const mode of ['attendance','leave']){
 const h=harness(fixtures),original=h.db.rpc;h.db.rpc=(name,args)=>name==='employee_schedule'?Promise.resolve({data:[],error:null}):original(name,args)
 const data=await h.load('../employees/attendance/data.ts').attendanceData(h.db,{employee:id(1),month:'2026-09'},mode)
 assert.deepEqual(data.requests.map(r=>r.proposed_status),[mode==='leave'?'PAID_LEAVE':'WORKED']);assert.ok(!h.calls.some(c=>c.table==='employee_leave_policies'))
 }
})
test('summary counts only approved current shift evidence, no late deduction or rest absence',()=>{
 const {attendanceSummary}=harness().load('../employees/attendance/summary.ts')
 const statuses=['PAID_LEAVE','UNPAID_LEAVE','UNAUTHORIZED_ABSENCE','LATE','EARLY_LEAVE','BUSINESS_TRIP','SCHEDULED_OFF','WORKED']
 const schedule=statuses.map((status,i)=>({work_date:'2026-09-'+String(i+1).padStart(2,'0'),shift_code:'PM',scheduled_minutes:status==='SCHEDULED_OFF'?0:420}))
 const entries=schedule.map((s,i)=>({...s,status:statuses[i],checker:i===7?null:id(2),paid_leave_minutes:statuses[i]==='PAID_LEAVE'?210:0,unpaid_leave_minutes:statuses[i]==='PAID_LEAVE'?210:0,leave_policy_id:id(4),late_minutes:statuses[i]==='LATE'?15:0,early_minutes:statuses[i]==='EARLY_LEAVE'?20:0}))
 assert.deepEqual(attendanceSummary(schedule,entries),{required:2940,payable:1470,unpaid:630,absent:420,late:15,early:20,paid:210,trip:420,pending:1})
 assert.equal(attendanceSummary(schedule,[]).payable,0)
})
test('leave page explains pending approval and existing full-shift/past-date limitations',async()=>{
 const html=await render(harness(),'../employees/leave-requests');assert.match(html,/Chỉ yêu cầu đã duyệt/);assert.match(html,/chưa hỗ trợ xin nghỉ ngày tương lai/);assert.doesNotMatch(html,/Lưu chính sách phép/)
})
test('approved leave renders without policy editor, unpaid request controls or invented actual times',async()=>{
 const h=harness({employee_attendance_current:[{employee_id:id(1),work_date:'2026-09-14',shift_code:'PM',status:'PAID_LEAVE',revision:1,checker:id(2),paid_leave_minutes:210,unpaid_leave_minutes:210,late_minutes:0,early_minutes:0,leave_policy_id:id(3),arrived_at:null,departed_at:null}]})
 const rpc=h.db.rpc;h.db.rpc=(name,args)=>name==='employee_schedule'?Promise.resolve({data:[{work_date:'2026-09-14',shift_code:'PM',unit_code:'HQ',starts_at:'2026-09-14T07:00:00Z',ends_at:'2026-09-14T14:00:00Z',scheduled_minutes:420,schedule_state:'SCHEDULED'}],error:null}):rpc(name,args)
 const html=await render(h,'../employees/attendance',{employee:id(1),month:'2026-09',day:'2026-09-14',shift:'PM'})
 assert.match(html,/210 phút có lương/);assert.match(html,/Chưa có giờ đến/);assert.doesNotMatch(html,/1970|Lưu chính sách phép|value="PAID_LEAVE"|value="UNPAID_LEAVE"/)
})
test('policy audit renders timestamp as Vietnam time, never reversed raw ISO date',async()=>{
 const h=harness({employee_leave_policies:[{unit_code:'HQ',employee_id:null,employee_group:null,starts_on:'2026-09-01',ends_on:'2026-09-30',paid_minutes:210,reason:'Synthetic policy',actor:id(1),created_at:'2026-09-16T22:00:00Z'}]})
 const html=await render(h,'../employees/leave-policies',{month:'2026-09'});assert.match(html,/05:00/);assert.doesNotMatch(html,/22:00:00Z/)
})
