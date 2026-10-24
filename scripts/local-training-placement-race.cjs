/* Local-only integration test. Creates only TEST-TP fixtures, then removes them. */
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const testPrefix = 'b9000000-0000-4000-8000-'
const container = 'supabase_db_vibe-academy-system'
function sql(input) { return execFileSync('docker', ['exec','-i',container,'psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'], { input, encoding:'utf8' }).trim() }
function run(input) {
  const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'])
  let output=''; let readyResolve
  const ready=new Promise(resolve=>{readyResolve=resolve})
  child.stdout.on('data',data=>{output+=data; if(output.includes('seat_claimed')) readyResolve()})
  child.stderr.on('data',data=>{output+=data})
  const done=new Promise(resolve=>child.on('close',code=>{readyResolve();resolve({code,output})}))
  child.stdin.end(input)
  return {ready,done}
}
async function main() {
 for (const table of ['branches','curriculums','curriculum_levels','courses','rooms','teachers','classes','schedules','students','enrollments']) {
  assert.equal(sql(`select count(*) from ${table} where id::text like '${testPrefix}%'`),'0',`TEST IDs already exist in ${table}; refusing to alter them`)
 }
 const source=fs.readFileSync('supabase/tests/database/training_placement_integrity_test.sql','utf8')
 const fixture=source.slice(0,source.indexOf('select lives_ok')).replace('select no_plan();','')+'\ncommit;'
 sql(fixture)
 try {
  const insert=student=>`insert into enrollments(student_id,class_id,started_at) values ('b9000000-0000-4000-8000-${student}','b9000000-0000-4000-8000-000000000031',current_date+1);`
  const first=run('begin;'+insert('000000000051')+"select 'seat_claimed'; select pg_sleep(2); commit;")
  await first.ready
  const second=run('begin;'+insert('000000000052')+'commit;')
  const [a,b]=await Promise.all([first.done,second.done])
  assert.equal(a.code,0,a.output)
  assert.notEqual(b.code,0)
  assert.match(b.output,/PLACEMENT_CLASS_FULL/)
  assert.equal(sql("select count(*) from enrollments where class_id='b9000000-0000-4000-8000-000000000031'"),'1')
  console.log('PASS: two simultaneous connections, one committed enrollment, second rejected CLASS_FULL')
 } finally {
  sql(`begin;
    delete from enrollments where class_id in(select id from classes where id::text like 'b9000000-0000-4000-8000-%');
    delete from schedules where class_id in(select id from classes where id::text like 'b9000000-0000-4000-8000-%');
    delete from class_teachers where class_id in(select id from classes where id::text like 'b9000000-0000-4000-8000-%');
    delete from classes where id::text like 'b9000000-0000-4000-8000-%';
    delete from student_curriculum_enrollments where curriculum_id='b9000000-0000-4000-8000-000000000002';
    delete from students where id::text like 'b9000000-0000-4000-8000-%';
    delete from teachers where id::text like 'b9000000-0000-4000-8000-%';
    delete from rooms where id::text like 'b9000000-0000-4000-8000-%';
    delete from courses where code='TEST-TP';
    delete from curriculum_levels where curriculum_id='b9000000-0000-4000-8000-000000000002';
    delete from curriculums where code='TEST-TP';
    delete from branches where code='TEST-TP'; commit;`)
  console.log('TEST fixtures removed')
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
