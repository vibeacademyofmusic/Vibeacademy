/* LOCAL ONLY. Dedicated synthetic accounts; business writes use authenticated JWTs.
 * Credentials stay in /tmp mode 0600, never in the manifest or console. No send API.
 */
const fs = require('node:fs')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { createClient } = require('@supabase/supabase-js')
const RUN = 'VIBE-PILOT-20260928T032001Z'
const dir = 'docs/verification/system-pilot-20260928T032001Z'
const secretPath = '/private/tmp/vibe-pilot-20260928T032001Z/accounts.json'
const mappingPath = `${dir}/mapping.json`
const id = ref => { const h=crypto.createHash('sha256').update(`${RUN}/${ref}`).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}` }
const map=fs.existsSync(mappingPath)?JSON.parse(fs.readFileSync(mappingPath)): {run_id:RUN,objects:{},blockers:[]}
function persist(){fs.writeFileSync(mappingPath,JSON.stringify(map,null,2)+'\n')}
function ok(r,label){if(r.error)throw Error(`${label}: ${r.error.message}`);return r.data}
const sql=s=>execFileSync('docker',['exec','-i','supabase_db_vibe-academy-system','psql','-U','postgres','-d','postgres','-XAt','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
async function setup(){
 require('@next/env').loadEnvConfig(process.cwd())
 if(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin!=='http://127.0.0.1:54321')throw Error('Wrong app database')
 const status=execFileSync('node_modules/.bin/supabase',['status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
 const env=Object.fromEntries([...status.matchAll(/^([A-Z0-9_]+)="([^"]*)"$/gm)].map(m=>[m[1],m[2]]))
 if(env.API_URL!=='http://127.0.0.1:54321')throw Error('Wrong Supabase database')
 const options={auth:{autoRefreshToken:false,persistSession:false},global:{fetch:(url,init)=>{if(new URL(url).origin!==env.API_URL)throw Error('Non-local HTTP denied');return fetch(url,{...init,redirect:'error'})}}}
 const root=createClient(env.API_URL,env.SERVICE_ROLE_KEY,options)
 let accounts=fs.existsSync(secretPath)?JSON.parse(fs.readFileSync(secretPath)):{}
 const roles={ADMIN:'SUPER_ADMIN',BA:'BRANCH_ADMIN',BB:'BRANCH_ADMIN',ACA:'ACADEMIC_ADMIN',FIN:'FINANCE',T1:'TEACHER',T2:'TEACHER',T3:'TEACHER',S1:'STUDENT',S2:'STUDENT',S3:'STUDENT',S4:'STUDENT',S5:'STUDENT',P1:'PARENT',P2:'PARENT',P3:'PARENT',P4:'PARENT'}
 for (const b of ['A','B','C'])ok(await root.from('branches').upsert({id:id('branch-'+b),code:'TEST-P032001-'+b,name:'TEST Pilot — Chi nhánh '+b}),'test branch bootstrap')
 const roleRows=ok(await root.from('roles').select('id,code'),'roles')
 for(const [ref,role]of Object.entries(roles)){
  const email=`vibe.pilot032001.${ref.toLowerCase()}.20260928@example.test`
  if(!accounts[ref]){
   const password=crypto.randomBytes(27).toString('base64url')+'aA!7'
   const user=ok(await root.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`TEST VIBE ${ref} ${RUN}`}}),`create auth ${ref}`).user
   accounts[ref]={email,password,id:user.id}
   fs.writeFileSync(secretPath,JSON.stringify(accounts),{mode:0o600});fs.chmodSync(secretPath,0o600)
  }
  const a=accounts[ref]
  ok(await root.from('profiles').upsert({id:a.id,full_name:`TEST VIBE ${ref} ${RUN}`,status:'ACTIVE'}),'profile bootstrap')
  const branch=ref==='BA'?id('branch-A'):ref==='BB'?id('branch-B'):null
  // Branch B is test-owned foundation, created before role link.
  ok(await root.from('user_roles').upsert({id:id('role-'+ref),user_id:a.id,role_id:roleRows.find(r=>r.code===role).id,branch_id:branch}),'role bootstrap')
  map.objects['actor-'+ref]={id:a.id,email,role}
 }
 const clients={}
 for(const [ref,a]of Object.entries(accounts)){
  clients[ref]=createClient(env.API_URL,env.ANON_KEY,options)
  ok(await clients[ref].auth.signInWithPassword({email:a.email,password:a.password}),`login ${ref}`)
 }
 persist();return {clients,root,accounts}
}
async function ensure(db,table,ref,row){
 const key=id(ref); const existing=ok(await db.from(table).select('id').eq('id',key).maybeSingle(),`read ${ref}`)
 if(!existing)ok(await db.from(table).insert({id:key,...row}),`create ${ref}`)
 map.objects[ref]={id:key,table};persist();return key
}
async function main(){
 fs.mkdirSync(dir,{recursive:true})
 const {clients:c,accounts}=await setup();const db=c.ADMIN
 const branches={A:id('branch-A'),B:id('branch-B'),C:id('branch-C')}
 for(let n=6;n<=500;n++)await ensure(db,'students','load-'+n,{student_code:'TEST-P032001-L'+n,full_name:'TEST Pilot — Học viên '+String(n).padStart(3,'0'),default_branch_id:branches[['A','B','C'][n%3]],admission_date:'2026-08-01',notes:RUN})
 const curricula=ok(await db.from('curriculums').select('*'),'curricula')
 const levels=ok(await db.from('curriculum_levels').select('*'),'levels')
 map.blockers=[]
 // Existing approved academic structure is read-only for this pilot fixture.
 const specs=[['S1','Minh An','Piano','Grade 1','A','P1'],['S2','Bảo Nhi','Piano','Pre Step','A','P1'],['S3','Gia Huy','Drums','Pre','A','P2'],['S4','Khánh Linh','Guitar','Grade 4','B','P3'],['S5','Tuệ Minh','Violin','Grade 7','A','P4']]
 for(let i=1;i<=4;i++)await ensure(db,'parents','P'+i,{user_id:accounts['P'+i].id,parent_code:`TEST-P032001-P${i}`})
 for(const [ref,name,program,level,b,parent]of specs){
  await ensure(db,'students',ref,{student_code:`TEST-P032001-${ref}`,full_name:`TEST VIBE — ${name}`,user_id:accounts[ref].id,default_branch_id:branches[b],admission_date:'2026-08-01',notes:RUN})
  const link=ok(await db.from('student_parents').select('student_id').eq('student_id',id(ref)).eq('parent_id',id(parent)),'parent link')
  if(!link.length)ok(await db.from('student_parents').insert({student_id:id(ref),parent_id:id(parent),relationship:'PARENT',is_primary:true}),'link parent')
  const cur=curricula.find(x=>x.name===program);const lev=levels.find(x=>x.curriculum_id===cur.id&&x.name===level)
  if(!lev||lev.status!=='ACTIVE'){map.blockers.push(`${ref}: ${program} ${level} not academically ready`);continue}
  const existing=ok(await db.from('student_curriculum_enrollments').select('id').eq('student_id',id(ref)).eq('curriculum_id',cur.id),'academic enrollment')
  const aid=existing[0]?.id||ok(await db.rpc('assign_student_academic_program',{p_student_id:id(ref),p_curriculum_id:cur.id,p_level_id:lev.id,p_started_at:'2026-08-01',p_is_primary:true}),`assign academic ${ref}`)
  map.objects[`${ref}-academic`]={id:aid,table:'student_curriculum_enrollments'}
 }
 for(const ref of ['T1','T2','T3'])await ensure(db,'teachers',ref,{teacher_code:`TEST-P032001-${ref}`,full_name:`TEST VIBE — ${ref}`,user_id:accounts[ref].id,notes:RUN})
 for(const ref of ['T1','T2','T3']) { const existing=ok(await db.from('teacher_branches').select('teacher_id').eq('teacher_id',id(ref)).eq('branch_id',branches.A),'teacher branch'); if(!existing.length)ok(await db.from('teacher_branches').insert({teacher_id:id(ref),branch_id:branches.A,is_primary:true}),'teacher branch'); }
 const piano=curricula.find(x=>x.name==='Piano');const g1=levels.find(x=>x.curriculum_id===piano.id&&x.name==='Grade 1')
 await ensure(db,'courses','course',{curriculum_id:piano.id,level_id:g1.id,code:'TEST-P032001-PIANO-G1',name:'TEST VIBE — Piano Grade 1'})
 for(const lane of ['SEP','AUG']){
  const start=lane==='SEP'?'2026-09-01':'2026-08-01';const end=lane==='SEP'?'2026-09-30':'2026-08-31'
  const klass=await ensure(db,'classes','class-'+lane,{branch_id:branches.A,course_id:id('course'),code:`TEST-P032001-${lane}`,name:`TEST VIBE — Minh An ${lane}`,status:'ACTIVE',start_date:start,end_date:end,accepted_from_level_id:g1.id,accepted_to_level_id:g1.id,notes:RUN})
  const room=await ensure(db,'rooms','room-'+lane,{branch_id:branches.A,code:`TEST-P032001-${lane}`,name:`TEST VIBE — Phòng ${lane}`,capacity:2,notes:RUN})
  await ensure(db,'class_teachers','teacher-'+lane,{class_id:klass,teacher_id:id('T1'),assigned_at:start,ended_at:end})
  for(const dow of [1,4])await ensure(db,'schedules',`schedule-${lane}-${dow}`,{class_id:klass,room_id:room,day_of_week:dow,start_time:'18:00',end_time:'19:00',effective_from:start,effective_to:end,timezone:'Asia/Ho_Chi_Minh'})
  const enrollment=await ensure(db,'enrollments','enrollment-'+lane,{student_id:id('S1'),class_id:klass,started_at:start,ended_at:end,status:lane==='AUG'?'COMPLETED':'ACTIVE',student_curriculum_enrollment_id:map.objects['S1-academic'].id,notes:RUN})
  const days=lane==='SEP'?[3,7,10,14,17,21,24,28]:[3,6,10,13,17,20,24,27]
  for(let i=0;i<days.length;i++){
   const day=`2026-${lane==='SEP'?'09':'08'}-${String(days[i]).padStart(2,'0')}`
   const dow=new Date(day+'T00:00:00Z').getUTCDay();const ref=`${lane}-${days[i]}`
   const session=await ensure(db,'session_occurrences',ref,{schedule_id:id(`schedule-${lane}-${dow}`),occurrence_date:day,starts_at:day+'T18:00:00+07:00',ends_at:day+'T19:00:00+07:00',status:'SCHEDULED'})
   const row=ok(await db.from('session_occurrences').select('status').eq('id',session).single(),'session status')
   if(i<6&&row.status==='SCHEDULED')ok(await db.rpc('set_session_teacher',{p_session_id:session,p_teacher_id:id(i===2?'T2':'T1'),p_type:i===2?'SUBSTITUTE':'PRIMARY',p_reason:RUN}), 'substitute')
   if(i<6){
    const teacher=c[i===2?'T2':'T1']
    const attendance=ok(await db.from('attendance_records').select('id').eq('session_occurrence_id',session).eq('enrollment_id',enrollment),'attendance')
    if(!attendance.length)ok(await teacher.rpc('teacher_session_write',{p_session:session,p_action:'attendance',p_enrollment:enrollment,p_payload:{status:i<4?'PRESENT':i===4?'LATE':'ABSENT'}}),'teacher attendance')
    if(row.status==='SCHEDULED')ok(await db.from('session_occurrences').update({status:'COMPLETED'}).eq('id',session),'complete test session')
    const journal=ok(await db.from('session_learning_journals').select('id,status').eq('session_occurrence_id',session).maybeSingle(),'journal')
    if(journal?.status!=='SUBMITTED'){
     ok(await teacher.rpc('save_session_learning_context',{p_session:session,p_content:'TEST VIBE — Luyện giữ nhịp và chuyển ngón',p_context:'TECHNIQUE'}),'journal context')
     const a=ok(await db.from('attendance_records').select('id').eq('session_occurrence_id',session).eq('enrollment_id',enrollment).single(),'attendance id')
     ok(await teacher.rpc('save_student_learning_entry',{p_attendance:a.id,p_observation:i===5?'NOT_RECORDED':'PRACTICING',p_progress_note:i===5?'':'Học sinh giữ nhịp ổn định hơn khi chơi chậm; phần chuyển ngón còn cần luyện riêng.',p_homework:'Ôn đoạn đang học với tốc độ chậm, chia thành từng nhóm ngắn.',p_homework_custom:true,p_next_focus:null,p_attention:false,p_attention_reason:null,p_attention_detail:'',p_family_note:'Chủ động đếm phách và sửa lỗi sau hướng dẫn.',p_codes:[]}), 'journal entry')
     ok(await teacher.rpc('submit_session_learning_journal',{p_session:session}),'submit journal')
    }
   }else if(i===6&&row.status!=='CANCELLED')ok(await db.from('session_occurrences').update({status:'CANCELLED'}).eq('id',session),'cancel test session')
  }
  if(lane==='AUG'){
   ok(await db.from('enrollments').update({status:'COMPLETED'}).eq('id',enrollment),'end fixture enrollment')
   for(const type of ['MONTHLY','END_OF_COURSE']){
    const report=ok(await db.rpc('generate_learning_report',{p_enrollment_id:enrollment,p_type:type,p_start:start,p_end:end}),'generate '+type)
    map.objects[type]={id:report,table:'learning_reports'}
   }
  }
 }
 const f=ok(await db.from('lesson_feedback').select('id').eq('student_id',id('S1')).eq('session_occurrence_id',id('SEP-17')),'feedback read')
 if(!f.length){const fid=ok(await c.P1.rpc('submit_lesson_feedback',{p_student_id:id('S1'),p_session_id:id('SEP-17'),p_respondent_type:'PARENT',p_overall:2,p_comment:'Phần bài tập về nhà chưa rõ; gia đình cần được hướng dẫn cụ thể hơn.',p_reasons:['CONTENT_UNCLEAR']}),'parent feedback');map.objects.feedback={id:fid,table:'lesson_feedback'}}else map.objects.feedback={id:f[0].id,table:'lesson_feedback'}
 persist();console.log(JSON.stringify({run_id:RUN,objects:Object.keys(map.objects).length,blockers:map.blockers.length,live_messages:0,mapping:mappingPath}))
}
if(require.main===module)main().catch(e=>{persist();console.error(e.message);process.exitCode=1})
module.exports={setup,id,RUN,dir,ok,sql,map,persist}
