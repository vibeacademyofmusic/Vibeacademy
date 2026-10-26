import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import fixtures from './helpers/production-rollout-fixture.cjs'
import builder from '../scripts/lib/production-rollout-sql.cjs'
const {fixture,planOf}=fixtures
const {applySql}=builder

async function database(f) {
  const db=new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.branches(id uuid primary key,code text);
    create table public.legacy_student_opening_batches(import_batch_id uuid primary key,source_sha256 text,branch_id uuid);
    create table public.legacy_student_opening_rows(
      id uuid primary key,import_batch_id uuid,source_excel_row integer,source_reference text,
      raw_payload jsonb,normalized_payload jsonb,disposition text,target_student_id uuid,
      curriculum_id uuid,level_id uuid,program_state text,fee_starts_on date,source_effective_ends_on date,
      date_state text,term_state text,academic_started_on date,notifications_eligible boolean,final_amount numeric,is_unlimited boolean);
    ${['student_curriculum_enrollments','enrollments','enrollment_tuition','session_occurrences','attendance_records','invoices','notification_jobs','notification_events','zalo_notification_attempts'].map(name=>`create table public.${name}(id serial primary key);`).join('\n')}
    ${fs.readFileSync(new URL('../supabase/migrations/20261026171740_production_rollout_journal.sql',import.meta.url),'utf8')}`)
  const b=f.snapshot.branches[0], batch=f.snapshot.opening_batches[0]
  await db.query('insert into public.branches values($1,$2)',[b.id,b.code])
  await db.query('insert into public.legacy_student_opening_batches values($1,$2,$3)',[batch.import_batch_id,batch.source_sha256,b.id])
  await db.query('insert into public.legacy_student_opening_rows select * from jsonb_populate_recordset(null::public.legacy_student_opening_rows,$1::jsonb)',[JSON.stringify(f.snapshot.opening_rows)])
  return db
}
const count = async(db,table)=>(await db.query(`select count(*)::integer n from ${table}`)).rows[0].n

test('SQL applies precisely the planned references and replay keeps one journal entry per target',async()=>{
  const f=fixture(),p=planOf(f),db=await database(f)
  try {
    const actions=p.actions.slice(0,3),sql=applySql(p,actions)
    await db.exec(sql);await db.exec(sql)
    assert.equal(await count(db,'maintenance_private.production_rollout_actions'),3)
    for(const a of actions)assert.deepEqual((await db.query('select to_jsonb(r) row from public.legacy_student_opening_rows r where id=$1',[a.target_id])).rows[0].row,a.after)
    assert.equal(await count(db,'public.notification_jobs'),0)
    assert.equal(await count(db,'public.student_curriculum_enrollments'),0)
    assert.equal((await db.query("select has_table_privilege('authenticated','maintenance_private.production_rollout_actions','select') allowed")).rows[0].allowed,false)
  }finally{await db.close()}
})

test('an externally edited row aborts the entire chunk without overwriting it or recording earlier actions',async()=>{
  const f=fixture(),p=planOf(f),db=await database(f)
  try {
    const actions=p.actions.slice(0,3)
    await db.query("update public.legacy_student_opening_rows set normalized_payload=normalized_payload||'{\"staff_note\":\"preserve\"}'::jsonb where id=$1",[actions[1].target_id])
    await assert.rejects(db.exec(applySql(p,actions)),/ROLLOUT_PREIMAGE_CHANGED/)
    await db.exec('rollback')
    assert.equal(await count(db,'maintenance_private.production_rollout_actions'),0)
    assert.deepEqual((await db.query('select to_jsonb(r) row from public.legacy_student_opening_rows r where id=$1',[actions[0].target_id])).rows[0].row,actions[0].before)
    assert.equal((await db.query('select normalized_payload from public.legacy_student_opening_rows where id=$1',[actions[1].target_id])).rows[0].normalized_payload.staff_note,'preserve')
  }finally{await db.close()}
})

test('unplanned notification side effects roll back the reference, audit and generated job together',async()=>{
  const f=fixture(),p=planOf(f),db=await database(f)
  try {
    await db.exec(`create function public.synthetic_side_effect() returns trigger language plpgsql as $$begin insert into public.notification_jobs default values;return new;end$$;
      create trigger synthetic_side_effect after update on public.legacy_student_opening_rows for each row execute function public.synthetic_side_effect();`)
    await assert.rejects(db.exec(applySql(p,p.actions.slice(0,1))),/ROLLOUT_UNEXPECTED_SIDE_EFFECT/)
    await db.exec('rollback')
    assert.equal(await count(db,'public.notification_jobs'),0)
    assert.equal(await count(db,'maintenance_private.production_rollout_actions'),0)
    assert.deepEqual((await db.query('select to_jsonb(r) row from public.legacy_student_opening_rows r where id=$1',[p.actions[0].target_id])).rows[0].row,p.actions[0].before)
  }finally{await db.close()}
})

test('resume refuses a previously applied reference that staff subsequently changed',async()=>{
  const f=fixture(),p=planOf(f),db=await database(f)
  try {
    const a=p.actions[0],sql=applySql(p,[a]);await db.exec(sql)
    await db.query("update public.legacy_student_opening_rows set normalized_payload=normalized_payload||'{\"later_edit\":true}'::jsonb where id=$1",[a.target_id])
    await assert.rejects(db.exec(sql),/ROLLOUT_APPLIED_ROW_DRIFT/);await db.exec('rollback')
    assert.equal(await count(db,'maintenance_private.production_rollout_actions'),1)
    assert.equal((await db.query('select normalized_payload from public.legacy_student_opening_rows where id=$1',[a.target_id])).rows[0].normalized_payload.later_edit,true)
  }finally{await db.close()}
})
