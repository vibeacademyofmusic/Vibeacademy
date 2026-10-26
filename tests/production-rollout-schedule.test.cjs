const test=require('node:test')
const assert=require('node:assert/strict')
const {fixture,uuid}=require('./helpers/production-rollout-fixture.cjs')
const {buildPlan,ORIGINAL_SHA,IMPORT_BATCH}=require('../scripts/lib/production-rollout.cjs')
const {scheduleSql}=require('../scripts/lib/production-rollout-schedule.cjs')

function prepared() {
  const f=fixture(),r=f.snapshot.opening_rows.find(r=>r.source_excel_row===7),c={id:uuid(700),branch_id:f.snapshot.branches[0].id,curriculum_id:r.curriculum_id,status:'ACTIVE',code:'PIANO-T4-1800',capacity:6}
  f.snapshot.classes=[c]
  f.snapshot.schedules=[{id:uuid(701),class_id:c.id,status:'ACTIVE',day_of_week:3,start_time:'18:00:00',end_time:'19:30:00',effective_from:'2026-10-26',effective_to:null,room_id:uuid(702)}]
  f.snapshot.rooms=[{id:uuid(702),branch_id:c.branch_id,name:'Piano 1',code:'PIANO1',status:'ACTIVE',capacity:6}]
  f.snapshot.students=[{id:r.target_student_id,full_name:r.raw_payload.full_name,default_branch_id:c.branch_id,status:'ACTIVE'}]
  f.source.records.find(r=>r.source_excel_row===7).raw.student_status='ACTIVE'
  f.snapshot.class_teachers=[{id:uuid(703),class_id:c.id,teacher_id:uuid(704),teacher_role:'PRIMARY',is_active:true,assigned_at:'2026-01-01',ended_at:null}]
  f.snapshot.academic_enrollments=[{id:uuid(705),student_id:r.target_student_id,curriculum_id:r.curriculum_id,current_level_id:f.snapshot.levels[1].id,status:'ACTIVE',started_at:'2025-01-12'}]
  f.snapshot.enrollments=[]
  const context={approval:{effective_date:'2026-10-27',scope:'CT01_VERIFIED_ACTIVE_WITH_CONFIRMED_CLASS',academic_assignment:true,schedule_start:true,preserve_history:true,preserve_fee_dates_and_payments:true,no_backfill:true},
    schedule_evidence:{pdf_file:'/private/source.pdf',pdf_sha256:'1'.repeat(64),original_source_sha256:ORIGINAL_SHA,import_batch_id:IMPORT_BATCH,rows:[{pdf_row:136,student_id:r.target_student_id,source_excel_rows:[7],identity_confidence:'CONFIRMED_PRODUCTION_ID_AND_SOURCE_PROGRAM',program:'PIANO',target_class_ids:[c.id],source_unflagged_slot_count:5,day_of_week:3,start_time:'18:00:00',end_time:'19:30:00'}]}}
  return {...f,context}
}
test('explicit date plus exact identity/program/slot and a fitting existing room produce one membership, preserving academic history',()=>{
  const f=prepared(),p=buildPlan(f.source,f.snapshot,'dpl_synthetic',f.context)
  assert.equal(p.schedule_actions.length,1)
  assert.equal(p.schedule_actions[0].start_on,'2026-10-27')
  assert.equal(p.schedule_actions[0].academic_before.started_at,'2025-01-12')
  assert.equal(p.rows.find(r=>r.source_excel_row===7).academic_action.state,'ALREADY_APPLIED')
  assert.match(scheduleSql(p),/ROLLOUT_OPERATIONAL_DATE_PASSED_REAPPROVAL_REQUIRED/)
  assert.match(scheduleSql(p),/ROLLOUT_MEMBERSHIP_SIDE_EFFECT/)
})
test('approval cannot choose members for a source slot that still needs two rooms',()=>{
  const f=prepared();f.context.schedule_evidence.rows[0].source_unflagged_slot_count=9
  const p=buildPlan(f.source,f.snapshot,'dpl_synthetic',f.context)
  assert.equal(p.schedule_actions.length,0)
  assert.equal(p.rows.find(r=>r.source_excel_row===7).schedule_action.reason,'CONFIRMED_MEMBER_SPLIT_REQUIRED')
})
test('paused/cancelled students, a different time, missing teacher or unknown physical room never get activated',()=>{
  for(const change of [f=>{f.snapshot.students[0].status='PAUSED'},f=>{f.snapshot.schedules[0].start_time='19:00:00'},f=>{f.snapshot.class_teachers=[]},f=>{f.snapshot.rooms[0].capacity=null},f=>{f.source.records.find(r=>r.source_excel_row===7).raw.tuition_status='PAUSED'}]) {
    const f=prepared();change(f);assert.equal(buildPlan(f.source,f.snapshot,'dpl_synthetic',f.context).schedule_actions.length,0)
  }
})
test('a blank F or missing academic baseline remains on hold despite a date approval',()=>{
  for(const change of [f=>{f.source.records.find(r=>r.source_excel_row===7).raw.Column1=''},f=>{f.snapshot.academic_enrollments=[]}]) {
    const f=prepared();change(f);assert.equal(buildPlan(f.source,f.snapshot,'dpl_synthetic',f.context).schedule_actions.length,0)
  }
})
test('already placed students are reused rather than given a duplicate membership',()=>{
  const f=prepared();f.snapshot.enrollments=[{id:uuid(800),student_id:f.snapshot.students[0].id,class_id:f.snapshot.classes[0].id,status:'ACTIVE',started_at:'2026-10-27'}]
  const p=buildPlan(f.source,f.snapshot,'dpl_synthetic',f.context)
  assert.equal(p.schedule_actions.length,0);assert.equal(p.rows.find(r=>r.source_excel_row===7).schedule_action.state,'ALREADY_APPLIED')
})
