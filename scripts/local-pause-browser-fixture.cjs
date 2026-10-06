// Dedicated local-only fixture. Browser Owner credentials and cookies are never read.
const fs = require('node:fs')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { createClient } = require('@supabase/supabase-js')
const RUN = 'TEST OWNER PAUSE 20260930'
const dir = 'docs/verification/owner-pause-20260930/raw'
const secretPath = '/private/tmp/vibe-owner-pause-20260930-actors.json'
const manifestPath = dir + '/fixture.json'
const owner = '25073c07-90f9-415a-8862-8dbdadd9c8b0'
const id = n => `d7300000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ids = { branch:id(1), curriculum:id(2), level:id(3), subject:id(4), course:id(5), teacher:id(6), room:id(7), class:id(8), classTeacher:id(9), schedule:id(10), students:[id(11),id(12)], enrollments:[id(21),id(22)] }
const quote = s => "'" + String(s).replaceAll("'", "''") + "'"
const sql = s => execFileSync('docker', ['exec','-i','supabase_db_vibe-academy-system','psql','-U','postgres','-d','postgres','-q','-XAt','-v','ON_ERROR_STOP=1'], { input:s, encoding:'utf8' }).trim()
const ok = r => { if (r.error) throw Error(r.error.message); return r.data }
function fingerprint() { return JSON.parse(sql(`create temp table fingerprints(name text, n bigint, digest text);
do $$ declare t record; n bigint; d text; begin
for t in select tablename from pg_tables where schemaname='public' loop
execute format($q$select count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by md5(to_jsonb(r)::text)),'')) from public.%I r$q$,t.tablename) into n,d;
insert into fingerprints values(t.tablename,n,d); end loop; end $$;
select jsonb_object_agg(name,jsonb_build_object('count',n,'digest',digest)) from fingerprints;`)) }
async function setup() {
  assert.equal(process.env.ZALO_PILOT_OUTBOUND, 'disabled')
  const out=execFileSync('node_modules/.bin/supabase',['status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
  const env=Object.fromEntries([...out.matchAll(/^([A-Z0-9_]+)="([^\"]*)"$/gm)].map(m=>[m[1],m[2]]))
  assert.equal(env.API_URL,'http://127.0.0.1:54321')
  const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>{assert.equal(new URL(url).origin,env.API_URL);return fetch(url,{...init,redirect:'error'})}}}
  const root=createClient(env.API_URL,env.SERVICE_ROLE_KEY,options)
  let actors=fs.existsSync(secretPath)?JSON.parse(fs.readFileSync(secretPath)):{}
  const mode=process.argv[2]
  if(mode==='seed') {
    assert.ok(!fs.existsSync(manifestPath),'Fixture already exists; never overwrite ownership or baseline')
    fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/before.json',JSON.stringify(fingerprint(),null,2)+'\n')
    assert.equal(sql(`select count(*) from branches where id=${quote(ids.branch)} or code='TEST_OWNER_PAUSE_20260930';`),'0')
    for(const [name,role] of Object.entries({ADMIN:'SUPER_ADMIN',STAFF:'STAFF'})) {
      const email=`owner-pause.${name.toLowerCase()}.20260930@example.test`
      assert.ok(!ok(await root.auth.admin.listUsers({perPage:1000})).users.some(u=>u.email===email),'Refuse pre-existing test identity')
      const password=crypto.randomBytes(24).toString('base64url')+'aA!7'
      const user=ok(await root.auth.admin.createUser({email,password,email_confirm:true})).user
      actors[name]={id:user.id,email,password,role}
      fs.writeFileSync(secretPath,JSON.stringify(actors),{mode:0o600})
      sql(`begin; insert into public.profiles(id,full_name,status) values(${quote(user.id)},${quote(RUN+' '+name)},'ACTIVE') on conflict(id) do update set full_name=excluded.full_name;
      insert into public.user_roles(user_id,role_id) select ${quote(user.id)},id from public.roles where code=${quote(role)}; commit;`)
    }
  }
  const clients={}
  for(const [name,a] of Object.entries(actors)) { clients[name]=createClient(env.API_URL,env.ANON_KEY,options);ok(await clients[name].auth.signInWithPassword({email:a.email,password:a.password})) }
  return {root,clients,actors}
}
async function seed(c,actors) {
 const manifest={run:RUN,ids,actors:Object.fromEntries(Object.entries(actors).map(([k,a])=>[k,{id:a.id,role:a.role}])),owner,cases:[]}
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n')
 sql(`begin;
 insert into branches(id,code,name) values('${ids.branch}','TEST_OWNER_PAUSE_20260930','${RUN} branch');
 insert into curriculums(id,code,name) values('${ids.curriculum}','TEST_OWNER_PAUSE_20260930','${RUN} curriculum');
 insert into curriculum_levels(id,curriculum_id,code,name,sequence_no) values('${ids.level}','${ids.curriculum}','G1','TEST Grade 1',1);
 insert into curriculum_subjects(id,level_id,family_code,code,name,completion_rule) values('${ids.subject}','${ids.level}','TEST','TEST_OWNER_PAUSE_20260930','TEST direct subject','DIRECT_ASSESSMENT');
 insert into courses(id,curriculum_id,level_id,code,name) values('${ids.course}','${ids.curriculum}','${ids.level}','TEST_OWNER_PAUSE_20260930','${RUN} course');
 insert into teachers(id,teacher_code,full_name,status) values('${ids.teacher}','TEST_OWNER_PAUSE_20260930','${RUN} teacher','ACTIVE');
 insert into teacher_branches(teacher_id,branch_id,is_primary) values('${ids.teacher}','${ids.branch}',true);
 insert into rooms(id,branch_id,code,name,capacity) values('${ids.room}','${ids.branch}','TEST_OWNER_PAUSE_20260930','${RUN} room',5);
 insert into classes(id,branch_id,course_id,code,name,class_type,capacity,status,start_date,end_date,accepted_from_level_id,accepted_to_level_id)
 values('${ids.class}','${ids.branch}','${ids.course}','TEST_OWNER_PAUSE_20260930','${RUN} class','GROUP',5,'ACTIVE','2026-09-30','2027-09-29','${ids.level}','${ids.level}');
 insert into class_teachers(id,class_id,teacher_id,teacher_role,assigned_at) values('${ids.classTeacher}','${ids.class}','${ids.teacher}','PRIMARY','2026-09-30');
 insert into schedules(id,class_id,room_id,day_of_week,start_time,end_time,effective_from,effective_to,timezone)
 values('${ids.schedule}','${ids.class}','${ids.room}',3,'08:00','09:00','2026-09-30','2027-09-29','Asia/Ho_Chi_Minh');
 ${ids.students.map((student,i)=>`insert into students(id,student_code,full_name,default_branch_id,status,notes) values('${student}','TEST_OWNER_PAUSE_${i}','${RUN} — ${i?'REJECT':'APPROVE'}','${ids.branch}','ACTIVE','${RUN}');`).join('\n')}
 commit;`)
 for(let i=0;i<2;i++) {
   ok(await c.ADMIN.rpc('assign_student_academic_program',{p_student_id:ids.students[i],p_curriculum_id:ids.curriculum,p_level_id:ids.level,p_started_at:'2026-09-30'}))
   sql(`insert into enrollments(id,student_id,class_id,student_curriculum_enrollment_id,started_at,enrolled_at,status)
   select '${ids.enrollments[i]}','${ids.students[i]}','${ids.class}',id,'2026-09-30','2026-09-30','ACTIVE' from student_curriculum_enrollments where student_id='${ids.students[i]}' and curriculum_id='${ids.curriculum}';`)
   const reason=RUN+' — '+(i?'REJECT':'APPROVE')+' — synthetic only'
   const result=ok(await c.ADMIN.rpc('request_enrollment_pause',{p_enrollment_id:ids.enrollments[i],p_starts_on:'2026-10-02',p_ends_on:'2026-10-03',p_reason:reason}))
   assert.equal(result.ok,true,JSON.stringify(result));manifest.cases.push({request:result.request_id,enrollment:ids.enrollments[i],reason,expected:i?'REJECTED':'APPROVED'})
   fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n')
 }
 const query=ok(await c.ADMIN.from('enrollment_pause_requests').select('id,starts_on,ends_on,reason,status,decided_at,decision_note,decided_by,enrollments(id,students(full_name,student_code),classes(name,code,branches(name)))').eq('status','REQUESTED').order('created_at',{ascending:false}).limit(50))
 assert.deepEqual(new Set(query.map(r=>r.id)),new Set(manifest.cases.map(x=>x.request)))
 for(const x of manifest.cases) {const r=await c.STAFF.rpc('decide_enrollment_pause',{p_request_id:x.request,p_approve:true,p_note:RUN+' forbidden'});assert.ok(r.error);assert.notEqual(r.error.code,'PGRST202')}
 assert.equal(ok(await c.STAFF.from('enrollment_pause_requests').select('id')).length,0)
 fs.writeFileSync(dir+'/requested.json',JSON.stringify(query,null,2)+'\n')
 console.log(JSON.stringify({run:RUN,requested:query.length,unauthorized_write_denied:true,unauthorized_read_empty:true}))
}
async function verify(c) {
 const manifest=JSON.parse(fs.readFileSync(manifestPath));const evidence=[]
 for(const x of manifest.cases) {
  const row=ok(await c.ADMIN.from('enrollment_pause_requests').select('*').eq('id',x.request).single())
  assert.equal(row.status,x.expected);assert.equal(row.decided_by,owner);assert.ok(row.decided_at);assert.ok(row.decision_note.includes(RUN))
  const before=sql(`select jsonb_agg(to_jsonb(t) order by id) from enrollment_pause_events t where request_id=${quote(x.request)};`)
  for(const approve of [true,false]) {const r=await c.STAFF.rpc('decide_enrollment_pause',{p_request_id:x.request,p_approve:approve,p_note:RUN+' forbidden retry'});assert.ok(r.error)}
  const repeated=ok(await c.ADMIN.rpc('decide_enrollment_pause',{p_request_id:x.request,p_approve:x.expected==='APPROVED',p_note:RUN+' retry'}))
  if(x.expected==='APPROVED') {assert.equal(repeated.repeated,true);assert.equal(repeated.pause_id,row.pause_id)} else {assert.equal(repeated.ok,false)}
  const opposite=ok(await c.ADMIN.rpc('decide_enrollment_pause',{p_request_id:x.request,p_approve:x.expected!=='APPROVED',p_note:RUN+' opposite retry'}));assert.equal(opposite.ok,false)
  assert.deepEqual(ok(await c.ADMIN.from('enrollment_pause_requests').select('*').eq('id',x.request).single()),row)
  assert.equal(sql(`select jsonb_agg(to_jsonb(t) order by id) from enrollment_pause_events t where request_id=${quote(x.request)};`),before)
  if(row.pause_id) assert.equal(ok(await c.ADMIN.from('enrollment_pauses').select('status').eq('id',row.pause_id).single()).status,'ACTIVE')
  evidence.push({...row,retries_added_events:0,unauthorized_denied:true})
 }
 assert.equal(ok(await c.ADMIN.from('enrollment_pause_requests').select('id').eq('status','REQUESTED')).length,0)
 fs.writeFileSync(dir+'/decisions.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({decisions:evidence.length,owner,persistence:'PASS',no_repeat_mutation:true}))
}
async function cleanup(root,c,actors) {
 const m=JSON.parse(fs.readFileSync(manifestPath));assert.equal(m.run,RUN)
 for(const x of m.cases) {const r=ok(await c.ADMIN.from('enrollment_pause_requests').select('*').eq('id',x.request).single());assert.equal(r.reason,x.reason);if(r.pause_id&&r.status==='APPROVED')assert.equal(ok(await c.ADMIN.rpc('cancel_active_pause',{p_pause_id:r.pause_id,p_note:RUN+' supported cancellation before cleanup'})).ok,true)}
 const requestIds=m.cases.map(x=>quote(x.request)).join(',');const enrollIds=ids.enrollments.map(quote).join(',');const studentIds=ids.students.map(quote).join(',')
 // Existing local fixture cleanup pattern: exclusive lock, exact ownership assertions,
 // one transaction, deletion guard restored before commit. Never used for acceptance.
 sql(`begin;
 do $$ begin if (select count(*) from students where id in (${studentIds}) and notes='${RUN}')<>2 then raise exception 'Fixture ownership mismatch';end if;end $$;
 lock table enrollment_pauses in access exclusive mode;
 delete from enrollment_pause_events where request_id in (${requestIds}) and enrollment_id in (${enrollIds});
 delete from enrollment_pause_requests where id in (${requestIds}) and enrollment_id in (${enrollIds}) and reason like '${RUN}%';
 alter table enrollment_pauses disable trigger trg_guard_enrollment_pause_change;
 delete from enrollment_pauses where enrollment_id in (${enrollIds}) and reason like '${RUN}%' and status='CANCELLED';
 alter table enrollment_pauses enable trigger trg_guard_enrollment_pause_change;
 delete from enrollments where id in (${enrollIds}) and class_id='${ids.class}';
 delete from student_curriculum_enrollments where student_id in (${studentIds}) and curriculum_id='${ids.curriculum}';
 delete from students where id in (${studentIds}) and notes='${RUN}';
 delete from schedules where id='${ids.schedule}' and class_id='${ids.class}';
 delete from class_teachers where id='${ids.classTeacher}' and class_id='${ids.class}';
 delete from classes where id='${ids.class}' and code='TEST_OWNER_PAUSE_20260930';
 delete from rooms where id='${ids.room}' and branch_id='${ids.branch}';
 delete from teacher_branches where teacher_id='${ids.teacher}' and branch_id='${ids.branch}';
 delete from teachers where id='${ids.teacher}' and teacher_code='TEST_OWNER_PAUSE_20260930';
 delete from courses where id='${ids.course}' and curriculum_id='${ids.curriculum}';
 delete from curriculum_subjects where id='${ids.subject}' and level_id='${ids.level}';
 delete from curriculum_levels where id='${ids.level}' and curriculum_id='${ids.curriculum}';
 delete from curriculums where id='${ids.curriculum}' and code='TEST_OWNER_PAUSE_20260930';
 delete from branches where id='${ids.branch}' and code='TEST_OWNER_PAUSE_20260930';
 commit;`)
 for(const a of Object.values(actors)) {assert.match(a.email,/^owner-pause\.(admin|staff)\.20260930@example\.test$/);ok(await root.auth.admin.deleteUser(a.id))}
 const after=fingerprint();fs.writeFileSync(dir+'/after.json',JSON.stringify(after,null,2)+'\n');assert.deepEqual(after,JSON.parse(fs.readFileSync(dir+'/before.json')),'Cleanup must preserve every unrelated public row')
 assert.equal(sql("select tgenabled from pg_trigger where tgname='trg_guard_enrollment_pause_change';"),'O')
 fs.writeFileSync(dir+'/cleanup.json',JSON.stringify({run:RUN,all_unrelated_public_rows_unchanged:true,guard_restored:true,owned_requests_removed:2,local_test_accounts_removed:2},null,2)+'\n');console.log('PASS exact fixture cleanup; unrelated public data unchanged; guard enabled')
}
async function main(){const {root,clients,actors}=await setup();if(process.argv[2]==='seed')await seed(clients,actors);else if(process.argv[2]==='verify')await verify(clients);else if(process.argv[2]==='cleanup')await cleanup(root,clients,actors);else throw Error('Use seed, verify or cleanup')}
main().catch(e=>{console.error(e.message);process.exitCode=1})
