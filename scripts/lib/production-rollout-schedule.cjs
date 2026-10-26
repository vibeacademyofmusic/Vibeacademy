const { IMPORT_BATCH, ORIGINAL_SHA, digest, text, literal, json, validDate } = require('./production-rollout.cjs')
const { countersSql } = require('./production-rollout-sql.cjs')
const uuid = value => {
  const h=digest(value)
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`
}

function enrichPlan(plan,source,snapshot,context) {
  const a=context.approval,e=context.schedule_evidence
  if (!validDate(a.effective_date)||a.scope!=='CT01_VERIFIED_ACTIVE_WITH_CONFIRMED_CLASS'||!a.academic_assignment||!a.schedule_start||!a.preserve_history||!a.preserve_fee_dates_and_payments||!a.no_backfill) throw Error('OPERATIONAL_APPROVAL_INVALID')
  if (!e||e.original_source_sha256!==ORIGINAL_SHA||e.import_batch_id!==IMPORT_BATCH||!/^[0-9a-f]{64}$/.test(e.pdf_sha256)) throw Error('SCHEDULE_SOURCE_EVIDENCE_INVALID')
  plan.operational_approval=a
  plan.schedule_evidence={pdf_file:e.pdf_file,pdf_sha256:e.pdf_sha256,evidence_hash:digest(e)}
  const actions=[]
  for(const row of plan.rows) {
    if(row.schedule_action.state==='EXCLUDED')continue
    row.assignment_effective_date=a.effective_date
    if(row.academic_action.reason==='ACADEMIC_START_NOT_PROVIDED')row.academic_action={state:'HOLD',reason:'CONFIRMED_TARGET_CLASS_REQUIRED',effective_date:a.effective_date}
    if(['OPERATING_STATUS_REQUIRES_REVIEW','SOURCE_IDENTITY_CHANGED','NO_VERIFIED_IMPORT_REFERENCE'].includes(row.schedule_action.reason))continue
    const raw=source.records.find(r=>r.source_excel_row===row.source_excel_row).raw
    const candidates=e.rows.filter(r=>r.student_id===row.student_id&&r.source_excel_rows.includes(row.source_excel_row)&&r.identity_confidence==='CONFIRMED_PRODUCTION_ID_AND_SOURCE_PROGRAM')
    row.schedule_action={state:'HOLD',reason:'CONFIRMED_TARGET_CLASS_REQUIRED',approved_start:a.effective_date}
    for(const evidence of candidates) {
      if(evidence.target_class_ids.length!==1)continue
      const c=snapshot.classes.find(c=>c.id===evidence.target_class_ids[0]&&c.status==='ACTIVE'&&c.branch_id===plan.branch_id)
      const schedules=snapshot.schedules.filter(s=>s.class_id===c?.id&&s.status==='ACTIVE')
      const s=schedules.length===1?schedules[0]:null
      const room=snapshot.rooms.find(r=>r.id===s?.room_id&&r.status==='ACTIVE'&&r.branch_id===plan.branch_id)
      const grade=row.level_mapping
      if(!c||!s||!room||c.curriculum_id!==grade?.curriculum_id||evidence.program!==text(raw.curriculum_code).toUpperCase())continue
      if(s.day_of_week!==evidence.day_of_week||s.start_time!==evidence.start_time||s.end_time!==evidence.end_time||s.effective_from>a.effective_date||(s.effective_to&&s.effective_to<a.effective_date))continue
      const realName={PIANO:'Piano',VIOLIN:'Violin',GUITAR:'Guitar'}[evidence.program]
      if(!realName||![`${realName} 1`,`${realName} 2`].includes(room.name)||room.capacity!==6)continue
      if(!Number.isInteger(evidence.source_unflagged_slot_count)||evidence.source_unflagged_slot_count>Math.min(c.capacity,room.capacity)) {
        row.schedule_action={state:'HOLD',reason:'CONFIRMED_MEMBER_SPLIT_REQUIRED',approved_start:a.effective_date};continue
      }
      const student=snapshot.students.find(s=>s.id===row.student_id&&s.default_branch_id===plan.branch_id&&s.status==='ACTIVE')
      const teachers=(snapshot.class_teachers||[]).filter(t=>t.class_id===c.id&&t.is_active&&t.assigned_at<=a.effective_date&&(!t.ended_at||t.ended_at>=a.effective_date)).sort((x,y)=>x.id.localeCompare(y.id))
      if(!student||text(student.full_name)!==text(raw.full_name)||raw.student_status!=='ACTIVE'||!teachers.some(t=>t.teacher_role==='PRIMARY'))continue
      if(row.academic_action.state!=='ALREADY_APPLIED') {
        row.academic_action={state:'HOLD',reason:'ACADEMIC_BASELINE_REQUIRES_VERIFIED_ACTION',effective_date:a.effective_date};continue
      }
      const academic=snapshot.academic_enrollments.find(x=>x.id===row.academic_action.enrollment_id&&x.status==='ACTIVE'&&x.current_level_id===grade.level_id)
      if(!academic)continue
      const existing=(snapshot.enrollments||[]).filter(x=>x.student_id===student.id&&x.class_id===c.id&&['ACTIVE','PAUSED'].includes(x.status))
      if(existing.length) {
        row.schedule_action={state:existing.length===1&&existing[0].started_at===a.effective_date?'ALREADY_APPLIED':'HOLD',reason:'EXISTING_MEMBERSHIP_PRESERVED',enrollment_id:existing.length===1?existing[0].id:null};continue
      }
      const key=`pdf:${evidence.pdf_row}:student:${student.id}:class:${c.id}`
      const action={kind:'CREATE_SCHEDULE_MEMBERSHIP',key,source_excel_row:row.source_excel_row,pdf_row:evidence.pdf_row,student_id:student.id,class_id:c.id,
        enrollment_id:uuid([plan.source_sha256,e.pdf_sha256,key,a.effective_date]),start_on:a.effective_date,
        class_before:c,schedule_before:s,room_before:room,student_before:student,academic_before:academic,teachers_before:teachers,
        group_size:evidence.source_unflagged_slot_count,level_id:grade.level_id}
      actions.push(action)
      row.schedule_start=a.effective_date
      row.schedule_action={state:'READY',reason:'EXACT_SOURCE_SLOT_FITS_EXISTING_SINGLE_ROOM',class_id:c.id,class_code:c.code,action_key:key,approved_start:a.effective_date}
    }
  }
  plan.schedule_actions=actions
  plan.schedule_plan_hash=digest(actions)
  plan.schedule_import_batch_id=uuid([plan.source_sha256,e.pdf_sha256,plan.branch_id,a.effective_date,plan.schedule_plan_hash])
  for(const part of ['academic_action','schedule_action'])plan.summary[part]=plan.rows.reduce((out,r)=>{out[r[part].state]=(out[r[part].state]||0)+1;return out},{})
}

function scheduleSql(plan) {
  const actions=plan.schedule_actions||[]
  if(!actions.length)throw Error('NO_SCHEDULE_ACTIONS')
  if(digest(actions)!==plan.schedule_plan_hash||actions.some(a=>a.kind!=='CREATE_SCHEDULE_MEMBERSHIP'||a.start_on!==plan.operational_approval.effective_date||a.group_size>Math.min(a.class_before.capacity,a.room_before.capacity)))throw Error('SCHEDULE_ACTION_INVALID')
  const batch=literal(plan.schedule_import_batch_id),day=literal(plan.operational_approval.effective_date)
  return `begin;
set local role postgres;
set local lock_timeout='5s';set local statement_timeout='90s';
do $lock$ begin
 if not pg_try_advisory_xact_lock(hashtextextended(${literal(plan.batch_key)},0)) then raise exception 'ROLLOUT_BATCH_BUSY'; end if;
 if public.registration_vietnam_today()>${day}::date then raise exception 'ROLLOUT_OPERATIONAL_DATE_PASSED_REAPPROVAL_REQUIRED'; end if;
end; $lock$;
create temporary table schedule_counts_before on commit drop as select ${countersSql} as counts,
 (select count(*) from maintenance_private.ct_schedule_import_rows where import_batch_id=${batch}::uuid and action='CREATED') as journal_before;
insert into maintenance_private.ct_schedule_import_batches(import_batch_id,source_sha256,plan_sha256,branch_id,approved_enrollment_start_on,status)
values(${batch}::uuid,${literal(plan.schedule_evidence.pdf_sha256)},${literal(plan.schedule_plan_hash)},${literal(plan.branch_id)}::uuid,${day}::date,'IMPORTED') on conflict do nothing;
do $batch$ begin
 perform 1 from maintenance_private.ct_schedule_import_batches where import_batch_id=${batch}::uuid and source_sha256=${literal(plan.schedule_evidence.pdf_sha256)} and plan_sha256=${literal(plan.schedule_plan_hash)} and branch_id=${literal(plan.branch_id)}::uuid and approved_enrollment_start_on=${day}::date and status='IMPORTED' for update;
 if not found then raise exception 'ROLLOUT_SCHEDULE_BATCH_MISMATCH'; end if;
end;$batch$;
${actions.map(a=>`do $membership$
declare v_current jsonb;v_recorded jsonb;v_id uuid;
begin
 select enrollment_after into v_recorded from maintenance_private.ct_schedule_import_rows where import_batch_id=${batch}::uuid and source_reference=${literal(a.key)};
 if found then
  select to_jsonb(e) into v_current from public.enrollments e where id=${literal(a.enrollment_id)}::uuid for update;
  if v_current is distinct from v_recorded then raise exception 'ROLLOUT_APPLIED_MEMBERSHIP_DRIFT'; end if;
 else
  select to_jsonb(c) into v_current from public.classes c where id=${literal(a.class_id)}::uuid for update;
  if v_current is distinct from ${json(a.class_before)} then raise exception 'ROLLOUT_CLASS_CHANGED'; end if;
  select to_jsonb(s) into v_current from public.schedules s where id=${literal(a.schedule_before.id)}::uuid for update;
  if v_current is distinct from ${json(a.schedule_before)} then raise exception 'ROLLOUT_SCHEDULE_CHANGED'; end if;
  select to_jsonb(r) into v_current from public.rooms r where id=${literal(a.room_before.id)}::uuid for update;
  if v_current is distinct from ${json(a.room_before)} then raise exception 'ROLLOUT_ROOM_CHANGED'; end if;
  select to_jsonb(s) into v_current from public.students s where id=${literal(a.student_id)}::uuid for update;
  if v_current is distinct from ${json(a.student_before)} then raise exception 'ROLLOUT_STUDENT_CHANGED'; end if;
  select to_jsonb(e) into v_current from public.student_curriculum_enrollments e where id=${literal(a.academic_before.id)}::uuid for share;
  if v_current is distinct from ${json(a.academic_before)} then raise exception 'ROLLOUT_ACADEMIC_CHANGED'; end if;
  if (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.class_teachers t where t.class_id=${literal(a.class_id)}::uuid and t.is_active and t.assigned_at<=${day}::date and (t.ended_at is null or t.ended_at>=${day}::date)) is distinct from ${json(a.teachers_before)} then raise exception 'ROLLOUT_TEACHER_ASSIGNMENT_CHANGED'; end if;
  if not exists(select 1 from public.legacy_student_opening_rows r where r.import_batch_id=${literal(IMPORT_BATCH)}::uuid and r.source_excel_row=${a.source_excel_row} and r.target_student_id=${literal(a.student_id)}::uuid and r.disposition='IMPORT' and r.curriculum_id=${literal(a.class_before.curriculum_id)}::uuid and r.level_id=${literal(a.level_id)}::uuid) then raise exception 'ROLLOUT_SOURCE_MEMBERSHIP_EVIDENCE_CHANGED'; end if;
  perform set_config('registration.write','on',true);
  insert into public.enrollments(id,student_id,class_id,student_curriculum_enrollment_id,enrolled_at,started_at,status,notes)
  values(${literal(a.enrollment_id)}::uuid,${literal(a.student_id)}::uuid,${literal(a.class_id)}::uuid,${literal(a.academic_before.id)}::uuid,${day}::date,${day}::date,'ACTIVE',${literal('Owner-approved operational start; audited source '+a.key)});
  perform set_config('registration.write','off',true);
  select to_jsonb(e) into v_current from public.enrollments e where id=${literal(a.enrollment_id)}::uuid;
  insert into maintenance_private.ct_schedule_import_rows(import_batch_id,source_reference,student_id,class_id,enrollment_id,enrollment_id_snapshot,action,enrollment_before,enrollment_after)
  values(${batch}::uuid,${literal(a.key)},${literal(a.student_id)}::uuid,${literal(a.class_id)}::uuid,${literal(a.enrollment_id)}::uuid,${literal(a.enrollment_id)}::uuid,'CREATED',null,v_current);
 end if;
end;$membership$;`).join('\n')}
do $counts$ declare expected integer;begin
 select count(*) into expected from maintenance_private.ct_schedule_import_rows where import_batch_id=${batch}::uuid and action='CREATED';
 if (${countersSql}-'enrollments') is distinct from (select counts-'enrollments' from schedule_counts_before) then raise exception 'ROLLOUT_MEMBERSHIP_SIDE_EFFECT'; end if;
 if (select count(*) from public.enrollments)<>(select (counts->>'enrollments')::integer+expected-journal_before from schedule_counts_before) then raise exception 'ROLLOUT_MEMBERSHIP_COUNT_UNEXPECTED'; end if;
end;$counts$;
select jsonb_build_object('schedule_memberships',count(*)) as result from maintenance_private.ct_schedule_import_rows where import_batch_id=${batch}::uuid;
commit;\n`
}

module.exports={enrichPlan,scheduleSql}
