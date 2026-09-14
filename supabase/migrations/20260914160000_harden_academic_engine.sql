-- Academic hardening: preserve per-student progression and completion.
-- Existing tables and RPC signatures are unchanged.

create or replace function public.assign_student_academic_program(
  p_student_id uuid,
  p_curriculum_id uuid,
  p_level_id uuid,
  p_started_at date,
  p_is_primary boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment_id uuid;
  v_level_progress_id uuid;
begin

  -- ----------------------------------------------------------
  -- Permission
  -- ----------------------------------------------------------

  if auth.uid() is not null
     and not public.has_role('SUPER_ADMIN')
  then
    raise exception 'Only SUPER_ADMIN can assign an academic program';
  end if;


  -- ----------------------------------------------------------
  -- Required data
  -- ----------------------------------------------------------

  if p_student_id is null
     or p_curriculum_id is null
     or p_level_id is null
     or p_started_at is null
  then
    raise exception 'Student, curriculum, level and start date are required';
  end if;


  -- ----------------------------------------------------------
  -- Student must exist
  -- ----------------------------------------------------------

  if p_started_at > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Academic assignment start date cannot be in the future';
  end if;

  -- Serialize assignment/primary changes for this student.
  perform 1 from public.students where id = p_student_id for update;
  if not found then
    raise exception 'Student does not exist';
  end if;


  -- ----------------------------------------------------------
  -- Curriculum must be active
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.curriculums
    where id = p_curriculum_id
      and status = 'ACTIVE'
  ) then
    raise exception 'Curriculum does not exist or is inactive';
  end if;


  -- ----------------------------------------------------------
  -- Level must belong to curriculum
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.curriculum_levels
    where id = p_level_id
      and curriculum_id = p_curriculum_id
      and status = 'ACTIVE'
  ) then
    raise exception 'Level does not belong to this curriculum or is inactive';
  end if;


  -- ----------------------------------------------------------
  -- Prevent duplicate active academic enrollment
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.student_curriculum_enrollments
    where student_id = p_student_id
      and curriculum_id = p_curriculum_id
      and status in ('ACTIVE', 'PAUSED')
  ) then
    raise exception 'Student already has an active enrollment in this curriculum';
  end if;


  -- ----------------------------------------------------------
  -- Level must contain subjects
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.curriculum_subjects
    where level_id = p_level_id
      and status = 'ACTIVE'
  ) then
    raise exception 'Selected level has no active subjects';
  end if;


  -- ----------------------------------------------------------
  -- Validate component-based subjects
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.curriculum_subjects s
    where s.level_id = p_level_id
      and s.status = 'ACTIVE'
      and s.is_required = true
      and s.completion_rule = 'ALL_REQUIRED_COMPONENTS'
      and not exists (
        select 1
        from public.curriculum_subject_components c
        where c.subject_id = s.id
          and c.is_required = true
          and c.status = 'ACTIVE'
      )
  ) then
    raise exception
      'A required subject has no required active components';
  end if;


  -- ----------------------------------------------------------
  -- If this becomes Primary Program,
  -- remove Primary flag from other active academic programs
  -- ----------------------------------------------------------

  if p_is_primary then
    update public.student_curriculum_enrollments
    set
      is_primary = false,
      updated_at = now()
    where student_id = p_student_id
      and is_primary = true
      and status in ('ACTIVE', 'PAUSED');
  end if;


  -- ----------------------------------------------------------
  -- Create Academic Enrollment
  -- ----------------------------------------------------------

  insert into public.student_curriculum_enrollments (
    student_id,
    curriculum_id,
    current_level_id,
    is_primary,
    status,
    started_at
  )
  values (
    p_student_id,
    p_curriculum_id,
    p_level_id,
    p_is_primary,
    'ACTIVE',
    p_started_at
  )
  returning id
  into v_enrollment_id;


  -- ----------------------------------------------------------
  -- Create Current Level Progress
  -- ----------------------------------------------------------

  insert into public.student_level_progress (
    enrollment_id,
    level_id,
    status,
    unlocked_at,
    started_at
  )
  values (
    v_enrollment_id,
    p_level_id,
    'IN_PROGRESS',
    now(),
    p_started_at::timestamp
      at time zone 'Asia/Ho_Chi_Minh'
  )
  returning id
  into v_level_progress_id;


  -- ----------------------------------------------------------
  -- Create Subject Progress
  -- and Component Progress
  -- ----------------------------------------------------------

  with inserted_subjects as (

    insert into public.student_subject_progress (
      level_progress_id,
      subject_id,
      status
    )

    select
      v_level_progress_id,
      s.id,
      'NOT_STARTED'

    from public.curriculum_subjects s

    where s.level_id = p_level_id
      and s.status = 'ACTIVE'

    order by s.sort_order

    returning
      id,
      subject_id
  )

  insert into public.student_component_progress (
    subject_progress_id,
    component_id,
    status
  )

  select
    isp.id,
    c.id,
    'NOT_STARTED'

  from inserted_subjects isp

  join public.curriculum_subject_components c
    on c.subject_id = isp.subject_id
   and c.status = 'ACTIVE'

  order by
    isp.subject_id,
    c.sort_order;


  return v_enrollment_id;

end;
$$;



create or replace function public.start_student_academic_level(
  p_enrollment_id uuid,
  p_level_id uuid,
  p_started_at date default (
    (now() at time zone 'Asia/Ho_Chi_Minh')::date
  )
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_curriculum_id uuid;
  v_enrollment_status text;
  v_level_progress_id uuid;
  v_level_sequence integer;
  v_vietnam_today date;
begin

  v_vietnam_today :=
    (now() at time zone 'Asia/Ho_Chi_Minh')::date;


  if auth.uid() is not null
     and not public.has_role('SUPER_ADMIN')
  then
    raise exception
      'Only SUPER_ADMIN can start an academic level';
  end if;


  if p_enrollment_id is null
     or p_level_id is null
     or p_started_at is null
  then
    raise exception
      'Enrollment, level and start date are required';
  end if;


  -- IMPORTANT:
  -- Compare against Vietnam calendar date,
  -- not PostgreSQL server UTC current_date.
  if p_started_at > v_vietnam_today then
    raise exception
      'Academic level start date cannot be in the future';
  end if;


  select
    curriculum_id,
    status
  into
    v_curriculum_id,
    v_enrollment_status
  from public.student_curriculum_enrollments
  where id = p_enrollment_id for update;


  if v_curriculum_id is null then
    raise exception
      'Academic enrollment not found';
  end if;


  if v_enrollment_status <> 'ACTIVE' then
    raise exception
      'Academic enrollment must be ACTIVE';
  end if;


  if not exists (select 1 from public.curriculums where id = v_curriculum_id and status = 'ACTIVE') then
    raise exception 'Curriculum does not exist or is inactive';
  end if;

  select sequence_no
  into v_level_sequence
  from public.curriculum_levels
  where id = p_level_id
    and curriculum_id = v_curriculum_id
    and status = 'ACTIVE';


  if v_level_sequence is null then
    raise exception
      'Level does not belong to this active curriculum';
  end if;


  select id
  into v_level_progress_id
  from public.student_level_progress
  where enrollment_id = p_enrollment_id
    and level_id = p_level_id
    and status = 'AVAILABLE';


  if v_level_progress_id is null then
    raise exception
      'Academic level is not available to start';
  end if;


  if exists (
    select 1
    from public.student_level_progress
    where enrollment_id = p_enrollment_id
      and status = 'IN_PROGRESS'
      and id <> v_level_progress_id
  ) then
    raise exception
      'Another academic level is already in progress';
  end if;


  if not exists (
    select 1
    from public.curriculum_subjects
    where level_id = p_level_id
      and status = 'ACTIVE'
  ) then
    raise exception
      'Academic level has no active subjects';
  end if;


  -- Only levels that are part of this student's actual academic journey
-- are prerequisites.
--
-- Example:
-- Student starts at Grade 3.
-- Grade 1 and Grade 2 have no student_level_progress rows,
-- therefore they must NOT block Grade 4.
--
-- Grade 3 must be COMPLETED before Grade 4 can start.
if exists (
  select 1
  from public.student_level_progress previous_progress
  join public.curriculum_levels previous_level
    on previous_level.id = previous_progress.level_id
  where previous_progress.enrollment_id = p_enrollment_id
    and previous_level.curriculum_id = v_curriculum_id
    and previous_level.sequence_no < v_level_sequence
    and previous_progress.status <> 'COMPLETED'
) then
  raise exception
    'Previous academic levels in this student journey must be completed first';
end if;


  if exists (
    select 1 from public.curriculum_subjects s
    where s.level_id = p_level_id and s.status = 'ACTIVE' and s.is_required
      and s.completion_rule = 'ALL_REQUIRED_COMPONENTS'
      and not exists (select 1 from public.curriculum_subject_components c
        where c.subject_id = s.id and c.status = 'ACTIVE' and c.is_required)
  ) then
    raise exception 'A required subject has no required active components';
  end if;

  update public.student_level_progress
  set
    status = 'IN_PROGRESS',
    unlocked_at = coalesce(unlocked_at, now()),
    started_at =
      p_started_at::timestamp
      at time zone 'Asia/Ho_Chi_Minh',
    completed_at = null,
    updated_at = now()
  where id = v_level_progress_id;


  insert into public.student_subject_progress (
    level_progress_id,
    subject_id,
    status
  )
  select
    v_level_progress_id,
    cs.id,
    'NOT_STARTED'
  from public.curriculum_subjects cs
  where cs.level_id = p_level_id
    and cs.status = 'ACTIVE'
  on conflict (level_progress_id, subject_id)
  do nothing;


  insert into public.student_component_progress (
    subject_progress_id,
    component_id,
    status
  )
  select
    ssp.id,
    csc.id,
    'NOT_STARTED'
  from public.student_subject_progress ssp
  join public.curriculum_subjects cs
    on cs.id = ssp.subject_id
  join public.curriculum_subject_components csc
    on csc.subject_id = cs.id
    and csc.status = 'ACTIVE'
  where ssp.level_progress_id = v_level_progress_id
  on conflict (
    subject_progress_id,
    component_id
  )
  do nothing;


  update public.student_curriculum_enrollments
  set
    current_level_id = p_level_id,
    updated_at = now()
  where id = p_enrollment_id;


  return v_level_progress_id;
end;
$function$;

-- Count the required curriculum definitions, including missing progress rows.
create or replace function public.sync_subject_progress_from_components()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_progress_id uuid;
  v_subject_id uuid;
  v_completion_rule text;

  v_total integer;
  v_not_started integer;
  v_pass integer;
  v_not_passed integer;
  v_exempt integer;

  v_new_status text;
begin

  if tg_op = 'DELETE' then
    v_subject_progress_id := old.subject_progress_id;
  else
    v_subject_progress_id := new.subject_progress_id;
  end if;


  select
    ssp.subject_id,
    cs.completion_rule
  into
    v_subject_id,
    v_completion_rule
  from public.student_subject_progress ssp
  join public.curriculum_subjects cs
    on cs.id = ssp.subject_id
  where ssp.id = v_subject_progress_id;


  -- Direct Assessment / Manual subjects
  -- are not calculated from components.
  if v_completion_rule is distinct from 'ALL_REQUIRED_COMPONENTS' then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  select
    count(*)::integer,

    count(*) filter (
      where coalesce(scp.status, 'NOT_STARTED') = 'NOT_STARTED'
    )::integer,

    count(*) filter (
      where scp.status = 'PASS'
    )::integer,

    count(*) filter (
      where scp.status = 'NOT_PASSED'
    )::integer,

    count(*) filter (
      where scp.status = 'EXEMPT'
    )::integer

  into
    v_total,
    v_not_started,
    v_pass,
    v_not_passed,
    v_exempt

  from public.curriculum_subject_components csc
  left join public.student_component_progress scp
    on scp.component_id = csc.id and scp.subject_progress_id = v_subject_progress_id
  where csc.subject_id = v_subject_id
    and csc.is_required = true
    and csc.status = 'ACTIVE';


  -- No required components = do not auto-complete.
  if v_total = 0 then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  if v_not_started = v_total then

    v_new_status := 'NOT_STARTED';

  elsif (v_pass + v_exempt) = v_total then

    v_new_status := 'PASS';

  elsif
    v_not_passed > 0
    and (v_pass + v_exempt + v_not_passed) = v_total
  then

    v_new_status := 'NOT_PASSED';

  else

    v_new_status := 'IN_PROGRESS';

  end if;


  update public.student_subject_progress
  set status = v_new_status
  where id = v_subject_progress_id
    and status is distinct from v_new_status;


  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;

end;
$$;


drop trigger if exists
  trg_sync_subject_progress_from_components
on public.student_component_progress;

create trigger trg_sync_subject_progress_from_components
after insert or delete or update of status
on public.student_component_progress
for each row
execute function public.sync_subject_progress_from_components();


-- ============================================================
-- 4. REQUIRED SUBJECTS → LEVEL / GRADE
-- ============================================================

create or replace function public.sync_level_progress_from_subjects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level_progress_id uuid;
  v_level_id uuid;
  v_completion_rule text;

  v_total integer;
  v_completed integer;
  v_started integer;

  v_current_status text;
  v_new_status text;
begin

  if tg_op = 'DELETE' then
    v_level_progress_id := old.level_progress_id;
  else
    v_level_progress_id := new.level_progress_id;
  end if;


  select
    slp.level_id,
    cl.completion_rule,
    slp.status
  into
    v_level_id,
    v_completion_rule,
    v_current_status
  from public.student_level_progress slp
  join public.curriculum_levels cl
    on cl.id = slp.level_id
  where slp.id = v_level_progress_id;


  -- Manual levels are not automatically completed.
  if v_completion_rule is distinct from 'ALL_REQUIRED_SUBJECTS' then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  select
    count(*)::integer,

    count(*) filter (
      where ssp.status in ('PASS', 'EXEMPT')
    )::integer,

    count(*) filter (
      where ssp.status <> 'NOT_STARTED'
    )::integer

  into
    v_total,
    v_completed,
    v_started

  from public.curriculum_subjects cs
  left join public.student_subject_progress ssp
    on ssp.subject_id = cs.id and ssp.level_progress_id = v_level_progress_id
  where cs.level_id = v_level_id
    and cs.is_required = true
    and cs.status = 'ACTIVE';


  -- No required subjects = do not auto-complete.
  if v_total = 0 then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  if v_completed = v_total then

    v_new_status := 'COMPLETED';

  elsif v_started > 0 then

    v_new_status := 'IN_PROGRESS';

  elsif v_current_status in ('IN_PROGRESS', 'COMPLETED') then

    v_new_status := 'IN_PROGRESS';

  else

    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;

  end if;


  update public.student_level_progress
  set status = v_new_status
  where id = v_level_progress_id
    and status is distinct from v_new_status;


  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;

end;
$$;


drop trigger if exists
  trg_sync_level_progress_from_subjects
on public.student_subject_progress;

create trigger trg_sync_level_progress_from_subjects
after insert or delete or update of status
on public.student_subject_progress
for each row
execute function public.sync_level_progress_from_subjects();

-- A completed grade becomes immutable once its successor is unlocked,
-- or when the academic enrollment itself is completed (final grade).
create function public.academic_grade_is_sealed(p_progress_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_level_progress p
    join public.student_curriculum_enrollments e on e.id = p.enrollment_id
    join public.curriculum_levels l on l.id = p.level_id
    where p.id = p_progress_id and p.status = 'COMPLETED'
      and (e.status = 'COMPLETED' or exists (
        select 1 from public.student_level_progress later
        join public.curriculum_levels ll on ll.id = later.level_id
        where later.enrollment_id = p.enrollment_id
          and ll.curriculum_id = l.curriculum_id and ll.sequence_no > l.sequence_no
          and later.status in ('AVAILABLE', 'IN_PROGRESS', 'COMPLETED')
      ))
  );
$$;
revoke all on function public.academic_grade_is_sealed(uuid) from public, anon, authenticated;

create function public.guard_academic_level_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then
    if tg_op = 'UPDATE' and (new.enrollment_id is distinct from old.enrollment_id or new.level_id is distinct from old.level_id) then
      raise exception 'Academic progress identity cannot be changed';
    end if;
    if public.academic_grade_is_sealed(old.id) and
       (tg_op = 'DELETE' or new.status is distinct from 'COMPLETED') then
      raise exception 'Completed academic grade cannot regress after progression';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger trg_guard_academic_level_integrity
before insert or update or delete on public.student_level_progress
for each row execute function public.guard_academic_level_integrity();

-- A unique index also covers concurrent direct writes, outside the RPC.
create unique index student_level_one_in_progress
on public.student_level_progress(enrollment_id) where status = 'IN_PROGRESS';

create function public.guard_academic_child_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_level uuid;
  v_required boolean;
  v_subject uuid;
begin
  if tg_table_name = 'student_subject_progress' then
    if tg_op = 'UPDATE' and (new.level_progress_id is distinct from old.level_progress_id or new.subject_id is distinct from old.subject_id) then
      raise exception 'Academic progress identity cannot be changed';
    end if;
    v_level := case when tg_op = 'DELETE' then old.level_progress_id else new.level_progress_id end;
    v_subject := case when tg_op = 'DELETE' then old.subject_id else new.subject_id end;
    select is_required and status = 'ACTIVE' into v_required from public.curriculum_subjects where id = v_subject;
  else
    if tg_op = 'UPDATE' and (new.subject_progress_id is distinct from old.subject_progress_id or new.component_id is distinct from old.component_id) then
      raise exception 'Academic progress identity cannot be changed';
    end if;
    select sp.level_progress_id,
      s.is_required and s.status = 'ACTIVE' and s.completion_rule = 'ALL_REQUIRED_COMPONENTS'
        and c.is_required and c.status = 'ACTIVE'
    into v_level, v_required
    from public.student_subject_progress sp
    join public.curriculum_subjects s on s.id = sp.subject_id
    join public.curriculum_subject_components c on c.id =
      case when tg_op = 'DELETE' then old.component_id else new.component_id end
    where sp.id = case when tg_op = 'DELETE' then old.subject_progress_id else new.subject_progress_id end;
  end if;
  -- Lock the owning grade before recalculation to serialize sibling edits.
  perform 1 from public.student_level_progress where id = v_level for update;
  if v_required and public.academic_grade_is_sealed(v_level) and
     (tg_op = 'DELETE' or new.status not in ('PASS', 'EXEMPT')) then
    raise exception 'Required academic progress cannot regress after progression';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger trg_guard_academic_subject_integrity
before insert or update or delete on public.student_subject_progress
for each row execute function public.guard_academic_child_integrity();
create trigger trg_guard_academic_component_integrity
before insert or update or delete on public.student_component_progress
for each row execute function public.guard_academic_child_integrity();
revoke all on function public.guard_academic_level_integrity() from public, anon, authenticated;
revoke all on function public.guard_academic_child_integrity() from public, anon, authenticated;
