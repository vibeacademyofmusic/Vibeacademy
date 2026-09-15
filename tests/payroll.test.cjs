/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {harness,id,redirected,renderToStaticMarkup}=require('./helpers/finance-operations.cjs')
const base='../payroll/'
const period={id:id(1),branch_id:id(2),starts_on:'2026-08-01',ends_on:'2026-08-31',status:'GENERATED',version:2}
const payroll={id:id(3),period_id:id(1),teacher_id:id(4),branch_id:id(2),teacher_name:'Substitute B',pay_type:'HOURLY',currency:'VND',base_salary:0,teaching_hours:1,hourly_earnings:200000,adjustment_amount:10000,gross_amount:210000}
test('generation uses period only; no client salary calculation',async()=>{const h=harness();await redirected(h.load(base+'actions.ts').payrollAction,{action:'generate',period:id(1),gross_amount:999});assert.deepEqual(h.calls[1],{rpc:'generate_teacher_payroll',args:{p_period:id(1)}})})
test('compensation rule carries effective dates and pay type',async()=>{const h=harness();await redirected(h.load(base+'actions.ts').payrollAction,{action:'rule',teacher:id(4),branch:id(2),type:'MONTHLY',rate:'10000000',currency:'VND',from:'2026-08-01',to:'2026-08-31'});assert.equal(h.calls[1].args.p_type,'MONTHLY');assert.equal(h.calls[1].args.p_to,'2026-08-31')})
test('adjustment is separate RPC with reason',async()=>{const h=harness();await redirected(h.load(base+'actions.ts').payrollAction,{action:'adjust',period:id(1),payroll:id(3),kind:'DEDUCTION',amount:'-100',note:'Correction'});assert.equal(h.calls[1].rpc,'add_payroll_adjustment');assert.equal(h.calls[1].args.p_amount,'-100')})
test('approval requires confirmation and version',async()=>{const h=harness();await redirected(h.load(base+'actions.ts').payrollAction,{action:'transition',period:id(1),status:'APPROVED',version:'2',note:'Checked'});assert.equal(h.calls.length,2);await redirected(h.load(base+'actions.ts').payrollAction,{action:'transition',period:id(1),status:'APPROVED',version:'2',note:'Checked',confirm:'yes'});assert.equal(h.calls.at(-1).args.p_version,2)})
test('unauthorized actions blocked before payroll RPC',async()=>{const h=harness({},null,false);assert.equal((await redirected(h.load(base+'actions.ts').payrollAction,{action:'generate',period:id(1)})).pathname,'/login')})
test('server-side period and teacher filters are bounded',async()=>{const h=harness();await h.load(base+'data.ts').periods(h.db,{branch:id(2),month:'2026-08',status:'APPROVED',page:'2'});assert.deepEqual(h.calls[0].range,[25,50]);assert.equal(h.calls[0].filters.length,3);await h.load(base+'data.ts').payrollList(h.db,id(1),{teacher:id(4),type:'HOURLY'});assert.equal(h.calls[1].filters.length,3)})
test('dashboard renders separate branches and currencies',async()=>{const h=harness({payroll_period_summary:[{...period,currency:'VND',teacher_count:1,gross_amount:200,monthly_total:0,hourly_total:200,adjustments:0},{...period,id:id(9),branch_id:id(8),currency:'USD',teacher_count:1,gross_amount:10,monthly_total:10,hourly_total:0,adjustments:0}],branches:[{id:id(2),name:'Can Tho'},{id:id(8),name:'Hanoi'}]});const html=renderToStaticMarkup(await h.load(base+'page.tsx').default({searchParams:Promise.resolve({})}));for(const text of ['Can Tho','Hanoi','VND','USD'])assert.ok(html.includes(text))})
test('teacher detail traces session and separate adjustments',async()=>{const h=harness({payroll_periods:[period],teacher_payrolls:[payroll],payroll_earning_lines:[{id:id(5),payroll_id:id(3),session_id:id(6),earned_on:'2026-08-17',earning_type:'TEACHING',duration_hours:1,rate:200000,amount:200000}],payroll_adjustments:[{id:id(7),payroll_id:id(3),kind:'BONUS',amount:10000,reason:'Local bonus'}]});const html=renderToStaticMarkup(await h.load(base+'[period]/[teacher]/page.tsx').default({params:Promise.resolve({period:id(1),teacher:id(4)}),searchParams:Promise.resolve({})}));for(const text of ['Substitute B','Local bonus','/admin/attendance/'+id(6),'Thêm điều chỉnh'])assert.ok(html.includes(text),text)})
test('finalized period hides generate and transitions',async()=>{const h=harness({payroll_periods:[{...period,status:'FINALIZED'}],teacher_payrolls:[payroll]});const html=renderToStaticMarkup(await h.load(base+'[period]/page.tsx').default({params:Promise.resolve({period:id(1)}),searchParams:Promise.resolve({})}));assert.match(html,/Đã chốt/);assert.doesNotMatch(html,/Tính bảng lương|Lưu trạng thái kỳ lương/)})
test('finalized teacher detail hides adjustment form',async()=>{const h=harness({payroll_periods:[{...period,status:'FINALIZED'}],teacher_payrolls:[payroll]});const html=renderToStaticMarkup(await h.load(base+'[period]/[teacher]/page.tsx').default({params:Promise.resolve({period:id(1),teacher:id(4)}),searchParams:Promise.resolve({})}));assert.match(html,/Điều chỉnh đang khóa/);assert.doesNotMatch(html,/name="amount"/)})
test('emergency approval requires an explicit type and nonblank reason',async()=>{
 const h=harness(),action=h.load(base+'actions.ts').payrollAction
 const form={action:'transition',period:id(1),status:'APPROVED',version:'2',note:'Checked',confirm:'yes',override_type:'MAKER_CHECKER_EMERGENCY'}
 await redirected(action,form)
 assert.equal(h.calls.filter(c=>!['has_role','is_global_super_admin'].includes(c.rpc)).length,0)
 await redirected(action,{...form,override_reason:'Urgent incident reviewed'})
 assert.equal(h.calls.at(-1).rpc,'transition_payroll_with_override')
 assert.equal(h.calls.at(-1).args.p_override_reason,'Urgent incident reviewed')
})
test('normal approval never silently requests emergency override',async()=>{
 const h=harness()
 await redirected(h.load(base+'actions.ts').payrollAction,{action:'transition',period:id(1),status:'APPROVED',version:'2',note:'Checked',confirm:'yes'})
 assert.equal(h.calls.at(-1).rpc,'transition_payroll')
 assert.equal(h.calls.at(-1).args.p_override_type,undefined)
})
test('emergency form explains separation and displays audited reason',async()=>{
 const h=harness({payroll_periods:[{...period,status:'REVIEW'}],teacher_payrolls:[payroll],payroll_events:[{period_id:id(1),status:'APPROVED',note:'Checked',actor_id:id(1),event_type:'EMERGENCY_OVERRIDE',override_reason:'Incident reason'}]})
 const html=renderToStaticMarkup(await h.load(base+'[period]/page.tsx').default({params:Promise.resolve({period:id(1)}),searchParams:Promise.resolve({})}))
 assert.match(html,/name="override_type"/)
 assert.match(html,/name="override_reason"/)
 assert.match(html,/Incident reason/)
 assert.doesNotMatch(html,/nếu người tạo tự duyệt, hệ thống ghi rõ/)
})
