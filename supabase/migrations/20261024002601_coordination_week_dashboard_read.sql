-- Read-only, one statement snapshot. Never materializes sessions or attendance.
-- The private definer calls the existing relationship guards before exposing data.
begin;
create schema if not exists schedule_dashboard_private;
revoke all on schema schedule_dashboard_private from public, anon;
grant usage on schema schedule_dashboard_private to authenticated;

create function schedule_dashboard_private.week(p_date date, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare monday date; result jsonb;
begin
  if auth.uid() is null or not coalesce(public.account_is_active(), false)
    or not coalesce(public.student_ops_may_enter(), false) then
    raise exception 'CALENDAR_UNAUTHORIZED';
  end if;
  if p_date is null or p_date < date '2000-01-01' or p_date > date '2100-12-31' then
    raise exception 'CALENDAR_DATE_INVALID';
  end if;
  monday := p_date - (extract(isodow from p_date)::integer - 1);
  with visible_classes as materialized (
    select c.*, b.name branch_name, coalesce(cur.name, course.name, 'Chưa có bộ môn') program_name
    from public.classes c join public.branches b on b.id=c.branch_id
    left join public.curriculums cur on cur.id=c.curriculum_id
    left join public.courses course on course.id=c.course_id
    where coalesce(public.can_access_class(c.id), false)
      and coalesce(public.registration_can('student_placement.view', c.branch_id), false)
  ), scoped as materialized (
    select * from visible_classes where p_branch is null or branch_id=p_branch
  ), projected as (
    select 'plan:'||s.id||':'||d.day::date id, null::uuid session_id, s.id schedule_id,
      c.id class_id, d.day::date roster_date,
      (d.day::date+s.start_time) at time zone s.timezone starts_at,
      (d.day::date+s.end_time) at time zone s.timezone ends_at,
      s.room_id, t.teacher_id, 'PRIMARY'::text assignment_type,
      'PLANNED'::text status, 'REGULAR'::text occurrence_type, null::timestamptz original_starts_at
    from public.schedules s join scoped c on c.id=s.class_id
    cross join lateral generate_series((monday-1)::timestamp,(monday+7)::timestamp,interval '1 day') d(day)
    left join lateral (
      select (array_agg(ct.teacher_id))[1] teacher_id from public.class_teachers ct
      where ct.class_id=c.id and ct.teacher_role='PRIMARY' and (ct.is_active or ct.ended_at is not null)
        and ct.assigned_at<=d.day::date and (ct.ended_at is null or ct.ended_at>=d.day::date)
      having count(*)=1
    ) t on true
    where s.status='ACTIVE' and c.status='ACTIVE' and extract(isodow from d.day)=s.day_of_week
      and d.day::date>=s.effective_from and (s.effective_to is null or d.day::date<=s.effective_to)
      and (c.start_date is null or d.day::date>=c.start_date) and (c.end_date is null or d.day::date<=c.end_date)
      -- Suppress the old slot even if its occurrence moved outside this week or was cancelled.
      and not exists(select 1 from public.session_occurrences o where o.schedule_id=s.id
        and o.occurrence_type='REGULAR'
        and coalesce((o.original_starts_at at time zone s.timezone)::date,o.occurrence_date)=d.day::date)
  ), actual as (
    select o.id::text id, o.id session_id, o.schedule_id, c.id class_id, o.occurrence_date roster_date,
      o.starts_at,o.ends_at,o.room_id,v.teacher_id,v.assignment_type,o.status,o.occurrence_type,o.original_starts_at
    from public.session_occurrences o join public.schedules s on s.id=o.schedule_id
    join scoped c on c.id=s.class_id
    left join public.session_actual_teachers v on v.session_id=o.id
    where coalesce(public.can_access_session(o.id),false)
      and o.starts_at < (monday+7)::timestamp at time zone 'Asia/Ho_Chi_Minh'
      and o.starts_at >= monday::timestamp at time zone 'Asia/Ho_Chi_Minh'
  ), slots as materialized (
    select * from actual union all select * from projected
    where starts_at >= monday::timestamp at time zone 'Asia/Ho_Chi_Minh'
      and starts_at < (monday+7)::timestamp at time zone 'Asia/Ho_Chi_Minh'
  ), rows as (
    select slot.*,c.name class_name,c.code class_code,c.branch_id,c.branch_name,
      c.curriculum_id,c.program_name,c.capacity class_capacity,r.capacity room_capacity,r.name room_name,
      t.full_name teacher_name,
      -- Actual roster uses the same dated helper as attendance, including makeup bookings.
      coalesce((select jsonb_agg(jsonb_build_object('enrollment_id',roster.enrollment_id,
        'student_id',roster.student_id,'name',coalesce(st.full_name,st.student_code),
        'attendance',a.status) order by st.full_name,roster.enrollment_id)
        from (
          select rr.enrollment_id,rr.student_id from public.session_teaching_roster(slot.session_id) rr
          where slot.session_id is not null
          union all
          select e.id,e.student_id from public.enrollments e
          where slot.session_id is null and e.class_id=slot.class_id and e.started_at<=slot.roster_date
            and (e.ended_at is null or e.ended_at>=slot.roster_date)
            and not public.is_enrollment_paused_on(e.id,slot.roster_date)
        ) roster join public.students st on st.id=roster.student_id
        left join public.attendance_records a on a.session_occurrence_id=slot.session_id and a.enrollment_id=roster.enrollment_id
      ),'[]'::jsonb) roster
    from slots slot join scoped c on c.id=slot.class_id
    left join public.rooms r on r.id=slot.room_id
    left join public.teachers t on t.id=slot.teacher_id
  )
  select jsonb_build_object('version',1,'monday',monday,'snapshot_at',statement_timestamp(),
    'branches',coalesce((select jsonb_agg(x order by x.name) from
      (select distinct branch_id id,branch_name name from visible_classes) x),'[]'::jsonb),
    'rows',coalesce((select jsonb_agg(to_jsonb(rows) order by starts_at,branch_name,class_code,id) from rows),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function schedule_dashboard_private.week(date,uuid) from public,anon,authenticated,service_role;
grant execute on function schedule_dashboard_private.week(date,uuid) to authenticated;

create function public.coordination_week_dashboard(p_date date,p_branch uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select schedule_dashboard_private.week(p_date,p_branch)
$$;
revoke all on function public.coordination_week_dashboard(date,uuid) from public,anon,authenticated,service_role;
grant execute on function public.coordination_week_dashboard(date,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
