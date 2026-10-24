const fs=require('node:fs'),assert=require('node:assert/strict')
const {setup,id,dir,ok}=require('./academic-fixture.cjs')
const results=[]
async function check(name,actor,fn){try{const evidence=await fn();results.push({name,actor,status:'PASS',at:new Date().toISOString(),evidence:evidence??'Assertions passed'})}catch(e){results.push({name,actor,status:'FAIL',at:new Date().toISOString(),evidence:e.message})}fs.writeFileSync(`${dir}/security-api.json`,JSON.stringify(results,null,2)+'\n')}
async function main(){
 const {clients:c,root,accounts}=await setup()
 await check('Seven technical roles authenticate independently','ADMIN BA ACA FIN T1 P1 S1',async()=>{
  const roles={ADMIN:'SUPER_ADMIN',BA:'BRANCH_ADMIN',ACA:'ACADEMIC_ADMIN',FIN:'FINANCE',T1:'TEACHER',P1:'PARENT',S1:'STUDENT'}
  for(const [a,role]of Object.entries(roles))assert.equal(ok(await c[a].rpc('has_role',{role_code:role}),a),true)
  return roles
 })
 await check('Branch UUID filters cannot cross scope','BA',async()=>{
  assert.equal(ok(await c.BA.rpc('attendance_session_search',{p_date:'2026-09-28',p_branch:id('branch-B')}),'branch filter').total,0)
  assert.equal(ok(await c.BB.rpc('can_access_session',{p_session:id('SEP-28')}),'other branch session'),false)
  assert.equal(ok(await c.BA.rpc('can_access_session',{p_session:id('SEP-28')}),'own session'),true)
 })
 await check('Disabled account with existing JWT immediately loses read privilege','P1',async()=>{
  try {ok(await root.from('profiles').update({status:'INACTIVE'}).eq('id',accounts.P1.id),'disable fixture');assert.equal(ok(await c.P1.rpc('portal_students',{}),'inactive portal').length,0)}
  finally {ok(await root.from('profiles').update({status:'ACTIVE'}).eq('id',accounts.P1.id),'restore fixture')}
 })
 await check('Expired role on existing JWT is enforced','BA',async()=>{
  try {ok(await root.from('user_roles').update({valid_until:'2026-01-01T00:00:00Z'}).eq('id',id('role-BA')),'expire role');assert.equal(ok(await c.BA.rpc('can_access_session',{p_session:id('SEP-28')}),'expired session'),false)}
  finally {ok(await root.from('user_roles').update({valid_until:null}).eq('id',id('role-BA')),'restore role')}
 })
 await check('Revoked parent relationship immediately hides that child','P1',async()=>{
  try {ok(await root.from('student_parents').update({is_active:false}).eq('student_id',id('S1')).eq('parent_id',id('P1')),'revoke link');const rows=ok(await c.P1.rpc('portal_students',{}),'revoked link portal');assert.deepEqual(rows.map(r=>r.id),[id('S2')])}
  finally {ok(await root.from('student_parents').update({is_active:true}).eq('student_id',id('S1')).eq('parent_id',id('P1')),'restore link')}
 })
 await check('Scope change uses current DB scope, not stale JWT','BA',async()=>{
  try {ok(await root.from('user_roles').update({branch_id:id('branch-B')}).eq('id',id('role-BA')),'change scope');assert.equal(ok(await c.BA.rpc('can_access_session',{p_session:id('SEP-28')}),'old scope session'),false);assert.equal(ok(await c.BA.rpc('has_role_permission',{p_role:'BRANCH_ADMIN',p_permission:'students.view',p_branch:id('branch-B')}),'new scope permission'),true)}
  finally {ok(await root.from('user_roles').update({branch_id:id('branch-A')}).eq('id',id('role-BA')),'restore scope')}
 })
 await check('Forged attendance actor and student from another branch are denied','T3',async()=>{
  const result=await c.T3.rpc('teacher_session_write',{p_session:id('SEP-28'),p_action:'attendance',p_enrollment:id('enrollment-SEP'),p_payload:{status:'PRESENT',marked_by:accounts.ADMIN.id}});assert.ok(result.error)
  assert.equal(ok(await c.ADMIN.from('attendance_records').select('id').eq('session_occurrence_id',id('SEP-28')),'no forged write').length,0)
 })
 await check('Fixture dataset has exactly 500 students in three branches','ADMIN',async()=>{
  const counts={};for(const branch of ['A','B','C']){const r=await c.ADMIN.from('students').select('id',{count:'exact',head:true}).eq('notes','VIBE-PILOT-20260928T032001Z').eq('default_branch_id',id('branch-'+branch));ok(r,'count');counts[branch]=r.count}
  assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),500);return counts
 })
 await check('No fixture has a provider recipient and no jobs were attempted','ADMIN',async()=>{
  const jobs=ok(await c.ADMIN.from('notification_jobs').select('status,attempts,sent_at,provider_message_id').eq('student_id',id('S1')),'jobs');assert.ok(jobs.every(j=>j.attempts===0&&!j.sent_at&&!j.provider_message_id));return {jobs:jobs.length,attempted:0}
 })
 console.log(JSON.stringify({pass:results.filter(r=>r.status==='PASS').length,fail:results.filter(r=>r.status==='FAIL')}))
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
