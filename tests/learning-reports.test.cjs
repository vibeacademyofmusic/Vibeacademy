/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected, renderToStaticMarkup } = require('./helpers/finance-operations.cjs')
const base = '../reports/learning/'
const snapshot = { teachers:[], as_of:'2026-09-15T00:00:00Z',period_start:'2026-08-01',period_end:'2026-08-31',class_name:'Piano',student:{name:'Student A',code:'A'},branch:{name:'Cần Thơ'},academic:{curriculum:'Piano',current_grade:'Grade 3',subjects:[]},attendance:{scheduled:4,attended:3,absent:1,excused:0,unmarked:0,makeup:0,rate:75},journals:{count:0,excerpts:[]} }
const report = { id:id(1), report_type:'MONTHLY',status:'DRAFT',version:1,period_start:'2026-08-01',period_end:'2026-08-31',generated_at:snapshot.as_of,approved_at:null,draft_data:snapshot,snapshot_data:null,teacher_summary:{},admin_note:'' }
test('report list filters branch status type month and bounded pagination',async()=>{
 const h=harness();await h.load(base+'data.ts').reportList(h.db,{branch:id(2),status:'APPROVED',type:'MONTHLY',month:'2026-12',page:'2',search:'An'})
 const q=h.calls[0];assert.deepEqual(q.range,[25,50]);assert.equal(q.filters.length,5);assert.doesNotMatch(q.fields,/draft_data|snapshot_data/)
 assert.equal(q.filters.every(f=>f({branch_id:id(2),status:'APPROVED',report_type:'MONTHLY',period_start:'2026-12-01'})),true)
 assert.equal(q.filters.every(f=>f({branch_id:id(2),status:'APPROVED',report_type:'MONTHLY',period_start:'2027-01-01'})),false)
})
test('report list renders multiple branches and empty state',async()=>{
 const h=harness({learning_report_list:[{...report,student_name:'Student A',student_code:'A',branch_name:'Cần Thơ'},{...report,id:id(2),student_name:'Student B',student_code:'B',branch_name:'Hà Nội'}]})
 const html=renderToStaticMarkup(await h.load(base+'page.tsx').default({searchParams:Promise.resolve({})}));assert.match(html,/Cần Thơ/);assert.match(html,/Hà Nội/)
 const empty=harness();assert.match(renderToStaticMarkup(await empty.load(base+'page.tsx').default({searchParams:Promise.resolve({})})),/Chưa có dữ liệu/)
})
test('generate sends only validated report context to RPC',async()=>{
 const h=harness();await redirected(h.load(base+'actions.ts').generateReport,{enrollment_id:id(1),type:'MONTHLY',start:'2026-08-01',end:'2026-08-31',snapshot_data:'fake'})
 assert.deepEqual(h.calls[1].args,{p_enrollment_id:id(1),p_type:'MONTHLY',p_start:'2026-08-01',p_end:'2026-08-31'})
})
test('invalid generation and unauthorized requests do not reach engine',async()=>{
 const h=harness();await redirected(h.load(base+'actions.ts').generateReport,{enrollment_id:id(1),type:'MONTHLY',start:'2026-02-30',end:'2026-08-31'});assert.equal(h.calls.length,1)
 const denied=harness({},null,false);assert.equal((await redirected(denied.load(base+'actions.ts').generateReport,{})).pathname,'/login');assert.equal(denied.calls.length,1)
})
test('ready and approval pass expected version; approval requires confirmation',async()=>{
 for(const action of ['READY','APPROVE']) {const h=harness();await redirected(h.load(base+'actions.ts').updateReport,{id:id(1),version:3,action,confirm:'yes'});assert.equal(h.calls[1].args.p_version,3);assert.equal(h.calls[1].args.p_action,action)}
 const h=harness();await redirected(h.load(base+'actions.ts').updateReport,{id:id(1),version:3,action:'APPROVE'});assert.equal(h.calls.length,1)
})
test('reject fake SENT and safely surface engine lock',async()=>{
 const h=harness();await redirected(h.load(base+'actions.ts').updateReport,{id:id(1),version:1,action:'SENT'});assert.equal(h.calls.length,1)
 const locked=harness({},{message:'private database detail'});const url=await redirected(locked.load(base+'actions.ts').updateReport,{id:id(1),version:1,action:'READY'});assert.ok(url.searchParams.get('error'));assert.doesNotMatch(url.toString(),/private/)
})
test('draft detail shows missing input attendance and editable summary',async()=>{
 const h=harness({learning_reports:[report]});const html=renderToStaticMarkup(await h.load(base+'[id]/page.tsx').default({params:Promise.resolve({id:id(1)}),searchParams:Promise.resolve({})}))
 assert.match(html,/75%/);assert.match(html,/Grade 3/);assert.match(html,/Chưa có nhật ký/);assert.match(html,/Lưu nhận xét/);assert.match(html,/Chuyển chờ duyệt/)
})
test('approved detail reads snapshot and hides editing actions',async()=>{
 const h=harness({learning_reports:[{...report,status:'APPROVED',snapshot_data:{...snapshot,student:{name:'Frozen identity',code:'A'},teacher_summary:{general_comment:'Frozen comment'}}}]})
 const html=renderToStaticMarkup(await h.load(base+'[id]/page.tsx').default({params:Promise.resolve({id:id(1)}),searchParams:Promise.resolve({})}))
 assert.match(html,/Frozen identity/);assert.match(html,/Frozen comment/);assert.doesNotMatch(html,/textarea|Lưu nhận xét|Chuyển chờ duyệt|Duyệt và khóa báo cáo/)
})
test('review detail offers approve and return but no inline edit',async()=>{
 const h=harness({learning_reports:[{...report,status:'READY_FOR_REVIEW'}]});const html=renderToStaticMarkup(await h.load(base+'[id]/page.tsx').default({params:Promise.resolve({id:id(1)}),searchParams:Promise.resolve({})}))
 assert.match(html,/Duyệt và khóa báo cáo/);assert.match(html,/Trả về bản nháp/);assert.doesNotMatch(html,/textarea/)
})
test('print preview keeps the approved snapshot and marks controls for exclusion',async()=>{
 const h=harness({learning_reports:[{...report,status:'APPROVED',snapshot_data:{...snapshot,student:{name:'Print snapshot',code:'A'}}}]})
 const html=renderToStaticMarkup(await h.load(base+'[id]/page.tsx').default({params:Promise.resolve({id:id(1)}),searchParams:Promise.resolve({print:'1'})}))
 assert.match(html,/report-print-preview/);assert.match(html,/Print snapshot/);assert.doesNotMatch(html,/textarea/)
})
