-- Canonical awards; retain legacy stored results without rewriting historical rows.
alter table public.student_subject_progress drop constraint student_subject_progress_status_check;
alter table public.student_subject_progress add constraint student_subject_progress_status_check check(status in ('NOT_STARTED','IN_PROGRESS','PASS','MERIT','DISTINCTION','NOT_PASSED','EXEMPT'));
alter table public.student_component_progress drop constraint student_component_progress_status_check;
alter table public.student_component_progress add constraint student_component_progress_status_check check(status in ('NOT_STARTED','IN_PROGRESS','PASS','MERIT','DISTINCTION','NOT_PASSED','EXEMPT'));
create or replace function public.sync_subject_progress_from_components()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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
      where scp.status in ('PASS', 'MERIT', 'DISTINCTION')
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

create or replace function public.sync_level_progress_from_subjects()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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
      where ssp.status in ('PASS', 'MERIT', 'DISTINCTION', 'EXEMPT')
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

create or replace function public.guard_academic_child_integrity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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
     (tg_op = 'DELETE' or new.status not in ('PASS', 'MERIT', 'DISTINCTION', 'EXEMPT')) then
    raise exception 'Required academic progress cannot regress after progression';
  end if;
  if tg_table_name = 'student_subject_progress' then
    if tg_op = 'UPDATE' and pg_trigger_depth() = 1
       and (new.status is distinct from old.status or new.score is distinct from old.score)
       and exists(select 1 from public.curriculum_subjects where id=new.subject_id and completion_rule='ALL_REQUIRED_COMPONENTS') then
      raise exception 'Component-based subject results must be derived from components';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.stamp_academic_progress_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin

  if tg_op = 'INSERT'
     or new.status is distinct from old.status
  then

    -- Any status other than NOT_STARTED means learning has begun.
    if new.status <> 'NOT_STARTED' then
      new.started_at := coalesce(new.started_at, now());
    end if;

    -- PASS timestamp.
    if new.status in ('PASS', 'MERIT', 'DISTINCTION') then
      new.passed_at := coalesce(new.passed_at, now());
    else
      new.passed_at := null;
    end if;

  end if;

  new.updated_at := now();

  return new;
end;
$$;
