-- Learning Reports publish workflow
-- DRAFT -> READY_FOR_REVIEW -> APPROVED -> PUBLISHED
-- Approval freezes the report.
-- Publishing exposes the already-approved snapshot without changing its content.

alter table public.learning_reports
  drop constraint if exists learning_reports_status_check;

alter table public.learning_reports
  add constraint learning_reports_status_check
  check (
    status in (
      'DRAFT',
      'READY_FOR_REVIEW',
      'APPROVED',
      'PUBLISHED',
      'CANCELLED'
    )
  );

alter table public.learning_reports
  drop constraint if exists learning_reports_sent_at_check;

alter table public.learning_reports
  drop constraint if exists learning_reports_sent_at_state_check;

alter table public.learning_reports
  add constraint learning_reports_sent_at_state_check
  check (
    (status = 'PUBLISHED' and sent_at is not null)
    or
    (status <> 'PUBLISHED' and sent_at is null)
  );

-- Replace the old approval/snapshot invariant.
-- APPROVED and PUBLISHED must both retain the frozen approved snapshot.
do $$
declare
  constraint_name text;
begin
  select c.conname
  into constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'learning_reports'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%snapshot_data%'
    and pg_get_constraintdef(c.oid) like '%approved_at%'
  limit 1;

  if constraint_name is not null then
    execute format(
      'alter table public.learning_reports drop constraint %I',
      constraint_name
    );
  end if;
end
$$;

alter table public.learning_reports
  add constraint learning_reports_approval_snapshot_check
  check (
    (
      status in ('APPROVED', 'PUBLISHED')
      and snapshot_data is not null
      and approved_at is not null
      and approved_by is not null
    )
    or
    (
      status not in ('APPROVED', 'PUBLISHED')
      and snapshot_data is null
      and approved_at is null
      and approved_by is null
    )
  );

create or replace function public.guard_learning_report()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Report is immutable';
  end if;

  if old.status in ('PUBLISHED', 'CANCELLED') then
    raise exception 'Report is immutable';
  end if;

  -- Once approved, the only allowed mutation is publication.
  if old.status = 'APPROVED' then
    if new.status <> 'PUBLISHED'
       or new.sent_at is null
       or new.snapshot_data is distinct from old.snapshot_data
       or new.teacher_summary is distinct from old.teacher_summary
       or new.admin_note is distinct from old.admin_note
       or new.approved_at is distinct from old.approved_at
       or new.approved_by is distinct from old.approved_by then
      raise exception 'Report is immutable';
    end if;
  end if;

  if (
    new.student_id,
    new.enrollment_id,
    new.curriculum_enrollment_id,
    new.branch_id,
    new.report_type,
    new.period_start,
    new.period_end
  )
  is distinct from (
    old.student_id,
    old.enrollment_id,
    old.curriculum_enrollment_id,
    old.branch_id,
    old.report_type,
    old.period_start,
    old.period_end
  ) then
    raise exception 'Report identity is immutable';
  end if;

  return new;
end
$$;

create or replace function public.update_learning_report(
  p_id uuid,
  p_version integer,
  p_action text,
  p_summary jsonb default '{}'::jsonb,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r learning_reports;
  new_data jsonb;
begin
  if not coalesce(has_role('SUPER_ADMIN'), false) then
    raise exception 'Unauthorized';
  end if;

  select *
  into r
  from learning_reports
  where id = p_id
  for update;

  if not found or r.version is distinct from p_version then
    raise exception 'Report changed; reload';
  end if;

  if r.status in ('PUBLISHED', 'CANCELLED') then
  raise exception 'Report is immutable';
end if;

if r.status = 'APPROVED'
   and p_action <> 'PUBLISH' then
  raise exception 'Report is immutable';
end if;

  if p_action = 'SAVE' and r.status = 'DRAFT' then

    if p_summary is null
       or jsonb_typeof(p_summary) <> 'object'
       or p_note is null then
      raise exception 'Invalid summary';
    end if;

    if exists (
      select 1
      from jsonb_each(p_summary) x
      where x.key not in (
        'achievement',
        'difficulty',
        'intervention',
        'next_month_plan',
        'practice_consistency',
        'lesson_preparation',
        'learning_attitude',
        'general_comment',
        'strengths',
        'improvement_areas',
        'next_focus',
        'recommendation'
      )
      or jsonb_typeof(x.value) <> 'string'
      or char_length(x.value #>> '{}') > 4000
    ) then
      raise exception 'Invalid summary';
    end if;

    update learning_reports
    set teacher_summary = p_summary,
        admin_note = p_note
    where id = p_id;

  elsif p_action = 'REGENERATE'
        and r.status = 'DRAFT' then

    new_data := learning_report_source(
      r.enrollment_id,
      r.period_start,
      r.period_end
    );

    update learning_reports
    set draft_data = new_data,
        generated_at = now(),
        generated_by = auth.uid()
    where id = p_id;

  elsif p_action = 'READY'
        and r.status = 'DRAFT' then

    update learning_reports
    set status = 'READY_FOR_REVIEW'
    where id = p_id;

  elsif p_action = 'APPROVE'
        and r.status = 'READY_FOR_REVIEW' then

    update learning_reports
    set status = 'APPROVED',
        snapshot_data =
          r.draft_data ||
          jsonb_build_object(
            'teacher_summary', r.teacher_summary,
            'admin_note', r.admin_note
          ),
        approved_at = now(),
        approved_by = auth.uid()
    where id = p_id;

  elsif p_action = 'PUBLISH'
        and r.status = 'APPROVED' then

    update learning_reports
    set status = 'PUBLISHED',
        sent_at = now()
    where id = p_id;

  elsif p_action = 'RETURN'
        and r.status = 'READY_FOR_REVIEW' then

    update learning_reports
    set status = 'DRAFT'
    where id = p_id;

  elsif p_action = 'CANCEL'
        and r.status in ('DRAFT', 'READY_FOR_REVIEW') then

    update learning_reports
    set status = 'CANCELLED'
    where id = p_id;

  else
    raise exception 'Invalid report transition';
  end if;

  insert into learning_report_events(
    report_id,
    event,
    version,
    actor_id
  )
  values (
    p_id,
    p_action,
    r.version + 1,
    auth.uid()
  );

  return p_id;
end
$$;

revoke all
on function public.update_learning_report(
  uuid,
  integer,
  text,
  jsonb,
  text
)
from public, anon, authenticated;

grant execute
on function public.update_learning_report(
  uuid,
  integer,
  text,
  jsonb,
  text
)
to authenticated;
