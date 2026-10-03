const test = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected, renderToStaticMarkup } = require('./helpers/finance-operations.cjs')
const path = '../academic/pause-requests/'
const form = {request_id:id(1),decision:'approve',note:'TEST decision',status:'REQUESTED'}
function setup(status='REQUESTED', allowed=true, body={ok:true}) {
 const h=harness({enrollment_pause_requests:[{id:id(1),status,reason:'TEST',starts_on:'2026-10-02',ends_on:'2026-10-03',enrollments:null}]})
 h.db.rpc=async(name,args)=>{h.calls.push({rpc:name,args});return {data:name==='academic_ops_may_manage'?allowed:body,error:null}}
 return h
}
test('query failures render an alert rather than an empty-state success',async()=>{
 const h=setup();h.db.from=()=>({select(){return this},eq(){return this},order(){return this},limit(){return Promise.resolve({data:null,error:{message:'private query details'}})}})
 const html=renderToStaticMarkup(await h.load(path+'page.tsx').default({searchParams:Promise.resolve({status:'REQUESTED'})}))
 assert.match(html,/Không tải được danh sách yêu cầu/);assert.doesNotMatch(html,/Không có yêu cầu ở trạng thái này|private query details/)
})
test('a successful zero-row query renders the correct empty state',async()=>{
 const h=harness({enrollment_pause_requests:[]})
 const html=renderToStaticMarkup(await h.load(path+'page.tsx').default({searchParams:Promise.resolve({status:'REQUESTED'})}))
 assert.match(html,/Không có yêu cầu ở trạng thái này/);assert.doesNotMatch(html,/Không tải được danh sách yêu cầu/)
})
test('authorized REQUESTED decision preserves the RPC authorization boundary',async()=>{
 const h=setup();const url=await redirected(h.load(path+'actions.ts').decidePauseRequest,form)
 assert.ok(url.searchParams.has('success'));assert.deepEqual(h.calls.find(c=>c.rpc==='decide_enrollment_pause').args,{p_request_id:id(1),p_approve:true,p_note:'TEST decision'})
})
test('stale approved and rejected forms cannot send another decision',async()=>{
 for(const status of ['APPROVED','REJECTED']) {const h=setup(status);const url=await redirected(h.load(path+'actions.ts').decidePauseRequest,form);assert.ok(url.searchParams.has('error'));assert.ok(!h.calls.some(c=>c.rpc==='decide_enrollment_pause'))}
})
test('unauthorized users are denied before loading or deciding the request',async()=>{
 const h=setup('REQUESTED',false);const url=await redirected(h.load(path+'actions.ts').decidePauseRequest,form)
 assert.equal(url.pathname,'/login');assert.ok(!h.calls.some(c=>c.table||c.rpc==='decide_enrollment_pause'))
})
test('a raced idempotent RPC retry is shown as blocked, never a new decision',async()=>{
 const h=setup('REQUESTED',true,{ok:true,repeated:true,pause_id:id(2)})
 const url=await redirected(h.load(path+'actions.ts').decidePauseRequest,form)
 assert.ok(url.searchParams.has('error'));assert.ok(!url.searchParams.has('success'));assert.match(url.searchParams.get('error'),/Không ghi thêm/)
})
test('request-read failures stop mutation and do not pretend the request is absent',async()=>{
 const h=setup();h.db.from=()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:{message:'query failed'}})})
 const url=await redirected(h.load(path+'actions.ts').decidePauseRequest,form)
 assert.match(url.searchParams.get('error'),/Không tải được yêu cầu/);assert.ok(!h.calls.some(c=>c.rpc==='decide_enrollment_pause'))
})
