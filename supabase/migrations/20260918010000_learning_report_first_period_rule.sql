-- First MONTHLY period follows the enrollment start; later periods are calendar months.
-- Keep existing report identities (including CANCELLED) reserved and immutable.
create or replace function public.generate_learning_report(
  p_enrollment_id uuid, p_type text, p_start date, p_end date
)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  e enrollments;
  r learning_reports;
  result uuid;
  payload jsonb;
  required_end date;
begin
  if not coalesce(has_role('SUPER_ADMIN'),false) then
    raise exception 'Unauthorized';
  end if;
  if p_type is null or p_type not in ('MONTHLY','END_OF_COURSE')
     or p_start is null or p_end is null or p_end<p_start
     or p_end >= (now() at time zone 'Asia/Ho_Chi_Minh')::date
     or p_end-p_start>3660 then
    raise exception 'Invalid closed report period';
  end if;

  -- Serialize history checks and generation for this enrollment.
  select * into e from enrollments where id=p_enrollment_id for update;
  if not found or e.started_at is null or e.started_at>p_end
     or (e.ended_at is not null and e.ended_at<p_start) then
    raise exception 'Enrollment does not overlap period';
  end if;
  select * into r from learning_reports
  where enrollment_id=p_enrollment_id and report_type=p_type
    and period_start=p_start and period_end=p_end;
  -- Preserve historical/legacy periods and cancelled identities; never regenerate here.
  if found then return r.id; end if;

  if p_type='MONTHLY' then
    if p_start<e.started_at or (e.ended_at is not null and p_end>e.ended_at) then
      raise exception 'Monthly report must stay within enrollment dates; use END_OF_COURSE for a shortened final period';
    end if;
    -- All existing statuses count, as cancellation does not release the unique identity.
    if not exists(select 1 from learning_reports where enrollment_id=e.id and report_type='MONTHLY') then
      if extract(day from e.started_at)=1 then
        required_end := (date_trunc('month',e.started_at)+interval '1 month - 1 day')::date;
        if p_start<>e.started_at or p_end<>required_end then
          raise exception 'First monthly report must cover the enrollment start calendar month';
        end if;
      else
        required_end := (date_trunc('month',e.started_at)+interval '2 months - 1 day')::date;
        if p_start<>e.started_at or p_end<>required_end then
          raise exception 'First monthly report must start on the enrollment start date and end on the last day of the following month';
        end if;
      end if;
    elsif p_start<>date_trunc('month',p_start)::date
       or p_end<>(date_trunc('month',p_start)+interval '1 month - 1 day')::date then
      raise exception 'Monthly report must cover a full calendar month';
    end if;
    if exists(select 1 from learning_reports where enrollment_id=e.id and report_type='MONTHLY'
      and period_start<=p_end and period_end>=p_start) then
      raise exception 'Monthly report overlaps an existing report';
    end if;
  end if;

  -- END_OF_COURSE retains its existing closed-period/overlap semantics.
  payload:=learning_report_source(p_enrollment_id,p_start,p_end);
  insert into learning_reports(student_id,enrollment_id,curriculum_enrollment_id,branch_id,report_type,period_start,period_end,draft_data,generated_by)
  values(e.student_id,e.id,e.student_curriculum_enrollment_id,(payload->'branch'->>'id')::uuid,p_type,p_start,p_end,payload,auth.uid()) returning id into result;
  insert into learning_report_events(report_id,event,version,actor_id) values(result,'GENERATED',1,auth.uid());
  return result;
end $$;
revoke all on function public.generate_learning_report(uuid,text,date,date) from public,anon,authenticated;
grant execute on function public.generate_learning_report(uuid,text,date,date) to authenticated;
