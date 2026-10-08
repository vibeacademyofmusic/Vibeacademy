#!/usr/bin/env node
// LOCAL-only operational acceptance and cleanup proof. No credentials or row content printed.
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { IDS, psql } = require('./local-mixed-level-class-fixture.cjs')
const { createClient } = require('@supabase/supabase-js')
const { harness, renderToStaticMarkup } = require('../tests/helpers/finance-operations.cjs')
const React = require('react')

function json(sql) {
  const out = psql('\\pset format unaligned\n\\pset tuples_only on\n' + sql)
  return JSON.parse(out.split('\n').find(line => line.startsWith('{')))
}
function snapshot() {
  return json(`
create temp table fingerprints(name text, rows jsonb);
do $$ declare t record; rows jsonb; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('select coalesce(jsonb_object_agg(md5(to_jsonb(r)::text), n), ''{}''::jsonb) from (select t.*, count(*) over (partition by to_jsonb(t)) as n from public.%I t) r', t.tablename) into rows;
    insert into fingerprints values(t.tablename, rows);
  end loop;
end $$;
select jsonb_object_agg(name, rows) from fingerprints;`)
}
function owned() {
  const students = ['studentA','studentB','studentC','studentD'].map(k=>`'${IDS[k]}'`).join(',')
  const enrolls = ['enrollA','enrollB','enrollC','enrollD'].map(k=>`'${IDS[k]}'`).join(',')
  const sce = `select id from student_curriculum_enrollments where student_id in (${students}) and curriculum_id = '${IDS.curriculum}'`
  const lp = `select id from student_level_progress where enrollment_id in (${sce})`
  const sp = `select id from student_subject_progress where level_progress_id in (${lp})`
  const cp = `select id from student_component_progress where subject_progress_id in (${sp})`
  const conditions = {
    branches:`id='${IDS.branch}'`, curriculums:`id='${IDS.curriculum}'`, curriculum_levels:`curriculum_id='${IDS.curriculum}'`,
    curriculum_subjects:`level_id in (select id from curriculum_levels where curriculum_id='${IDS.curriculum}')`,
    courses:`id='${IDS.course}'`, rooms:`id='${IDS.room}'`, classes:`id='${IDS.class}'`, schedules:`id='${IDS.schedule}'`,
    session_occurrences:`schedule_id='${IDS.schedule}'`,
    session_occurrence_participants:`session_occurrence_id in (select id from session_occurrences where schedule_id='${IDS.schedule}')`,
    enrollments:`id in (${enrolls})`, attendance_records:`enrollment_id in (${enrolls})`, students:`id in (${students})`,
    student_curriculum_enrollments:`id in (${sce})`, student_level_progress:`id in (${lp})`, student_subject_progress:`id in (${sp})`,
    student_component_progress:`id in (${cp})`, student_component_item_progress:`component_progress_id in (${cp})`,
    enrollment_tuition:`id='${IDS.tuition}'`, tuition_plans:`id='${IDS.tuitionPlan}'`, tuition_plan_branch_prices:`tuition_plan_id='${IDS.tuitionPlan}' and branch_id='${IDS.branch}'`,
  }
  return json('select jsonb_build_object(' + Object.entries(conditions).map(([table,where]) =>
    `'${table}', (select coalesce(jsonb_object_agg(md5(to_jsonb(r)::text), n), '{}'::jsonb) from (select t.*, count(*) over (partition by to_jsonb(t)) as n from public.${table} t where ${where}) r)`
  ).join(',') + ');')
}
function excludeOwned(all, own) {
  return Object.fromEntries(Object.entries(all).map(([table,rows]) => [table, Object.fromEntries(Object.entries(rows).filter(([hash]) => !own[table]?.[hash]))]))
}
function run(mode) { execFileSync(process.execPath, ['scripts/local-mixed-level-class-fixture.cjs', mode], {stdio:'pipe'}) }
async function main() {
  const guard = () => json("select jsonb_build_object('enabled', tgenabled) from pg_trigger where tgname = 'trg_prevent_enrollment_tuition_delete';")
  assert.equal(guard().enabled, 'O')
  const baseline = excludeOwned(snapshot(), owned())
  run('--seed')
  assert.deepEqual(excludeOwned(snapshot(), owned()), baseline, 'seeding changed unrelated data')
  run('--acceptance')
  console.log('PASS authoritative level-up and full operational-table non-mutation assertions')
  const status = JSON.parse(execFileSync('npx',['--no-install','supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
  assert.ok(['127.0.0.1','localhost','::1'].includes(new URL(status.API_URL).hostname))
  // Exercise the RPCs with the same authenticated role as the app; service_role
  // deliberately has no EXECUTE grant on these invoker functions.
  const admin = json("select jsonb_build_object('id',id) from auth.users where email='admin@vibe.local';")
  assert.ok(admin.id, 'Local admin is required for authenticated acceptance')
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = encode({alg:'HS256',typ:'JWT'}) + '.' + encode({sub:admin.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+300})
  const token = unsigned + '.' + require('node:crypto').createHmac('sha256',status.JWT_SECRET).update(unsigned).digest('base64url')
  const db = createClient(status.API_URL,status.ANON_KEY,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}})
  const h = harness()
  const loader = h.load('../classes/_ops/data.ts')
  const data = await loader.loadClassOps(db,{branch:IDS.branch},'classes')
  assert.equal(data.classes.data[0].outOfScopeCount,1)
  assert.equal(data.overview.outOfScopeStudents,1)
  assert.equal(data.overview.outOfScopeClasses.length,1)
  const roster = await loader.loadClassRoster(db,IDS.class)
  assert.equal(roster.find(r=>r.studentId===IDS.studentD).currentLevel,'Grade 6')
  const Workspace = h.load('../classes/_ops/Workspace.tsx').default
  for (const view of ['classes','overview']) {
    const html = renderToStaticMarkup(React.createElement(Workspace,{data,params:{},view}))
    assert.match(html,/1 học viên ngoài phạm vi/)
    assert.ok(html.includes(`/admin/classes/${IDS.class}`))
  }
  console.log('PASS real local DB → roster Grade 6 → rendered class warning and overview 1 student / 1 class')
  const before = snapshot(), fixture = owned()
  const grade6 = await db.from('student_level_progress').select('id').eq('level_id',IDS.g6)
  assert.equal(grade6.data.length,1)
  console.log('Owned objects before cleanup:',JSON.stringify(Object.fromEntries(Object.entries(fixture).map(([k,v])=>[k,Object.keys(v).length]))))
  run('--cleanup')
  const first = snapshot()
  assert.deepEqual(first,excludeOwned(before,fixture),'cleanup changed unrelated rows or left fixture rows')
  assert.deepEqual(first,baseline,'unrelated data differs from before seeding')
  assert.ok(Object.values(owned()).every(v=>Object.keys(v).length===0))
  console.log('PASS cleanup: every owned object removed, including Grade 6 progress; all unrelated public data unchanged')
  run('--cleanup')
  assert.deepEqual(snapshot(),first)
  assert.equal(guard().enabled, 'O')
  console.log('PASS second cleanup idempotent; remaining fixture objects: 0')
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
