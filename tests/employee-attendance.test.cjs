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
 const html=await render(harness(),'../employees/attendance');assert.match(html,/chưa tự quy đổi/);assert.match(html,/Chọn nhân viên/);assert.match(html,/Hạn mức phép có lương/)
})
