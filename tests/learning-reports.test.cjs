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
    assert.match(html,/75%/);
    assert.match(html,/Grade 3/);
    assert.match(html,/Chưa có nhật ký/);
    assert.match(html,/Kết quả \/ tiến bộ nổi bật/);
    assert.match(html,/Kế hoạch tháng tiếp theo/);
    assert.match(html,/Lưu nhận xét/);
    assert.match(html,/Chuyển chờ duyệt/)
   })

   test('approved detail reads snapshot and hides editing actions',async()=>{
    const h=harness({learning_reports:[{...report,status:'APPROVED',snapshot_data:{...snapshot,student:{name:'Frozen identity',code:'A'},teacher_summary:{achievement:'Frozen comment'}}}]})
    const html=renderToStaticMarkup(await h.load(base+'[id]/page.tsx').default({params:Promise.resolve({id:id(1)}),searchParams:Promise.resolve({})}))
    assert.match(html,/Frozen identity/);assert.match(html,/Frozen comment/);assert.doesNotMatch(html,/textarea|Lưu nhận xét|Chuyển chờ duyệt|Duyệt và khóa báo cáo/)
   })

   test('approved legacy V1 summary remains readable after V2',async()=>{
    const h=harness({
     learning_reports:[{
      ...report,
      status:'APPROVED',
      snapshot_data:{
       ...snapshot,
       teacher_summary:{
        general_comment:'Legacy achievement',
        improvement_areas:'Legacy difficulty'
       }
      }
     }]
    })

    const html=renderToStaticMarkup(
     await h.load(base+'[id]/page.tsx').default({
      params:Promise.resolve({id:id(1)}),
      searchParams:Promise.resolve({})
     })
    )

    assert.match(html,/Legacy achievement/)
    assert.match(html,/Legacy difficulty/)
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

const { monthlyPeriod, generationErrors } = harness().load(base+'periods.ts')
test('first monthly suggestions handle day one, mid-month, leap day and year rollover', () => {
 for (const [start, end] of [['2026-09-01','2026-09-30'],['2026-09-20','2026-10-31'],['2025-12-31','2026-01-31'],['2024-01-31','2024-02-29'],['2025-01-31','2025-02-28']])
  assert.deepEqual(monthlyPeriod(start),{start,end,first:true})
 assert.deepEqual(monthlyPeriod('2026-09-20','2026-10-31'),{start:'2026-11-01',end:'2026-11-30',first:false})
 assert.deepEqual(monthlyPeriod('2025-01-20','2025-12-31'),{start:'2026-01-01',end:'2026-01-31',first:false})
})
const enrollment = {id:id(8),started_at:'2025-09-20',ended_at:null,students:{full_name:'Midmonth student',student_code:'MID'},classes:{name:'Piano',branches:{name:'Test branch'}}}
async function renderCreation(e, reports=[]) {
 const h=harness({enrollments:[e],learning_reports:reports})
 const html=renderToStaticMarkup(await h.load(base+'page.tsx').default({searchParams:Promise.resolve({enrollment:e.id})}))
 return {html,h}
}
test('selected enrollment prefills first-period dates and enrollment lower bound',async()=>{
 const {html}=await renderCreation(enrollment)
 assert.match(html,/Kỳ tháng đầu tiên/)
 assert.match(html,/<input(?=[^>]*name="start")(?=[^>]*min="2025-09-20")(?=[^>]*value="2025-09-20")[^>]*>/)
 assert.match(html,/name="end"[^>]*value="2025-10-31"/)
 assert.match(html,/name="enrollment_id"[^>]*value="a0000000-0000-0000-0000-000000000008"/)
})
test('existing monthly history suggests following calendar month including cancelled',async()=>{
 for(const status of ['DRAFT','READY_FOR_REVIEW','APPROVED','PUBLISHED','CANCELLED']) {
  const {html,h}=await renderCreation(enrollment,[{id:id(9),enrollment_id:id(8),report_type:'MONTHLY',period_end:'2025-10-31',status}])
  assert.match(html,/Kỳ tháng tiếp theo/);assert.match(html,/name="start"[^>]*value="2025-11-01"/);assert.match(html,/name="end"[^>]*value="2025-11-30"/)
  assert.ok(h.calls.some(c=>c.table==='learning_reports'&&c.limit===1))
 }
})
test('other enrollment or END_OF_COURSE history does not replace first monthly default',async()=>{
 const {html}=await renderCreation(enrollment,[{id:id(9),enrollment_id:id(7),report_type:'MONTHLY',period_end:'2025-10-31'},{id:id(10),enrollment_id:id(8),report_type:'END_OF_COURSE',period_end:'2025-10-31'}])
 assert.match(html,/Kỳ tháng đầu tiên/)
})
test('early-ended and future enrollments explain why suggested monthly report is unavailable',async()=>{
 assert.match((await renderCreation({...enrollment,ended_at:'2025-10-15'})).html,/Kỳ tháng vượt ngày kết thúc ghi danh/)
 assert.match((await renderCreation({...enrollment,started_at:'2099-09-20'})).html,/Kỳ gợi ý chưa kết thúc/)
})
test('first extended period action forwards validated inputs without calendar-month-only rejection',async()=>{
 const h=harness()
 await redirected(h.load(base+'actions.ts').generateReport,{enrollment_id:id(8),type:'MONTHLY',start:'2025-09-20',end:'2025-10-31'})
 assert.deepEqual(h.calls[1].args,{p_enrollment_id:id(8),p_type:'MONTHLY',p_start:'2025-09-20',p_end:'2025-10-31'})
})
test('known generation errors have Vietnamese explanations and unknown errors stay private',async()=>{
 for(const [message,expected] of Object.entries(generationErrors)) {
  const h=harness({},{message})
  const url=await redirected(h.load(base+'actions.ts').generateReport,{enrollment_id:id(8),type:'MONTHLY',start:'2025-09-20',end:'2025-10-31'})
  assert.equal(url.searchParams.get('error'),expected)
 }
 const h=harness({},{message:'private SQL detail'})
 const url=await redirected(h.load(base+'actions.ts').generateReport,{enrollment_id:id(8),type:'MONTHLY',start:'2025-09-20',end:'2025-10-31'})
 assert.doesNotMatch(url.searchParams.get('error'),/private|SQL|Terminal|RPC/)
})

async function officialReport(status, extra = {}, fixtures = {}) {
 const h = harness({ learning_reports: [{ ...report, student_id: id(20), approved_by: id(21), approved_at: snapshot.as_of, status, snapshot_data: snapshot, ...extra }], ...fixtures })
 const html = renderToStaticMarkup(await h.load(base+'[id]/page.tsx').default({params:Promise.resolve({id:id(1)}),searchParams:Promise.resolve({})}))
 return { h, html }
}
test('approved official document exposes confirmed publish only and never refreshes snapshot', async () => {
 const {h,html} = await officialReport('APPROVED')
 for (const text of ['LEARNING PROGRESS REPORT','STUDENT INFORMATION','ATTENDANCE SUMMARY','ACADEMIC PROGRESS','AUTHORIZED ACADEMIC APPROVAL','PUBLISH REPORT']) assert.ok(html.includes(text))
 assert.match(html,/name="action" value="PUBLISH"/); assert.match(html,/<input(?=[^>]*name="confirm")(?=[^>]*required)[^>]*>/)
 assert.doesNotMatch(html,/SEND EMAIL|SEND ZALO|textarea/)
 assert.ok(!h.calls.some(c=>c.rpc==='update_learning_report'||c.rpc==='learning_report_source'))
})
test('publish action requires confirmation and forwards version to existing engine',async()=>{
 const h=harness()
 await redirected(h.load(base+'actions.ts').updateReport,{id:id(1),version:4,action:'PUBLISH'})
 assert.ok(!h.calls.some(c=>c.rpc==='update_learning_report'))
 await redirected(h.load(base+'actions.ts').updateReport,{id:id(1),version:4,action:'PUBLISH',confirm:'yes'})
 assert.equal(h.calls.at(-1).args.p_action,'PUBLISH'); assert.equal(h.calls.at(-1).args.p_version,4)
})
test('published report has disabled delivery controls with real student and active parent contacts',async()=>{
 const {html,h}=await officialReport('PUBLISHED',{sent_at:'2026-09-16T00:00:00Z'},{
  students:[{id:id(20),user_id:id(22),full_name:'Real Student',email:'student@example.test',phone:'0900000000'}],
  student_parents:[{student_id:id(20),parent_id:id(23),is_active:true,valid_from:null,valid_until:null},{student_id:id(20),parent_id:id(24),is_active:false}],
  parents:[{id:id(23),user_id:id(25),status:'ACTIVE'},{id:id(24),user_id:id(26),status:'ACTIVE'}],
  profiles:[{id:id(25),full_name:'Real Parent',phone:'0911111111',status:'ACTIVE'},{id:id(26),full_name:'Inactive relation',status:'ACTIVE'}],
 })
 assert.match(html,/Real Student/);assert.match(html,/student@example.test/);assert.match(html,/Real Parent/);assert.doesNotMatch(html,/Inactive relation/)
 assert.match(html,/<button[^>]*disabled=""[^>]*>SEND EMAIL/);assert.match(html,/<button[^>]*disabled=""[^>]*>SEND ZALO/)
 assert.match(html,/EMAIL PROVIDER NOT CONFIGURED/);assert.match(html,/ZALO PROVIDER NOT CONFIGURED/)
 assert.match(html,/NOT_SENT/);assert.doesNotMatch(html,/PUBLISH REPORT|textarea/)
 assert.ok(!h.calls.some(c=>c.rpc==='enqueue_notification_event'||c.rpc==='update_learning_report'))
})
test('draft and review do not expose delivery controls',async()=>{
 for(const status of ['DRAFT','READY_FOR_REVIEW']) {
  const {html}=await officialReport(status,{snapshot_data:null})
  assert.doesNotMatch(html,/SEND EMAIL|SEND ZALO|DELIVERY HISTORY/)
 }
})
test('missing recipients and missing snapshot fail safely',async()=>{
 const {html}=await officialReport('PUBLISHED')
 assert.match(html,/Không có thông tin người nhận/);assert.match(html,/No eligible email recipient/)
 const missing=await officialReport('APPROVED',{snapshot_data:null,draft_data:{...snapshot,student:{name:'DO NOT PRINT DRAFT',code:'X'}}})
 assert.match(missing.html,/Approved snapshot unavailable/);assert.doesNotMatch(missing.html,/DO NOT PRINT DRAFT/)
})
test('repeated delivery page loads cannot enqueue, send, or mutate frozen content',async()=>{
 const frozen=structuredClone(snapshot), original=JSON.stringify(frozen)
 for(let n=0;n<2;n++) {
  const {h}=await officialReport('PUBLISHED',{snapshot_data:frozen})
  assert.deepEqual(h.calls.filter(c=>c.rpc).map(c=>c.rpc),['has_role'])
 }
 assert.equal(JSON.stringify(frozen),original)
})
test('delivery history uses actual records, preserves mock and queued distinctions, filters other reports',async()=>{
 const jobs=[{id:id(30),entity_type:'LEARNING_REPORT',entity_id:id(1),recipient_id:id(25),channel:'EMAIL',delivery_mode:'MOCK',status:'SENT',created_at:snapshot.as_of,sent_at:snapshot.as_of,provider_receipt:'mock-receipt'},
 {id:id(31),entity_type:'LEARNING_REPORT',entity_id:id(1),recipient_id:id(25),channel:'ZALO',delivery_mode:'LIVE',status:'PENDING',created_at:snapshot.as_of,sent_at:null,provider_receipt:null},
 {id:id(32),entity_type:'LEARNING_REPORT',entity_id:id(90),recipient_id:id(25),channel:'EMAIL',status:'SENT',provider_receipt:'OTHER REPORT'}]
 const {html}=await officialReport('PUBLISHED',{}, {notification_jobs:jobs})
 assert.match(html,/DELIVERY HISTORY/);assert.match(html,/mock-receipt/);assert.match(html,/EMAIL · MOCK/);assert.match(html,/PENDING/);assert.doesNotMatch(html,/OTHER REPORT/)
})
test('V2 academic document renders all seven summaries, maps enums, and handles direct assessment',async()=>{
 const teacher_summary=Object.fromEntries(['achievement','difficulty','intervention','next_month_plan','practice_consistency','lesson_preparation','learning_attitude'].map(k=>[k,`V2-${k}`]))
 const s={...snapshot,teacher_summary,academic:{...snapshot.academic,subjects:[{grade:'Grade 3',grade_status:'IN_PROGRESS',name:'Performance',is_required:true,completion_rule:'DIRECT_ASSESSMENT',status:'FAILED',score:42,components:[]}]}}
 const {html}=await officialReport('APPROVED',{snapshot_data:s})
 for(const text of Object.values(teacher_summary)) assert.ok(html.includes(text))
 assert.match(html,/Needs Review/);assert.match(html,/Direct assessment/);assert.doesNotMatch(html,/>FAILED</)
 assert.match(html,/No learning journal entries recorded for this period/)
})
test('official print content excludes internal notes, delivery and administration',async()=>{
 const {html}=await officialReport('PUBLISHED',{snapshot_data:{...snapshot,admin_note:'SECRET INTERNAL NOTE'}})
 const doc=html.slice(html.indexOf('<article class="academic-document learning-report-paper"'),html.indexOf('</article>'))
 assert.doesNotMatch(doc,/SECRET INTERNAL NOTE|SEND EMAIL|SEND ZALO|DELIVERY HISTORY|<button|<form/)
 const css=require('node:fs').readFileSync('app/admin/reports/learning/[id]/print.css','utf8')
 assert.match(css,/@page\s*\{ size: A4 portrait/);assert.match(css,/\.official-learning-report \.report-controls[^}]*display: none !important/)
 assert.match(css,/print-color-adjust: exact/);assert.match(css,/table-header-group/)
})

 test('official layout loads screen stylesheet and paper separates toolbar from content',async()=>{
 const fs=require('node:fs')
 assert.match(fs.readFileSync('app/admin/reports/learning/[id]/layout.tsx','utf8'),/import '.\/print.css'/)
 const {html}=await officialReport('APPROVED',{}, {profiles:[{id:id(21),full_name:'Academic Approver'}]})
 assert.match(html,/Academic Approver/)
 const paperStart=html.indexOf('<article class="academic-document learning-report-paper"')
 assert.ok(paperStart>html.indexOf('learning-report-toolbar'))
 const paper=html.slice(paperStart,html.indexOf('</article>',paperStart))
 assert.doesNotMatch(paper,/PUBLISH REPORT|PRINT \/ PDF|<form/)
 assert.match(paper,/STATUS/);assert.match(paper,/VERSION/)
 assert.doesNotMatch(paper,/APPROVED · VERSION/)
 const css=fs.readFileSync('app/admin/reports/learning/[id]/print.css','utf8')
 assert.match(css,/\.learning-report-paper \{[^}]*max-width: 800px/)
 assert.match(css,/\.learning-report-toolbar, \.learning-report-admin \{ display: none !important/)
 })
 test('academic award labels retain Pass Merit Distinction and legacy safety',async()=>{
 const statuses=['PASS','MERIT','DISTINCTION','NOT_PASSED','EXEMPT']
 const {html}=await officialReport('APPROVED',{snapshot_data:{...snapshot,academic:{...snapshot.academic,subjects:statuses.map(status=>({name:'Subject',grade:'Grade 1',status,score:null,is_required:true,completion_rule:'DIRECT_ASSESSMENT',components:[]}))}}})
 for(const label of ['Pass','Merit','Distinction','Needs Review','Exempt']) assert.ok(html.includes('>'+label+'<'))
 })
