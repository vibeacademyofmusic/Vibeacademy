const { PROJECT, IMPORT_BATCH, SOURCE_SHA, ORIGINAL_SHA, digest, same, literal, json } = require('./production-rollout.cjs')
const WRITABLE = ['fee_starts_on','source_effective_ends_on','date_state','term_state','curriculum_id','level_id','program_state','normalized_payload']

function assertPlan(plan) {
  const { plan_hash, ...content } = plan
  if (digest(content) !== plan_hash || plan.project_ref !== PROJECT || plan.source_sha256 !== SOURCE_SHA || plan.import_batch_id !== IMPORT_BATCH) throw Error('INVALID_PLAN')
  if (!plan.deployment_id || !/^[0-9a-f-]{36}$/.test(plan.branch_id)) throw Error('PLAN_TARGET_MISSING')
  if (new Set(plan.actions.map(a => a.target_id)).size !== plan.actions.length) throw Error('DUPLICATE_PLAN_TARGET')
  for (const a of plan.actions) {
    if (a.kind !== 'UPDATE_REFERENCE' || a.before.id !== a.target_id || a.after.id !== a.target_id ||
        a.before.import_batch_id !== IMPORT_BATCH || a.after.import_batch_id !== IMPORT_BATCH ||
        a.before.source_excel_row !== a.source_excel_row || a.after.source_excel_row !== a.source_excel_row ||
        a.before.disposition === 'EXCLUDED' || a.source_excel_row === 60 ||
        digest(a.before) !== a.before_hash || digest(a.after) !== a.after_hash) throw Error('INVALID_ACTION')
    for (const key of new Set([...Object.keys(a.before), ...Object.keys(a.after)])) {
      if (!same(a.before[key],a.after[key]) && !WRITABLE.includes(key)) throw Error(`FORBIDDEN_COLUMN:${key}`)
    }
    if (a.after.academic_started_on !== null || a.after.notifications_eligible !== false || a.after.final_amount !== null) throw Error('REFERENCE_ACTIVATION_FORBIDDEN')
  }
}

const countersSql = `jsonb_build_object(
  'academic', (select count(*) from public.student_curriculum_enrollments),
  'enrollments', (select count(*) from public.enrollments),
  'tuition', (select count(*) from public.enrollment_tuition),
  'sessions', (select count(*) from public.session_occurrences),
  'attendance', (select count(*) from public.attendance_records),
  'invoices', (select count(*) from public.invoices),
  'notification_jobs', (select count(*) from public.notification_jobs),
  'notification_events', (select count(*) from public.notification_events),
  'zalo_attempts', (select count(*) from public.zalo_notification_attempts))`

function applySql(plan, actions) {
  assertPlan(plan)
  if (!actions.length || actions.some(a => !plan.actions.some(expected => same(a,expected)))) throw Error('ACTION_NOT_IN_PLAN')
  const batch = literal(plan.batch_key)
  const statements = actions.map(a => {
    const assignments = WRITABLE.filter(k => !same(a.before[k],a.after[k]))
      .map(k => `${k} = ${k === 'normalized_payload' ? json(a.after[k]) : literal(a.after[k])}`).join(',\n')
    if (!assignments) throw Error('EMPTY_ACTION')
    return `do $action$
    declare current_row jsonb; recorded_row jsonb;
    begin
      select to_jsonb(r) into current_row from public.legacy_student_opening_rows r
      where r.id=${literal(a.target_id)}::uuid and r.import_batch_id=${literal(IMPORT_BATCH)}::uuid for update;
      if current_row is null then raise exception 'ROLLOUT_TARGET_MISSING'; end if;
      select postimage into recorded_row from maintenance_private.production_rollout_actions
      where batch_key=${batch} and action_key=${literal(a.key)};
      if found then
        if current_row is distinct from recorded_row then raise exception 'ROLLOUT_APPLIED_ROW_DRIFT'; end if;
      else
        if current_row is distinct from ${json(a.before)} then raise exception 'ROLLOUT_PREIMAGE_CHANGED'; end if;
        update public.legacy_student_opening_rows set ${assignments} where id=${literal(a.target_id)}::uuid;
        select to_jsonb(r) into current_row from public.legacy_student_opening_rows r where r.id=${literal(a.target_id)}::uuid;
        if current_row is distinct from ${json(a.after)} then raise exception 'ROLLOUT_POSTIMAGE_MISMATCH'; end if;
        insert into maintenance_private.production_rollout_actions(batch_key,action_key,target_table,target_id,source_excel_row,preimage,postimage,before_hash,after_hash)
        values(${batch},${literal(a.key)},'public.legacy_student_opening_rows',${literal(a.target_id)}::uuid,${a.source_excel_row},${json(a.before)},${json(a.after)},${literal(a.before_hash)},${literal(a.after_hash)});
      end if;
    end; $action$;`
  })
  return `begin;
set local role postgres;
set local lock_timeout='5s';
set local statement_timeout='90s';
do $guard$ begin
  if not pg_try_advisory_xact_lock(hashtextextended(${batch},0)) then raise exception 'ROLLOUT_BATCH_BUSY'; end if;
  if not exists(select 1 from public.legacy_student_opening_batches where import_batch_id=${literal(IMPORT_BATCH)}::uuid and source_sha256=${literal(ORIGINAL_SHA)} and branch_id=${literal(plan.branch_id)}::uuid) then raise exception 'ROLLOUT_IMPORT_BRANCH_MISMATCH'; end if;
  if not exists(select 1 from public.branches where id=${literal(plan.branch_id)}::uuid and code='CT01') then raise exception 'ROLLOUT_BRANCH_CHANGED'; end if;
end; $guard$;
create temporary table rollout_counts_before on commit drop as select ${countersSql} as counts;
insert into maintenance_private.production_rollout_batches(batch_key,source_sha256,plan_hash,project_ref,state)
values(${batch},${literal(SOURCE_SHA)},${literal(plan.plan_hash)},${literal(PROJECT)},'RUNNING') on conflict do nothing;
do $batch$ begin
  perform 1 from maintenance_private.production_rollout_batches where batch_key=${batch} and source_sha256=${literal(SOURCE_SHA)} and plan_hash=${literal(plan.plan_hash)} and project_ref=${literal(PROJECT)} for update;
  if not found then raise exception 'ROLLOUT_BATCH_VERSION_MISMATCH'; end if;
end; $batch$;
${statements.join('\n')}
do $effects$ begin
  if (select counts from rollout_counts_before) is distinct from ${countersSql} then raise exception 'ROLLOUT_UNEXPECTED_SIDE_EFFECT'; end if;
end; $effects$;
update maintenance_private.production_rollout_batches set state='PARTIAL_WITH_HOLDS',updated_at=now() where batch_key=${batch};
select jsonb_build_object('applied',count(*),'batch_key',${batch}) as result from maintenance_private.production_rollout_actions where batch_key=${batch};
commit;\n`
}

module.exports = { assertPlan, applySql, countersSql }
