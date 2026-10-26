const test = require('node:test')
const assert = require('node:assert/strict')
const { mappedLevel, validDate, digest } = require('../scripts/lib/production-rollout.cjs')
const { assertPlan, applySql } = require('../scripts/lib/production-rollout-sql.cjs')
const { parse } = require('../scripts/production-rollout.cjs')

const {fixture,planOf,uuid} = require('./helpers/production-rollout-fixture.cjs')

test('no command is help; unknown commands and write-like flags are refused',()=>{
  assert.equal(parse([]).command,'help');assert.throws(()=>parse(['delete']),/UNKNOWN/)
  assert.throws(()=>parse(['run','--force','yes']),/INVALID_ARGUMENT/)
})
test('dates preserve calendar values and reject equal/reversed/invalid source periods independently',()=>{
  assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('13/1/22027'),false)
  const f=fixture();f.source.records[0].raw['end date']='2026-01-01'
  const p=planOf(f),r=p.rows[0]
  assert.equal(r.tuition_date_action.reason,'FEE_DATE_PAIR_INVALID')
  assert.equal(r.reference_action.state,'READY');assert(!p.actions[0].changes.includes('reference_fee_dates'))
})
test('F is authoritative; blank F does not fall back to N and leaves the reference level intact',()=>{
  const f=fixture();f.source.records[0].raw.Column1=''
  const p=planOf(f);assert.equal(p.rows[0].academic_action.reason,'LEVEL_F_MISSING')
  assert(!p.actions.some(a=>a.source_excel_row===6))
})
test('PRE suffixes require an explicit approved segment mapping; bare grade typo is normalized with provenance',()=>{
  const f=fixture()
  for(const label of ['PRE GRADE 1A','PRE GRADE 1D','PRE STEP 1C']) assert.equal(mappedLevel(label,'PIANO',f.snapshot).reason,'PRE_SEGMENT_MAPPING_REQUIRED')
  f.source.records[0].raw.Column1='GARDE 1'
  const p=planOf(f),a=p.actions.find(a=>a.source_excel_row===6)
  assert.equal(a.after.normalized_payload.original_grade,'GRADE 1')
  assert.equal(a.after.normalized_payload.owner_update_source.original_level_f,'GARDE 1')
})
test('reference corrections never manufacture academic or tuition start dates or enrollments',()=>{
  const f=fixture(),p=planOf(f)
  assert(p.actions.length>0)
  for(const r of p.rows.filter(r=>r.source_excel_row!==60)) {
    assert.equal(r.tuition_date_action.state,'HOLD');assert.equal(r.academic_action.reason,'ACADEMIC_START_NOT_PROVIDED');assert.equal(r.schedule_action.state,'HOLD')
  }
  assert(p.actions.every(a=>a.after.academic_started_on===null&&a.after.notifications_eligible===false&&a.after.final_amount===null))
})
test('verified existing academic program is reused and never reset',()=>{
  const f=fixture(),row=f.snapshot.opening_rows[0]
  f.snapshot.academic_enrollments.push({id:uuid(900),student_id:row.target_student_id,curriculum_id:row.curriculum_id,current_level_id:f.snapshot.levels[1].id,status:'ACTIVE',started_at:'2025-12-01'})
  const p=planOf(f);assert.equal(p.rows[0].academic_action.state,'ALREADY_APPLIED');assert.equal(p.rows[0].academic_start,'2025-12-01')
})
test('identity drift and new rows hold independently; excluded row 60 never enters a write',()=>{
  const f=fixture();f.source.records[0].matches_original_identity=false;f.source.records.at(-1).original_reference=null
  const p=planOf(f)
  assert.equal(p.rows[0].reference_action.state,'HOLD');assert.equal(p.rows.at(-1).reference_action.reason,'NO_VERIFIED_IMPORT_REFERENCE')
  assert(!p.actions.some(a=>[6,60,116].includes(a.source_excel_row)))
})
test('source/branch mismatch, duplicate rows and a modified plan fail closed',()=>{
  const f=fixture();f.source.source_sha256='0'.repeat(64);assert.throws(()=>planOf(f),/SOURCE_VERSION/)
  const p=planOf(fixture());p.actions[0].after.level_id=uuid(999);assert.throws(()=>assertPlan(p),/INVALID_PLAN/)
  const b=fixture();b.snapshot.branches=[];assert.throws(()=>planOf(b),/TARGET_BRANCH/)
})
test('even a rehashed manifest cannot write profile, money, disposition or raw source fields',()=>{
  for(const key of ['target_student_id','raw_payload','disposition','final_amount']) {
    const p=planOf(fixture());p.actions[0].after[key]=key==='final_amount'?100:'unauthorized'
    p.actions[0].after_hash=digest(p.actions[0].after);const content={...p};delete content.plan_hash;p.plan_hash=digest(content)
    assert.throws(()=>assertPlan(p),/FORBIDDEN_COLUMN/)
  }
})
test('SQL binds literals, preimages, transaction locks, ledger and side-effect guard',()=>{
  const f=fixture();f.source.records[0].original_raw.full_name="Synthetic O'Brien";f.snapshot.opening_rows[0].raw_payload.full_name="Synthetic O'Brien"
  const p=planOf(f),sql=applySql(p,p.actions.slice(0,1))
  assert.match(sql,/O''Brien/);assert.match(sql,/pg_try_advisory_xact_lock/);assert.match(sql,/ROLLOUT_PREIMAGE_CHANGED/);assert.match(sql,/ROLLOUT_UNEXPECTED_SIDE_EFFECT/)
  assert.match(sql,/^begin;/);assert.match(sql,/commit;\s*$/)
})
