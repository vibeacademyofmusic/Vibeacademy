/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {harness,id,redirected}=require('./helpers/finance-operations.cjs')
test('substitute assignment delegates to canonical RPC',async()=>{
 const h=harness(); await redirected(h.load('../session-teachers/actions.ts').assignSessionTeacher,{session_id:id(1),teacher_id:id(2),type:'SUBSTITUTE',reason:'Cover'});
 assert.deepEqual(h.calls[1].args,{p_session_id:id(1),p_teacher_id:id(2),p_type:'SUBSTITUTE',p_reason:'Cover'})
})
test('removal is audited via same RPC',async()=>{const h=harness();await redirected(h.load('../session-teachers/actions.ts').assignSessionTeacher,{session_id:id(1),teacher_id:'',type:'PRIMARY',reason:'Restore'});assert.equal(h.calls[1].args.p_teacher_id,null)})
test('invalid assignment and non-admin rejected',async()=>{const h=harness();await redirected(h.load('../session-teachers/actions.ts').assignSessionTeacher,{session_id:id(1),reason:''});assert.equal(h.calls.length,1);const n=harness({},null,false);assert.equal((await redirected(n.load('../session-teachers/actions.ts').assignSessionTeacher,{})).pathname,'/login')})
test('session panel and journal display actual substitute',async()=>{
 const {renderToStaticMarkup}=require('./helpers/finance-operations.cjs')
 const h=harness({session_actual_teachers:[{session_id:id(1),teacher_id:id(2),primary_teacher_id:id(3),assignment_type:'SUBSTITUTE',status:'COMPLETED',is_locked:true}],teachers:[{id:id(2),full_name:'Substitute B'},{id:id(3),full_name:'Primary A'}]})
 const component=h.load('../session-teachers/SessionTeacher.tsx').default
 const html=renderToStaticMarkup(await component({id:id(1),readOnly:true}));assert.match(html,/Substitute B/);assert.match(html,/Dạy thay/)
 const locked=renderToStaticMarkup(await component({id:id(1)}));assert.match(locked,/Phân công đã khóa/);assert.doesNotMatch(locked,/name="teacher_id"/)
})
