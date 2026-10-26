const { buildPlan, SOURCE_SHA, ORIGINAL_SHA, IMPORT_BATCH } = require('../../scripts/lib/production-rollout.cjs')
const uuid = n => `f8800000-0000-4000-8000-${String(n).padStart(12,'0')}`
function fixture() {
  const branch=uuid(1),curriculum=uuid(2),level1=uuid(3),level2=uuid(4)
  const records=[], opening_rows=[]
  for(let number=6;number<=116;number++) {
    const original={full_name:`Synthetic ${number}`,date_of_birth:'2001-01-01',phone:'TEST',curriculum_code:'PIANO',legacy_reference:`REF-${number}`}
    records.push({source_excel_row:number,original_reference:original.legacy_reference,original_raw:original,matches_original_identity:true,
      raw:{...original,instrument_or_program:'PIANO',Column1:'GRADE 2',current_grade:'GRADE 4','start date':'2026-01-01','end date':'2027-01-01',tuition_status:''}})
    opening_rows.push({id:uuid(100+number),import_batch_id:IMPORT_BATCH,source_excel_row:number,source_reference:original.legacy_reference,
      raw_payload:original,normalized_payload:{original_grade:'1',level_code:'GRADE_1'},disposition:'IMPORT',target_student_id:uuid(300+number),
      curriculum_id:curriculum,level_id:level1,program_state:'MAPPED_AWAITING_ACADEMIC_START',fee_starts_on:'2026-01-01',source_effective_ends_on:'2027-01-01',
      date_state:'CONFLICT',term_state:'PENDING_REVIEW',academic_started_on:null,notifications_eligible:false,final_amount:null,is_unlimited:false})
  }
  return {source:{source_file:'/private/source.xlsx',original_file:'/private/original.xlsx',source_sha256:SOURCE_SHA,original_sha256:ORIGINAL_SHA,records},
    snapshot:{observed_at:'2026-10-26T00:00:00Z',branches:[{id:branch,code:'CT01'}],opening_batches:[{import_batch_id:IMPORT_BATCH,source_sha256:ORIGINAL_SHA,branch_id:branch}],opening_rows,
      curriculums:[{id:curriculum,code:'PIANO',status:'ACTIVE'}],levels:[{id:level1,curriculum_id:curriculum,code:'GRADE_1',status:'ACTIVE'},{id:level2,curriculum_id:curriculum,code:'GRADE_2',status:'ACTIVE'}],
      academic_enrollments:[],tuition:[],rooms:[],side_effect_counts:{}}}
}
const planOf = f => buildPlan(f.source,f.snapshot,'dpl_synthetic')

module.exports={fixture,planOf,uuid}
