/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {harness,id,redirected,renderToStaticMarkup}=require('./helpers/finance-operations.cjs')
const form = values => { const f=new FormData(); for(const [k,v] of Object.entries(values)) f.set(k,v); return f }
const base='../feedback/'
const f={id:id(1),session_occurrence_id:id(2),student_id:id(3),teacher_id:id(4),branch_id:id(5),respondent_type:'PARENT',session_starts_at:'2026-08-03T02:00:00Z',submitted_at:'2026-08-04T02:00:00Z',overall_rating:2,is_low_rating:true,resolution_status:'NEEDS_REVIEW',version:1,comment:'Test comment',context_snapshot:{student_name:'Student A',student_code:'A',teacher_name:'Teacher A',branch_name:'Cần Thơ',class_name:'Piano',respondent_name:'Parent A'}}
test('feedback list applies server filters and pagination',async()=>{
 const h=harness();await h.load(base+'data.ts').feedbackList(h.db,{branch:id(5),teacher:id(4),rating:'2',respondent:'PARENT',status:'NEEDS_REVIEW',review:'yes',from:'2026-08-01',to:'2026-08-31',page:'2'});const q=h.calls[0];assert.deepEqual(q.range,[25,50]);assert.equal(q.filters.length,8);assert.doesNotMatch(q.fields,/comment|resolution_note/)
})
test('feedback list shows low rating and multiple branches',async()=>{
 const h=harness({lesson_feedback:[f,{...f,id:id(9),context_snapshot:{...f.context_snapshot,branch_name:'Hà Nội'}}]});const html=renderToStaticMarkup(await h.load(base+'page.tsx').default({searchParams:Promise.resolve({})}));for(const t of ['Điểm thấp','Cần Thơ','Hà Nội','Teacher A','Phụ huynh']) assert.ok(html.includes(t),t)
})
test('empty feedback list is explicit',async()=>{const h=harness();assert.match(renderToStaticMarkup(await h.load(base+'page.tsx').default({searchParams:Promise.resolve({})})),/Chưa có dữ liệu/)})
test('detail renders all dimensions context and resolution history',async()=>{
 const h=harness({lesson_feedback:[{...f,lesson_quality_rating:3,teacher_communication_rating:2,progress_perception_rating:4}],lesson_feedback_events:[{id:id(8),feedback_id:id(1),status:'IN_REVIEW',note:'Called parent',actor_id:id(7),created_at:f.submitted_at}]});const html=renderToStaticMarkup(await h.load(base+'[id]/page.tsx').default({params:Promise.resolve({id:id(1)}),searchParams:Promise.resolve({})}));for(const t of ['Test comment','Parent A','Called parent','Lưu xử lý']) assert.ok(html.includes(t),t)
})
test('resolution passes version and note through guarded RPC',async()=>{
 const h=harness();await redirected(h.load(base+'actions.ts').resolveFeedback,{id:id(1),version:1,status:'RESOLVED',note:'Discussed'});assert.deepEqual(h.calls[1].args,{p_id:id(1),p_version:1,p_status:'RESOLVED',p_note:'Discussed'})
})
test('resolution rejects missing note and unauthorized user',async()=>{
 const h=harness();await redirected(h.load(base+'actions.ts').resolveFeedback,{id:id(1),version:1,status:'RESOLVED',note:''});assert.equal(h.calls.length,1)
 const denied=harness({},null,false);assert.equal((await redirected(denied.load(base+'actions.ts').resolveFeedback,{})).pathname,'/login')
})
test('resolved feedback supports reopening but keeps original rating',async()=>{const h=harness({lesson_feedback:[{...f,resolution_status:'RESOLVED',resolution_note:'Done'}]});const html=renderToStaticMarkup(await h.load(base+'[id]/page.tsx').default({params:Promise.resolve({id:id(1)}),searchParams:Promise.resolve({})}));assert.match(html,/Mở lại để xử lý/);assert.match(html,/Điểm thấp/);assert.doesNotMatch(html,/name="overall_rating"/)})
test('submission action uses current auth and ignores claimed respondent user ID',async()=>{
 const h=harness({},null,false);const r=await h.load('../../feedback/actions.ts').submitLessonFeedback(form({session_id:id(2),student_id:id(3),respondent_type:'STUDENT',overall:'4',respondent_user_id:id(9)}));assert.equal(r.success,true);assert.equal(h.calls[0].rpc,'submit_lesson_feedback');assert.equal(h.calls[0].args.p_respondent_user_id,undefined)
})
test('submission rejects invalid optional ratings and unauthenticated caller',async()=>{
 const h=harness();assert.ok((await h.load('../../feedback/actions.ts').submitLessonFeedback(form({session_id:id(2),student_id:id(3),respondent_type:'PARENT',overall:'4',quality:'6'}))).error);assert.equal(h.calls.length,0)
 const anon=harness({},null,false,false);assert.ok((await anon.load('../../feedback/actions.ts').submitLessonFeedback(form({}))).error)
})
