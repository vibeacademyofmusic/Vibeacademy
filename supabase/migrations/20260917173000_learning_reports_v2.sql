-- Learning Reports V2
-- Mở rộng teacher_summary theo cấu trúc báo cáo học tập VIBE.
-- Giữ tương thích với các key V1 để không làm hỏng dữ liệu cũ.

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
set search_path=public
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

  if r.status in ('APPROVED', 'CANCELLED') then
    raise exception 'Report is immutable';
  end if;

  if p_action = 'SAVE' and r.status = 'DRAFT' then
    if p_summary is null
       or jsonb_typeof(p_summary) <> 'object'
       or p_note is null then
      raise exception 'Invalid summary';
    end if;

    if exists(
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

        -- V1 compatibility
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

  elsif p_action = 'REGENERATE' and r.status = 'DRAFT' then

    if not exists(
      select 1
      from enrollments e
      join classes c on c.id = e.class_id
      where e.id = r.enrollment_id
        and e.student_id = r.student_id
        and c.branch_id = r.branch_id
        and e.student_curriculum_enrollment_id
          is not distinct from r.curriculum_enrollment_id
    ) then
      raise exception 'Report context changed; cannot regenerate';
    end if;

    new_data :=
      learning_report_source(
        r.enrollment_id,
        r.period_start,
        r.period_end
      );

    update learning_reports
    set draft_data = new_data,
        generated_at = now(),
        generated_by = auth.uid()
    where id = p_id;

  elsif p_action = 'READY' and r.status = 'DRAFT' then

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

  elsif p_action = 'RETURN'
        and r.status = 'READY_FOR_REVIEW' then

    update learning_reports
    set status = 'DRAFT'
    where id = p_id;

  elsif p_action = 'CANCEL' then

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
  values(
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