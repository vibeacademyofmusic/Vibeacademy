/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected, render } = require('./helpers/finance-operations.cjs')
test('employee creation delegates generated identity to database without auth provisioning', async () => {
 const h=harness(); await redirected(h.load('../employees/actions.ts').createEmployee,{home_unit:'HQ',hire_date:'2026-01-01',full_name:'Employee',employee_group:'Operations',pay_type:'MONTHLY',reason:'Verified',employee_code:'FORGED',created_by:id(1)})
 assert.equal(h.calls.at(-1).rpc,'create_employee_with_private_profile');assert.equal(h.calls.at(-1).args.p_home,'HQ');assert.ok(!('employee_code' in h.calls.at(-1).args));assert.equal(h.calls.length,2)
})
test('employment update sends expected version and effective date for database concurrency guard',async()=>{
 const h=harness();await redirected(h.load('../employees/actions.ts').updateEmployment,{employee_id:id(1),expected_version:3,effective_on:'2027-01-01',unit_code:'ST',reason:'Transfer'})
 assert.equal(h.calls.at(-1).args.p_expected_version,3);assert.equal(h.calls.at(-1).args.p_effective_on,'2027-01-01');assert.equal(h.calls.at(-1).rpc,'set_employee_version')
})
test('employee actions reject unprivileged user and missing reason before mutation',async()=>{
 for(const h of [harness({},null,false),harness()]){
 await redirected(h.load('../employees/actions.ts').createEmployee,{});assert.ok(h.calls.every(c=>c.rpc==='has_role'))
 }
})
test('employee list is bounded and supports unit and status filters',async()=>{
 const h=harness({employee_directory:Array.from({length:30},(_,i)=>({id:id(i),unit_code:'HQ',employment_status:'ACTIVE'}))})
 const data=await h.load('../employees/data.ts').employeeData(h.db,{unit:'HQ',status:'ACTIVE'});assert.equal(data.data.length,25);assert.equal(data.more,true)
 assert.deepEqual(h.calls.find(c=>c.table==='employee_directory').range,[0,25])
})
test('employee page separates personnel metadata from account permissions',async()=>{
 const html=await render(harness({organization_units:[{code:'HQ',name:'HQ'}]}),'../employees')
 assert.match(html,/không tự tạo tài khoản/);assert.match(html,/Đơn vị gốc cấp mã/);assert.match(html,/Nhóm nhân viên/)
})
