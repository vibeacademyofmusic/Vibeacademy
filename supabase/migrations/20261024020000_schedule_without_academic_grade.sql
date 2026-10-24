-- Timetable membership is independent of academic Grade/progress. A verified
-- same-program source reference may supply the subject while academic work is
-- pending. This function does not create or change academic or finance rows.
-- The source reference is deliberately read through a narrow boolean helper:
-- its raw profile/tuition payload remains protected by the existing RLS.
create or replace function public.has_verified_legacy_schedule_program(
  p_student uuid,
  p_curriculum uuid,
  p_branch uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $$
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then
    return false;
  end if;

  if auth.uid() is not null
     and not public.can_access_student(p_student)
     -- Match the live operational_admin() policy without depending on a
     -- function/role seed that is absent from a clean migration replay.
     and not (
       public.has_role('SUPER_ADMIN')
       or (
         public.account_is_active()
         and exists (
           select 1
           from public.user_roles assignment
           join public.roles role on role.id = assignment.role_id
           where assignment.user_id = auth.uid()
             and role.code = 'OPERATIONS_LEAD'
             and assignment.branch_id is null
             and assignment.is_active
             and (assignment.valid_from is null or assignment.valid_from <= now())
             and (assignment.valid_until is null or assignment.valid_until > now())
         )
       )
     )
     and not exists (
       select 1
       from public.student_placement_cases placement
       where placement.student_id = p_student
         and placement.branch_id = p_branch
         and public.registration_can('student_placement.view', placement.branch_id)
     ) then
    return false;
  end if;

  return exists (
    select 1
    from public.legacy_student_opening_rows source_row
    join public.legacy_student_opening_batches batch
      on batch.import_batch_id = source_row.import_batch_id
    join public.students student on student.id = source_row.target_student_id
    where source_row.target_student_id = p_student
      and source_row.curriculum_id = p_curriculum
      and source_row.disposition = 'IMPORT'
      and source_row.program_state = 'MAPPED_AWAITING_ACADEMIC_START'
      and batch.status = 'IMPORTED'
      and batch.branch_id = p_branch
      and student.default_branch_id = p_branch
      and student.status = 'ACTIVE'
  );
end;
$$;

revoke all on function public.has_verified_legacy_schedule_program(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.has_verified_legacy_schedule_program(uuid, uuid, uuid)
  to authenticated;

create or replace function public.class_enrollment_compatibility(p_class uuid, p_student uuid)
returns text
language plpgsql
stable
set search_path to public, pg_temp
as $$
declare
  v_from uuid;
  v_to uuid;
  v_curriculum uuid;
  v_branch uuid;
  v_prog record;
  v_level_curriculum uuid;
  v_from_seq integer;
  v_to_seq integer;
begin
  select class_row.accepted_from_level_id,
         class_row.accepted_to_level_id,
         coalesce(class_row.curriculum_id, course.curriculum_id),
         class_row.branch_id
  into v_from, v_to, v_curriculum, v_branch
  from public.classes class_row
  left join public.courses course on course.id = class_row.course_id
  where class_row.id = p_class;

  if not found or v_curriculum is null then
    raise exception 'Class not found' using errcode = 'P0001';
  end if;

  select * into v_prog
  from public.class_student_current_level(p_class, p_student);

  if found then
    if v_prog.curriculum_id is distinct from v_curriculum then
      return 'WRONG_PROGRAM';
    end if;
    -- The Academic program exists but its Grade has not been assigned yet.
    -- No Grade or progress row is fabricated by placement.
    if v_prog.current_level_id is null then
      return 'IN_SCOPE';
    end if;
    select curriculum_id into v_level_curriculum
    from public.curriculum_levels where id = v_prog.current_level_id;
    if v_level_curriculum is distinct from v_curriculum then
      return 'CURRENT_LEVEL_MISSING';
    end if;
    -- An empty class scope means mixed Grades are accepted. Known Grades still
    -- obey a configured range, preserving the original out-of-scope guard.
    if v_from is null and v_to is null then
      return 'IN_SCOPE';
    end if;
    if v_from is null or v_to is null then
      return 'CLASS_SCOPE_UNCONFIGURED';
    end if;
    select sequence_no into v_from_seq from public.curriculum_levels where id = v_from;
    select sequence_no into v_to_seq from public.curriculum_levels where id = v_to;
    if v_prog.sequence_no is null or v_from_seq is null or v_to_seq is null then
      return 'CURRENT_LEVEL_MISSING';
    end if;
    if v_prog.sequence_no < v_from_seq or v_prog.sequence_no > v_to_seq then
      return 'OUTSIDE_SCOPE';
    end if;
    return 'IN_SCOPE';
  end if;

  -- A historical reference is evidence for subject only. The source Grade is
  -- never copied to an Academic enrollment or used as a placement filter.
  if exists (
    select 1 from public.student_curriculum_enrollments academic
    where academic.student_id = p_student
      and academic.curriculum_id = v_curriculum
      and academic.status <> 'ACTIVE'
  ) then
    return 'ACADEMIC_PROGRAM_INACTIVE';
  end if;

  if public.has_verified_legacy_schedule_program(p_student, v_curriculum, v_branch) then
    return 'IN_SCOPE';
  end if;

  if exists (
    select 1 from public.student_curriculum_enrollments academic
    where academic.student_id = p_student and academic.status = 'ACTIVE'
  ) then
    return 'WRONG_PROGRAM';
  end if;
  return 'ACADEMIC_PROGRAM_MISSING';
end;
$$;

comment on column public.classes.accepted_from_level_id is
  'Inclusive optional lower Grade bound. NULL with accepted_to_level_id NULL accepts multiple Grades.';
comment on column public.classes.accepted_to_level_id is
  'Inclusive optional upper Grade bound. NULL with accepted_from_level_id NULL accepts multiple Grades.';

-- Only a privileged manual importer writes this private ledger after an
-- operational enrollment start date is explicitly approved. A source match
-- alone must never create a batch row or activate attendance.
create table maintenance_private.ct_schedule_import_batches (
  import_batch_id uuid primary key,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  plan_sha256 text not null check (plan_sha256 ~ '^[a-f0-9]{64}$'),
  branch_id uuid not null references public.branches(id),
  approved_enrollment_start_on date not null,
  status text not null check (status in ('IMPORTED', 'ROLLED_BACK')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  unique (source_sha256, plan_sha256, branch_id, approved_enrollment_start_on)
);

create table maintenance_private.ct_schedule_import_rows (
  import_batch_id uuid not null
    references maintenance_private.ct_schedule_import_batches(import_batch_id),
  source_reference text not null,
  student_id uuid not null references public.students(id),
  class_id uuid not null references public.classes(id),
  enrollment_id uuid references public.enrollments(id) on delete set null,
  enrollment_id_snapshot uuid not null,
  action text not null check (action in ('CREATED', 'EXISTING', 'ROLLED_BACK')),
  enrollment_before jsonb,
  enrollment_after jsonb not null,
  created_at timestamptz not null default now(),
  primary key (import_batch_id, source_reference),
  unique (import_batch_id, student_id, class_id),
  unique (import_batch_id, enrollment_id_snapshot),
  check (
    (action = 'CREATED' and enrollment_before is null)
    or (action = 'EXISTING' and enrollment_before = enrollment_after)
    or (action = 'ROLLED_BACK' and enrollment_before is null)
  )
);

create index ct_schedule_import_rows_student
  on maintenance_private.ct_schedule_import_rows(student_id);
alter table maintenance_private.ct_schedule_import_batches enable row level security;
alter table maintenance_private.ct_schedule_import_rows enable row level security;
revoke all on maintenance_private.ct_schedule_import_batches,
  maintenance_private.ct_schedule_import_rows from public, anon, authenticated, service_role;

-- A rollback is denied once attendance, tuition, placement, makeup or any
-- other FK-dependent business row exists. It never deletes an edited record.
create function maintenance_private.rollback_ct_schedule_import(p_batch uuid)
returns jsonb
language plpgsql
security invoker
set search_path to public, pg_temp
as $$
declare
  v_status text;
  v_ids uuid[];
  v_dependency record;
  v_found boolean;
  v_deleted integer;
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Manual database administrator operation only';
  end if;

  select status into v_status
  from maintenance_private.ct_schedule_import_batches
  where import_batch_id = p_batch for update;
  if not found then raise exception 'Schedule import batch not found'; end if;
  if v_status = 'ROLLED_BACK' then
    return jsonb_build_object('import_batch_id', p_batch, 'already_rolled_back', true);
  end if;

  select coalesce(array_agg(enrollment_id_snapshot), '{}'::uuid[])
  into v_ids
  from maintenance_private.ct_schedule_import_rows
  where import_batch_id = p_batch and action = 'CREATED';

  perform 1 from public.enrollments where id = any(v_ids) for update;
  if exists (
    select 1
    from maintenance_private.ct_schedule_import_rows row_audit
    left join public.enrollments enrollment
      on enrollment.id = row_audit.enrollment_id_snapshot
    where row_audit.import_batch_id = p_batch
      and row_audit.action = 'CREATED'
      and (enrollment.id is null or to_jsonb(enrollment) is distinct from row_audit.enrollment_after)
  ) then
    raise exception 'Imported enrollment changed; manual reconciliation required';
  end if;

  if exists (
    select 1
    from maintenance_private.ct_schedule_import_rows row_audit
    join maintenance_private.ct_schedule_import_batches batch
      on batch.import_batch_id = row_audit.import_batch_id
    join public.student_curriculum_enrollments academic
      on academic.student_id = row_audit.student_id
    where row_audit.import_batch_id = p_batch
      and row_audit.action = 'CREATED'
      and academic.created_at > batch.created_at
  ) then
    raise exception 'Academic history added after import; manual reconciliation required';
  end if;

  if exists (
    select 1 from pg_constraint constraint_row
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.enrollments'::regclass
      and constraint_row.conrelid <> 'maintenance_private.ct_schedule_import_rows'::regclass
      and cardinality(constraint_row.conkey) <> 1
  ) then
    raise exception 'Composite enrollment dependency requires manual reconciliation';
  end if;

  for v_dependency in
    select constraint_row.conrelid::regclass as relation_name,
           attribute.attname as column_name
    from pg_constraint constraint_row
    join pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = constraint_row.conkey[1]
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.enrollments'::regclass
      and constraint_row.conrelid <> 'maintenance_private.ct_schedule_import_rows'::regclass
  loop
    execute format('select exists (select 1 from %s where %I = any($1))',
                   v_dependency.relation_name, v_dependency.column_name)
      into v_found using v_ids;
    if v_found then
      raise exception 'Dependent business data in %; manual reconciliation required',
        v_dependency.relation_name;
    end if;
  end loop;

  delete from public.enrollments where id = any(v_ids);
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_ids) then
    raise exception 'Schedule rollback count mismatch';
  end if;

  update maintenance_private.ct_schedule_import_rows
  set action = 'ROLLED_BACK'
  where import_batch_id = p_batch and action = 'CREATED';
  update maintenance_private.ct_schedule_import_batches
  set status = 'ROLLED_BACK', rolled_back_at = clock_timestamp()
  where import_batch_id = p_batch;

  return jsonb_build_object('import_batch_id', p_batch,
                            'deleted_enrollments', v_deleted,
                            'existing_enrollments_preserved', true);
end;
$$;

revoke all on function maintenance_private.rollback_ct_schedule_import(uuid)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
