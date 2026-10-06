#!/usr/bin/env node
/**
 * LOCAL ONLY — TEST Mixed Guitar class fixture for attendance E2E.
 * Usage:
 *   node scripts/local-mixed-level-class-fixture.cjs
 *   node scripts/local-mixed-level-class-fixture.cjs --acceptance
 *   node scripts/local-mixed-level-class-fixture.cjs --cleanup
 */
const { execFileSync } = require('node:child_process')

const REFUSED = 'REFUSED: mixed-level fixture can only run against local Supabase.'

const IDS = {
  tuitionPlan: 'b1000000-0000-4000-8000-000000000070',
  tuition: 'b1000000-0000-4000-8000-000000000071',
  branch: 'b1000000-0000-4000-8000-0000000000b0',
  curriculum: 'b1000000-0000-4000-8000-0000000000c1',
  pre: 'b1000000-0000-4000-8000-000000000010',
  g1: 'b1000000-0000-4000-8000-000000000011',
  g3: 'b1000000-0000-4000-8000-000000000013',
  g5: 'b1000000-0000-4000-8000-000000000015',
  g6: 'b1000000-0000-4000-8000-000000000016',
  course: 'b1000000-0000-4000-8000-0000000000c0',
  room: 'b1000000-0000-4000-8000-0000000000d0',
  class: 'b1000000-0000-4000-8000-0000000000a0',
  schedule: 'b1000000-0000-4000-8000-0000000000e0',
  studentA: 'b1000000-0000-4000-8000-0000000000a1',
  studentB: 'b1000000-0000-4000-8000-0000000000a2',
  studentC: 'b1000000-0000-4000-8000-0000000000a3',
  studentD: 'b1000000-0000-4000-8000-0000000000a4',
  sceA: 'b1000000-0000-4000-8000-0000000000e1',
  sceB: 'b1000000-0000-4000-8000-0000000000e2',
  sceC: 'b1000000-0000-4000-8000-0000000000e3',
  sceD: 'b1000000-0000-4000-8000-0000000000e4',
  enrollA: 'b1000000-0000-4000-8000-0000000000f1',
  enrollB: 'b1000000-0000-4000-8000-0000000000f2',
  enrollC: 'b1000000-0000-4000-8000-0000000000f3',
  enrollD: 'b1000000-0000-4000-8000-0000000000f4',
}

function databaseContainer() {
  const names = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(name => name.startsWith('supabase_db_'))
  if (names.length !== 1 || !names[0].includes('vibe-academy-system')) {
    throw new Error(REFUSED)
  }
  return names[0]
}

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', databaseContainer(), 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8' },
  )
}

function cleanupSql() {
  return `
-- All callers wrap this in a transaction. Never select fixtures by a broad TEST prefix.
-- Local TEST financial fixture only: hold an exclusive lock until commit so no other
-- writer can observe the deletion guard disabled. All other constraints stay enabled.
lock table public.enrollment_tuition in access exclusive mode;
alter table public.enrollment_tuition disable trigger trg_prevent_enrollment_tuition_delete;
delete from public.enrollment_tuition where id = '${IDS.tuition}' and enrollment_id = '${IDS.enrollD}';
alter table public.enrollment_tuition enable trigger trg_prevent_enrollment_tuition_delete;
delete from public.tuition_plan_branch_prices where tuition_plan_id = '${IDS.tuitionPlan}' and branch_id = '${IDS.branch}';
delete from public.tuition_plans where id = '${IDS.tuitionPlan}' and code = 'TEST_ML_TUITION';
delete from public.attendance_records where enrollment_id in (
  '${IDS.enrollA}','${IDS.enrollB}','${IDS.enrollC}','${IDS.enrollD}'
);
delete from public.session_occurrence_participants where session_occurrence_id in (
  select id from public.session_occurrences where schedule_id = '${IDS.schedule}'
);
delete from public.session_occurrences where schedule_id = '${IDS.schedule}';
delete from public.schedules where id = '${IDS.schedule}';
delete from public.enrollments where id in (
  '${IDS.enrollA}','${IDS.enrollB}','${IDS.enrollC}','${IDS.enrollD}'
);
delete from public.student_curriculum_enrollments where id in (
  '${IDS.sceA}','${IDS.sceB}','${IDS.sceC}','${IDS.sceD}'
) or (curriculum_id = '${IDS.curriculum}' and student_id in (
  '${IDS.studentA}','${IDS.studentB}','${IDS.studentC}','${IDS.studentD}'
));
delete from public.students where id in (
  '${IDS.studentA}','${IDS.studentB}','${IDS.studentC}','${IDS.studentD}'
);
delete from public.classes where id = '${IDS.class}';
delete from public.rooms where id = '${IDS.room}';
delete from public.courses where id = '${IDS.course}';
-- Enrollment deletion cascades level, subject, component and item progress, including Grade 6.
delete from public.curriculum_subjects where level_id in (select id from public.curriculum_levels where curriculum_id = '${IDS.curriculum}');
delete from public.curriculum_levels where curriculum_id = '${IDS.curriculum}';
delete from public.curriculums where id = '${IDS.curriculum}';
delete from public.branches where id = '${IDS.branch}';
`
}

function seedSql() {
  return `
${cleanupSql()}

insert into public.branches(id, code, name, status)
values ('${IDS.branch}', 'TEST_OPS_BR', 'TEST ML Branch', 'ACTIVE');

insert into public.curriculums(id, code, name, status)
values ('${IDS.curriculum}', 'TEST_OPS_GUITAR', 'TEST Mixed Guitar Program', 'ACTIVE');

insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no, status)
values
  ('${IDS.pre}', '${IDS.curriculum}', 'PRE', 'Pre', 0, 'ACTIVE'),
  ('${IDS.g1}', '${IDS.curriculum}', 'G1', 'Grade 1', 1, 'ACTIVE'),
  ('${IDS.g3}', '${IDS.curriculum}', 'G3', 'Grade 3', 3, 'ACTIVE'),
  ('${IDS.g5}', '${IDS.curriculum}', 'G5', 'Grade 5', 5, 'ACTIVE'),
  ('${IDS.g6}', '${IDS.curriculum}', 'G6', 'Grade 6', 6, 'ACTIVE');

insert into public.courses(id, curriculum_id, level_id, code, name, status)
values ('${IDS.course}', '${IDS.curriculum}', null, 'TEST_OPS_COURSE', 'TEST Mixed Guitar Course', 'ACTIVE');

insert into public.rooms(id, branch_id, code, name, capacity, status)
values ('${IDS.room}', '${IDS.branch}', 'TEST_ML_R2', 'Phòng TEST 2', 8, 'ACTIVE');

insert into public.classes(
  id, branch_id, course_id, code, name, class_type, capacity, status,
  accepted_from_level_id, accepted_to_level_id
)
values (
  '${IDS.class}', '${IDS.branch}', '${IDS.course}', 'TEST_OPS_CLASS', 'TEST Mixed Guitar',
  'GROUP', 8, 'ACTIVE', '${IDS.pre}', '${IDS.g5}'
);

insert into public.students(id, student_code, full_name, status)
values
  ('${IDS.studentA}', 'TEST_ML_A', 'TEST ML An', 'ACTIVE'),
  ('${IDS.studentB}', 'TEST_ML_B', 'TEST ML Bình', 'ACTIVE'),
  ('${IDS.studentC}', 'TEST_ML_C', 'TEST ML Cúc', 'ACTIVE'),
  ('${IDS.studentD}', 'TEST_ML_D', 'TEST ML Dũng', 'ACTIVE');

-- Academically valid TEST-only subjects; use the application's authoritative assignment RPC.
insert into public.curriculum_subjects(level_id, family_code, code, name, completion_rule)
select id, 'DIRECT', 'TEST_DIRECT', 'TEST direct assessment', 'DIRECT_ASSESSMENT'
from public.curriculum_levels where curriculum_id = '${IDS.curriculum}';
${[['studentA','g1'],['studentB','g3'],['studentC','pre'],['studentD','g5']].map(([student, level]) =>
  `select public.assign_student_academic_program('${IDS[student]}', '${IDS.curriculum}', '${IDS[level]}', current_date - 30);`).join('\n')}

insert into public.enrollments(
  id, student_id, class_id, student_curriculum_enrollment_id, enrolled_at, started_at, status
)
values
  ('${IDS.enrollA}', '${IDS.studentA}', '${IDS.class}', (select id from public.student_curriculum_enrollments where student_id = '${IDS.studentA}' and curriculum_id = '${IDS.curriculum}'), current_date - 14, current_date - 14, 'ACTIVE'),
  ('${IDS.enrollB}', '${IDS.studentB}', '${IDS.class}', (select id from public.student_curriculum_enrollments where student_id = '${IDS.studentB}' and curriculum_id = '${IDS.curriculum}'), current_date - 14, current_date - 14, 'ACTIVE'),
  ('${IDS.enrollC}', '${IDS.studentC}', '${IDS.class}', (select id from public.student_curriculum_enrollments where student_id = '${IDS.studentC}' and curriculum_id = '${IDS.curriculum}'), current_date - 14, current_date - 14, 'ACTIVE'),
  ('${IDS.enrollD}', '${IDS.studentD}', '${IDS.class}', (select id from public.student_curriculum_enrollments where student_id = '${IDS.studentD}' and curriculum_id = '${IDS.curriculum}'), current_date - 14, current_date - 14, 'ACTIVE');

insert into public.schedules(
  id, class_id, room_id, day_of_week, start_time, end_time, effective_from, timezone, status
)
values (
  '${IDS.schedule}',
  '${IDS.class}',
  '${IDS.room}',
  extract(isodow from (timezone('Asia/Ho_Chi_Minh', now()))::date)::smallint,
  '15:00',
  '16:30',
  (timezone('Asia/Ho_Chi_Minh', now()))::date - 7,
  'Asia/Ho_Chi_Minh',
  'ACTIVE'
);

-- Same occurrence shape as generate_session_occurrences, scoped ONLY to this TEST schedule.
insert into public.session_occurrences(schedule_id, occurrence_date, starts_at, ends_at, room_id, status, occurrence_type)
select id, (timezone(timezone, now()))::date,
  ((timezone(timezone, now()))::date + start_time) at time zone timezone,
  ((timezone(timezone, now()))::date + end_time) at time zone timezone,
  room_id, 'SCHEDULED', 'REGULAR'
from public.schedules where id = '${IDS.schedule}';

insert into public.tuition_plans(id, code, name, duration_months)
values ('${IDS.tuitionPlan}', 'TEST_ML_TUITION', 'TEST mixed-level tuition', 1);
insert into public.tuition_plan_branch_prices(tuition_plan_id,branch_id,list_price)
values ('${IDS.tuitionPlan}','${IDS.branch}',1000000);
insert into public.enrollment_tuition(id,enrollment_id,tuition_plan_id,starts_on,base_ends_on,effective_ends_on,
  plan_code_snapshot,plan_name_snapshot,duration_months_snapshot,amount,list_price,
  branch_id_snapshot,branch_code_snapshot,branch_name_snapshot)
values ('${IDS.tuition}','${IDS.enrollD}','${IDS.tuitionPlan}',current_date-14,current_date+15,current_date+15,
  'TEST_ML_TUITION','TEST mixed-level tuition',1,1000000,1000000,'${IDS.branch}','TEST_OPS_BR','TEST ML Branch');

with occ as (
  select id from public.session_occurrences
  where schedule_id = '${IDS.schedule}'
  order by occurrence_date desc
  limit 1
)
insert into public.attendance_records(session_occurrence_id, enrollment_id, status, marked_at)
select occ.id, e.enrollment_id, e.status, now()
from occ
cross join (values
  ('${IDS.enrollA}'::uuid, 'PRESENT'),
  ('${IDS.enrollB}'::uuid, 'PRESENT'),
  ('${IDS.enrollC}'::uuid, 'ABSENT'),
  ('${IDS.enrollD}'::uuid, 'LATE')
) as e(enrollment_id, status)
on conflict (session_occurrence_id, enrollment_id) do update
set status = excluded.status, marked_at = excluded.marked_at;

select
  c.name as class_name,
  format('%s → %s', lf.name, lt.name) as scope,
  (select count(*) from enrollments where class_id = c.id and status = 'ACTIVE') as students,
  (select count(*) from session_occurrences where schedule_id = '${IDS.schedule}') as sessions,
  (select count(*) from attendance_records where enrollment_id in (
    '${IDS.enrollA}','${IDS.enrollB}','${IDS.enrollC}','${IDS.enrollD}'
  )) as attendance_rows
from public.classes c
join public.curriculum_levels lf on lf.id = c.accepted_from_level_id
join public.curriculum_levels lt on lt.id = c.accepted_to_level_id
where c.id = '${IDS.class}';
`
}

function acceptanceSql() {
  return `
-- Snapshot full operational rows, including monetary values and timestamps.
create temp table mixed_before on commit drop as
select 'enrollments' as kind, to_jsonb(t) as row from public.enrollments t
union all select 'classes' as kind, to_jsonb(t) as row from public.classes t
union all select 'attendance_records' as kind, to_jsonb(t) as row from public.attendance_records t
union all select 'schedules' as kind, to_jsonb(t) as row from public.schedules t
union all select 'session_occurrences' as kind, to_jsonb(t) as row from public.session_occurrences t
union all select 'session_occurrence_participants' as kind, to_jsonb(t) as row from public.session_occurrence_participants t
union all select 'enrollment_tuition' as kind, to_jsonb(t) as row from public.enrollment_tuition t
union all select 'tuition_plans' as kind, to_jsonb(t) as row from public.tuition_plans t
union all select 'tuition_plan_branch_prices' as kind, to_jsonb(t) as row from public.tuition_plan_branch_prices t
union all select 'payments' as kind, to_jsonb(t) as row from public.payments t
union all select 'invoices' as kind, to_jsonb(t) as row from public.invoices t;
do $$ begin
  if (select current_level_id from public.student_curriculum_enrollments where student_id = '${IDS.studentD}' and curriculum_id = '${IDS.curriculum}') is distinct from '${IDS.g5}'::uuid then
    raise exception 'Acceptance must start at Grade 5';
  end if;
end $$;
-- Same assessment write as updateDirectSubjectProgressStatus; completion/unlock use existing triggers.
update public.student_subject_progress set status = 'PASS'
where level_progress_id in (select lp.id from public.student_level_progress lp
join public.student_curriculum_enrollments e on e.id = lp.enrollment_id
where e.student_id = '${IDS.studentD}' and e.curriculum_id = '${IDS.curriculum}' and lp.level_id = '${IDS.g5}');
select public.start_student_academic_level(
  (select id from public.student_curriculum_enrollments where student_id = '${IDS.studentD}' and curriculum_id = '${IDS.curriculum}'),
  '${IDS.g6}', current_date);
do $$ declare r record; actual jsonb; expected jsonb; begin
  if not exists (select 1 from public.class_student_current_level('${IDS.class}','${IDS.studentD}') where current_level_id = '${IDS.g6}' and level_name = 'Grade 6') then
    raise exception 'Grade 6 not returned by authoritative display source';
  end if;
  if public.class_enrollment_compatibility('${IDS.class}','${IDS.studentD}') <> 'OUTSIDE_SCOPE' then
    raise exception 'Expected out-of-scope compatibility';
  end if;
  if (select status from public.enrollments where id = '${IDS.enrollD}') <> 'ACTIVE' then
    raise exception 'Membership changed';
  end if;
  for r in select unnest(array['enrollments','classes','attendance_records','schedules','session_occurrences','session_occurrence_participants','enrollment_tuition','tuition_plans','tuition_plan_branch_prices','payments','invoices']) as kind loop
    select jsonb_agg(row order by row::text) into expected from mixed_before where kind = r.kind;
    execute format('select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.%I t', r.kind) into actual;
    if actual is distinct from expected then raise exception 'Operational mutation in %', r.kind; end if;
  end loop;
end $$;
select 'PASS: authoritative Grade 5 → Grade 6; ACTIVE; OUTSIDE_SCOPE; scope/attendance/schedule/tuition unchanged' as acceptance;
`
}

if (require.main === module) {
  const mode = process.argv[2] || '--seed'
  if (!['--seed', '--cleanup', '--acceptance'].includes(mode)) throw Error('Unknown fixture mode')
  const sql = mode === '--cleanup' ? cleanupSql() : mode === '--acceptance' ? acceptanceSql() : seedSql()
  console.log(psql('begin;\n' + sql + '\ncommit;'))
  console.log(`TEST Mixed Guitar ${mode} complete.`)
}
module.exports = { IDS, psql, cleanupSql, seedSql, acceptanceSql }
