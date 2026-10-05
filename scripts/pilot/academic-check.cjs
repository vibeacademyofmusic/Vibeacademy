/* Authenticated integration checks; only the named synthetic run is mutated. */
const fs=require('node:fs'), assert=require('node:assert/strict'),crypto=require('node:crypto')
const {setup,id,dir,ok,map}=require('./academic-fixture.cjs')
const results=[]
async function check(name,actor,fn){try{const evidence=await fn();results.push({name,actor,status:'PASS',at:new Date().toISOString(),evidence:evidence??'Assertions passed'})}catch(e){results.push({name,actor,status:'FAIL',at:new Date().toISOString(),evidence:e.message})}fs.writeFileSync(`${dir}/api-evidence.json`,JSON.stringify(results,null,2)+'\n')}
async function main(){
 const {clients:c}=await setup(),db=c.ADMIN
 const rpc=async(actor,name,args)=>ok(await c[actor].rpc(name,args),name)
 await check('P1 sees exactly S1 and S2','P1',async()=>{const rows=await rpc('P1','portal_students',{});assert.deepEqual(rows.map(x=>x.id).sort(),[id('S1'),id('S2')].sort());return rows.map(x=>x.id)})
 await check('Student sees self only','S1',async()=>{const rows=await rpc('S1','portal_students',{});assert.deepEqual(rows.map(x=>x.id),[id('S1')])})
 await check('Branch A cannot read S4 branch B','BA',async()=>{assert.equal(ok(await c.BA.from('students').select('id').eq('id',id('S4')),'scoped read').length,0)})
 await check('P2 cannot read S1','P2',async()=>{assert.equal((await rpc('P2','portal_students',{p_student:id('S1')})).length,0)})
 await check('Academic assignment uses existing RPC','ADMIN',async()=>{assert.equal(ok(await db.from('student_curriculum_enrollments').select('id').eq('student_id',id('S1')),'academic').length,1)})
 await check('Unrelated teacher cannot write journal','T3',async()=>{assert.ok((await c.T3.rpc('save_session_learning_context',{p_session:id('SEP-3'),p_content:'DENIED',p_context:null})).error)})
 await check('Primary cannot write substitute session','T1',async()=>{assert.ok((await c.T1.rpc('save_session_learning_context',{p_session:id('SEP-10'),p_content:'DENIED',p_context:null})).error)})
 await check('Branch Admin cannot edit journal','BA',async()=>{assert.ok((await c.BA.rpc('save_session_learning_context',{p_session:id('SEP-3'),p_content:'DENIED',p_context:null})).error)})
 await check('Scheduled session cannot submit journal','T1',async()=>{await rpc('T1','save_session_learning_context',{p_session:id('SEP-28'),p_content:'TEST draft only',p_context:null});assert.ok((await c.T1.rpc('submit_session_learning_journal',{p_session:id('SEP-28')})).error)})
 await check('Completed S1 attendance remains 4 present 1 late 1 absent','ADMIN',async()=>{const rows=ok(await db.from('attendance_records').select('status').eq('enrollment_id',id('enrollment-SEP')),'attendance');assert.equal(rows.length,6);assert.equal(rows.filter(x=>x.status==='PRESENT').length,4);assert.equal(rows.filter(x=>x.status==='LATE').length,1);assert.equal(rows.filter(x=>x.status==='ABSENT').length,1);return rows})
 await check('September report cannot bypass closed-period policy','ADMIN',async()=>{assert.ok((await db.rpc('generate_learning_report',{p_enrollment_id:id('enrollment-SEP'),p_type:'MONTHLY',p_start:'2026-09-01',p_end:'2026-09-30'})).error)})
 for(const type of ['MONTHLY','END_OF_COURSE']){
  const rid=map.objects[type].id
  await check(type+' published snapshot, journal source and portal','ADMIN + P1',async()=>{
   let row=ok(await db.from('learning_reports').select('*').eq('id',rid).single(),'report')
   if(row.status==='DRAFT'){
    await rpc('ADMIN','update_learning_report',{p_id:rid,p_version:row.version,p_action:'REGENERATE'})
    row=ok(await db.from('learning_reports').select('*').eq('id',rid).single(),'report')
    assert.equal(row.draft_data.journals.count,6)
    assert.equal(row.draft_data.attendance.scheduled,6)
    assert.equal(row.draft_data.attendance.rate,83.3)
    assert.equal((await rpc('P1','student_approved_reports',{p_student:id('S1')})).some(x=>x.report_id===rid),false)
    await rpc('ADMIN','update_learning_report',{p_id:rid,p_version:row.version,p_action:'SAVE',p_summary:{achievement:'Chủ động đếm phách và sửa lỗi sau hướng dẫn.',difficulty:'Giữ nhịp đều tại chỗ chuyển ngón.',next_month_plan:'Ôn đoạn đang học với tốc độ chậm, chia thành từng nhóm ngắn.'},p_note:'TEST INTERNAL ONLY — không đưa vào portal/PDF/Zalo.'})
   }
   for(const [status,action]of [['DRAFT','READY'],['READY_FOR_REVIEW','APPROVE'],['APPROVED','PUBLISH']]){
    row=ok(await db.from('learning_reports').select('*').eq('id',rid).single(),'report')
    if(row.status===status)await rpc('ADMIN','update_learning_report',{p_id:rid,p_version:row.version,p_action:action})
   }
   const visible=await rpc('P1','student_approved_reports',{p_student:id('S1')});assert.ok(visible.some(x=>x.report_id===rid));assert.ok(!JSON.stringify(visible).includes('TEST INTERNAL ONLY'))
   const doc=await rpc('P1','learning_report_document',{p_id:rid});assert.equal(doc.snapshot.journals.count,6);assert.ok(doc.snapshot.teacher_summary.achievement)
   assert.equal(await rpc('P2','learning_report_document',{p_id:rid}),null)
   return {report_id:rid,journals:doc.snapshot.journals.count,attendance:doc.snapshot.attendance}
  })
 }
 const rid=map.objects.MONTHLY.id
 await check('Published snapshot immutable after journal revision','T1 + P1',async()=>{
  const before=await rpc('P1','learning_report_document',{p_id:rid})
  const j=ok(await db.from('session_learning_journals').select('*').eq('session_occurrence_id',id('AUG-3')).single(),'journal')
  await rpc('T1','save_session_learning_context',{p_session:id('AUG-3'),p_content:j.content_covered+' · TEST revision',p_context:j.curriculum_context})
  const after=ok(await db.from('session_learning_journals').select('*').eq('id',j.id).single(),'journal')
  assert.equal(after.submitted_at,j.submitted_at);assert.equal(after.submitted_by,j.submitted_by);assert.equal(after.revision_count,j.revision_count+1)
  assert.deepEqual(await rpc('P1','learning_report_document',{p_id:rid}),before)
 })
 for(const [kind,entity]of [['REPORT',rid],['FEEDBACK',map.objects.feedback.id]]){
  await check(kind+' question reply internal note resolve reopen','P1 + T1',async()=>{
   const read=actor=>rpc(actor,'learning_conversation_read',{p_kind:kind,p_entity:entity})
   let t=await read('P1')
   const request=crypto.randomUUID(),body='Xin giáo viên hướng dẫn cách luyện ở nhà để con giữ nhịp đều hơn.'
   const args={p_kind:kind,p_entity:entity,p_request:request,p_version:t.version,p_body:body}
   const sends=await Promise.all([c.P1.rpc('learning_conversation_write',args),c.P1.rpc('learning_conversation_write',args)])
   assert.ok(sends.every(x=>!x.error),JSON.stringify(sends.map(x=>x.error)))
   t=await read('P1');assert.equal(t.messages.filter(x=>x.id===request).length,1)
   await rpc('T1','learning_conversation_write',{p_kind:kind,p_entity:entity,p_request:crypto.randomUUID(),p_version:t.version,p_body:'TEST INTERNAL ONLY — giao người phụ trách kiểm tra chất lượng hướng dẫn.',p_internal:true})
   t=await read('P1');assert.ok(!JSON.stringify(t).includes('TEST INTERNAL ONLY'))
   await rpc('T1','learning_conversation_write',{p_kind:kind,p_entity:entity,p_request:crypto.randomUUID(),p_version:t.version,p_body:'Gia đình hỗ trợ con đếm phách thành tiếng và luyện từng đoạn ngắn ở tốc độ chậm. Giáo viên sẽ kiểm tra lại trong buổi học kế tiếp.',p_resolve:true})
   t=await read('P1');assert.equal(t.state,'RESOLVED')
   await rpc('P1','learning_conversation_write',{p_kind:kind,p_entity:entity,p_request:crypto.randomUUID(),p_version:t.version,p_body:'TEST VIBE — Gia đình xin bổ sung câu hỏi về tốc độ luyện tập.'})
   t=await read('P1');assert.equal(t.state,'OPEN')
   assert.ok((await c.P2.rpc('learning_conversation_read',{p_kind:kind,p_entity:entity})).error)
   assert.ok((await c.T3.rpc('learning_conversation_write',{p_kind:kind,p_entity:entity,p_request:crypto.randomUUID(),p_version:t.version,p_body:'DENIED'})).error)
   assert.ok((await c.P1.rpc('learning_conversation_write',{p_kind:kind,p_entity:entity,p_request:crypto.randomUUID(),p_version:t.version,p_body:'DENIED',p_internal:true})).error)
   return {entity,messages:t.messages.length,state:t.state}
  })
 }
 await check('No real Zalo attempt for this run','ADMIN',async()=>{
  const studentIds=['S1','S2','S3','S4','S5'].map(id)
  const jobs=ok(await db.from('notification_jobs').select('id,status,attempts,provider_message_id,payload').in('student_id',studentIds),'jobs')
  assert.ok(jobs.every(x=>x.attempts===0&&!x.provider_message_id));assert.ok(!JSON.stringify(jobs).includes('TEST INTERNAL ONLY'))
  return jobs.map(({id,status,attempts})=>({id,status,attempts}))
 })
 console.log(JSON.stringify({pass:results.filter(x=>x.status==='PASS').length,fail:results.filter(x=>x.status==='FAIL').length,failed:results.filter(x=>x.status==='FAIL')}))
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
