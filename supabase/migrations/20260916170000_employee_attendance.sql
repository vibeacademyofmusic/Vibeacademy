-- Employee attendance evidence is separate from student attendance and salary calculation.
create table public.employee_trips (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id),
 origin_unit text not null references public.organization_units(code), destination_unit text not null references public.organization_units(code),
 destination_branch_id uuid not null references public.branches(id), starts_on date not null, ends_on date not null,
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 maker uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check(starts_on<=ends_on),check(origin_unit<>destination_unit)
);
create table public.employee_trip_reviews (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null unique references public.employee_trips(id),
 decision text not null check(decision in ('APPROVED','REJECTED')), reason text not null check(length(btrim(reason)) between 1 and 2000),
 checker uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create index employee_trips_dates on public.employee_trips(employee_id,starts_on,ends_on);
create table public.employee_attendance_entries (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), work_date date not null,
 shift_code text not null check(shift_code in ('AM','PM')), revision integer not null check(revision>0),
 status text not null check(status in ('WORKED','SCHEDULED_OFF','PAID_LEAVE','UNPAID_LEAVE','UNAUTHORIZED_ABSENCE','BUSINESS_TRIP','LATE','EARLY_LEAVE')),
 entry_kind text not null check(entry_kind in ('INITIAL','MANUAL_CORRECTION')),
 schedule_snapshot jsonb not null, arrived_at timestamptz, departed_at timestamptz,
 late_minutes integer not null default 0 check(late_minutes>=0), early_minutes integer not null default 0 check(early_minutes>=0),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 actor uuid not null references public.profiles(id), checker uuid references public.profiles(id),
 created_at timestamptz not null default now(), previous_entry_id uuid references public.employee_attendance_entries(id),
 unique(employee_id,work_date,shift_code,revision),
 check((revision=1 and entry_kind='INITIAL' and previous_entry_id is null) or (revision>1 and entry_kind='MANUAL_CORRECTION' and previous_entry_id is not null and checker is not null and checker<>actor))
);
create index employee_attendance_month on public.employee_attendance_entries(work_date,employee_id,shift_code,revision desc);
create table public.employee_time_events (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id),
 event_type text not null check(event_type in ('CHECK_IN','CHECK_OUT')), captured_at timestamptz not null,
 source text not null, device_reference text, raw_event_reference text not null,
 created_at timestamptz not null default now(), unique(source,raw_event_reference)
);
-- No ingestion grant/RPC until a trusted device integration is approved.
create index employee_time_events_date on public.employee_time_events(employee_id,captured_at);

create function hr_private.employee_at(p_employee uuid,p_date date) returns public.employee_versions language sql stable set search_path=public,pg_temp as $$
 select v from public.employee_versions v where employee_id=p_employee and effective_on<=p_date order by effective_on desc,version desc limit 1
$$;

create function public.employee_schedule(p_employee uuid,p_from date,p_to date)
returns table(work_date date,shift_code text,unit_code text,employment_version integer,starts_at timestamptz,ends_at timestamptz,scheduled_minutes integer,schedule_state text,trip_id uuid)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare d date; v public.employee_versions; t public.employee_trips; dow integer; snapshot jsonb;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Employee attendance denied'; end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from or p_to-p_from>62 then raise exception 'Schedule range must be at most 63 days'; end if;
 if not exists(select 1 from public.employees where id=p_employee) then raise exception 'Employee not found'; end if;
 for d in select generate_series(p_from::timestamp,p_to::timestamp,interval '1 day')::date loop
  -- Recorded shifts retain their original assignment/schedule even after a later HR change.
  for snapshot in select a.schedule_snapshot from (select distinct on(a.shift_code) a.shift_code,a.schedule_snapshot from public.employee_attendance_entries a where a.employee_id=p_employee and a.work_date=d order by a.shift_code,a.revision desc) a loop
   work_date:=d;shift_code:=snapshot->>'shift_code';unit_code:=snapshot->>'unit_code';employment_version:=(snapshot->>'employment_version')::integer;
   starts_at:=(snapshot->>'starts_at')::timestamptz;ends_at:=(snapshot->>'ends_at')::timestamptz;scheduled_minutes:=(snapshot->>'scheduled_minutes')::integer;schedule_state:=snapshot->>'schedule_state';trip_id:=(snapshot->>'trip_id')::uuid;return next;
  end loop;
  v:=hr_private.employee_at(p_employee,d);
  if v.id is null or v.employment_status<>'ACTIVE' or v.pay_type<>'MONTHLY' then continue; end if;
  select tr.* into t from public.employee_trips tr join public.employee_trip_reviews r on r.trip_id=tr.id and r.decision='APPROVED' where tr.employee_id=p_employee and d between tr.starts_on and tr.ends_on;
  dow:=extract(isodow from d); work_date:=d; unit_code:=v.unit_code; employment_version:=v.version; trip_id:=t.id;
  if dow=6 and not exists(select 1 from public.employee_attendance_entries a where a.employee_id=p_employee and a.work_date=d and a.shift_code='AM') then
   shift_code:='AM';starts_at:=(d+time '08:00') at time zone 'Asia/Ho_Chi_Minh';ends_at:=(d+time '11:00') at time zone 'Asia/Ho_Chi_Minh';scheduled_minutes:=180;schedule_state:=case when t.id is null then 'SCHEDULED' else 'BUSINESS_TRIP' end;return next;
  end if;
  if exists(select 1 from public.employee_attendance_entries a where a.employee_id=p_employee and a.work_date=d and a.shift_code='PM') then continue;end if;
  shift_code:='PM';starts_at:=(d+time '14:00') at time zone 'Asia/Ho_Chi_Minh';ends_at:=(d+time '21:00') at time zone 'Asia/Ho_Chi_Minh';scheduled_minutes:=420;
  schedule_state:=case when dow=7 and v.unit_code in ('ST','LX') then 'SCHEDULED_OFF' when t.id is not null then 'BUSINESS_TRIP' else 'SCHEDULED' end;
  if dow=7 and v.unit_code='HQ' and t.id is not null and t.origin_unit='HQ' and t.destination_unit in ('ST','LX') then ends_at:=(d+time '18:00') at time zone 'Asia/Ho_Chi_Minh';scheduled_minutes:=240;end if;
  if schedule_state='SCHEDULED_OFF' then scheduled_minutes:=0;end if;
  return next;
 end loop;end$$;

create function public.request_employee_trip(p_employee uuid,p_destination text,p_branch uuid,p_from date,p_to date,p_reason text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare v public.employee_versions; result uuid;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Employee attendance denied'; end if;
 perform 1 from public.employees where id=p_employee for update;
 if not found then raise exception 'Employee not found';end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from or p_to-p_from>62 then raise exception 'Invalid trip date range';end if;
 v:=hr_private.employee_at(p_employee,p_from);
 if v.id is null or v.employment_status<>'ACTIVE' then raise exception 'Active employment required';end if;
 if not exists(select 1 from public.organization_units u join public.branches b on b.id=u.branch_id where u.code=p_destination and b.id=p_branch and b.status='ACTIVE') then raise exception 'Explicit active destination branch mapping required';end if;
 if exists(select 1 from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d cross join lateral hr_private.employee_at(p_employee,d::date) e where e.employment_status is distinct from 'ACTIVE' or e.unit_code is distinct from v.unit_code) then raise exception 'Trip cannot cross employment assignment change';end if;
 insert into public.employee_trips(employee_id,origin_unit,destination_unit,destination_branch_id,starts_on,ends_on,reason,maker) values(p_employee,v.unit_code,p_destination,p_branch,p_from,p_to,btrim(p_reason),auth.uid()) returning id into result;
 return result;end$$;

create function public.review_employee_trip(p_trip uuid,p_decision text,p_reason text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare t public.employee_trips;result uuid;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Employee attendance denied';end if;
 select * into t from public.employee_trips where id=p_trip;
 if not found then raise exception 'Trip not found';end if;
 perform 1 from public.employees where id=t.employee_id for update;
 if t.maker=auth.uid() then raise exception 'Independent trip reviewer required';end if;
 select id into result from public.employee_trip_reviews where trip_id=t.id;
 if found then return result;end if;
 if p_decision='APPROVED' then
  if not exists(select 1 from public.organization_units u join public.branches b on b.id=u.branch_id where u.code=t.destination_unit and b.id=t.destination_branch_id and b.status='ACTIVE') then raise exception 'Destination mapping changed; request a new trip';end if;
  if exists(select 1 from public.employee_trips x join public.employee_trip_reviews r on r.trip_id=x.id and r.decision='APPROVED' where x.employee_id=t.employee_id and x.starts_on<=t.ends_on and x.ends_on>=t.starts_on) then raise exception 'Overlapping approved trip';end if;
  if exists(select 1 from public.employee_attendance_entries where employee_id=t.employee_id and work_date between t.starts_on and t.ends_on) then raise exception 'Attendance already recorded; review before changing schedule';end if;
  if exists(select 1 from generate_series(t.starts_on::timestamp,t.ends_on::timestamp,interval '1 day') d cross join lateral hr_private.employee_at(t.employee_id,d::date) e where e.employment_status is distinct from 'ACTIVE' or e.unit_code is distinct from t.origin_unit) then raise exception 'Employment changed; request a new trip';end if;
 end if;
 insert into public.employee_trip_reviews(trip_id,decision,reason,checker) values(t.id,p_decision,btrim(p_reason),auth.uid()) returning id into result;return result;end$$;

do $$declare t text;begin
 foreach t in array array['employee_trips','employee_trip_reviews','employee_attendance_entries','employee_time_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('create policy hr_admin_read on public.%I for select to authenticated using(public.has_role(''SUPER_ADMIN''))',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create trigger hr_history_immutable before update or delete on public.%I for each row execute function hr_private.immutable()',t);
 end loop;
end$$;
revoke all on function hr_private.employee_at(uuid,date) from public,anon,authenticated,service_role;
revoke all on function public.employee_schedule(uuid,date,date),public.request_employee_trip(uuid,text,uuid,date,date,text),public.review_employee_trip(uuid,text,text) from public,anon,service_role;
grant execute on function public.employee_schedule(uuid,date,date),public.request_employee_trip(uuid,text,uuid,date,date,text),public.review_employee_trip(uuid,text,text) to authenticated;
-- Explicit quota windows; minutes measure leave evidence, not salary fractions.
create table public.employee_leave_policies (
 id uuid primary key default gen_random_uuid(), unit_code text not null references public.organization_units(code),
 employee_group text, employee_id uuid references public.employees(id), starts_on date not null, ends_on date not null,
 paid_minutes integer not null check(paid_minutes>=0), reason text not null check(length(btrim(reason)) between 1 and 2000),
 actor uuid not null references public.profiles(id), created_at timestamptz not null default now(), check(starts_on<=ends_on)
);
create index employee_leave_policy_scope on public.employee_leave_policies(unit_code,employee_id,employee_group,starts_on,ends_on);
create table public.employee_attendance_requests (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), work_date date not null, shift_code text not null,
 expected_revision integer not null check(expected_revision>=0), proposed_status text not null check(proposed_status in ('WORKED','SCHEDULED_OFF','PAID_LEAVE','UNPAID_LEAVE','UNAUTHORIZED_ABSENCE','BUSINESS_TRIP','LATE','EARLY_LEAVE')),
 arrived_at timestamptz,departed_at timestamptz, reason text not null check(length(btrim(reason)) between 1 and 2000),
 schedule_snapshot jsonb not null, maker uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 idempotency_key uuid not null unique
);
create table public.employee_attendance_reviews (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique references public.employee_attendance_requests(id),
 decision text not null check(decision in ('APPROVED','REJECTED')),reason text not null check(length(btrim(reason)) between 1 and 2000),
 checker uuid not null references public.profiles(id),created_at timestamptz not null default now(),entry_id uuid references public.employee_attendance_entries(id)
);
alter table public.employee_attendance_entries add column request_id uuid unique references public.employee_attendance_requests(id),
 add column leave_policy_id uuid references public.employee_leave_policies(id), add column paid_leave_minutes integer not null default 0 check(paid_leave_minutes>=0),
 add column unpaid_leave_minutes integer not null default 0 check(unpaid_leave_minutes>=0);
create index employee_attendance_requests_date on public.employee_attendance_requests(employee_id,work_date,shift_code);

create function public.configure_employee_leave(p_unit text,p_group text,p_employee uuid,p_from date,p_to date,p_minutes integer,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$declare result uuid;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Employee attendance denied';end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from then raise exception 'Invalid policy window';end if;
 perform pg_advisory_xact_lock(hashtextextended('employee_leave_policy',0));
 if exists(select 1 from public.employee_leave_policies where unit_code=p_unit and employee_group is not distinct from nullif(btrim(p_group),'') and employee_id is not distinct from p_employee and starts_on<=p_to and ends_on>=p_from) then raise exception 'Overlapping leave policy; use a new non-overlapping effective window';end if;
 insert into public.employee_leave_policies(unit_code,employee_group,employee_id,starts_on,ends_on,paid_minutes,reason,actor)
 values(p_unit,nullif(btrim(p_group),''),p_employee,p_from,p_to,p_minutes,btrim(p_reason),auth.uid()) returning id into result;return result;end$$;

create function public.request_employee_attendance(p_employee uuid,p_date date,p_shift text,p_revision integer,p_status text,p_arrived timestamptz,p_departed timestamptz,p_reason text,p_key uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$declare s jsonb;latest public.employee_attendance_entries;result uuid;existing public.employee_attendance_requests;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Employee attendance denied';end if;
 perform 1 from public.employees where id=p_employee for update;if not found then raise exception 'Employee not found';end if;
 select * into existing from public.employee_attendance_requests where idempotency_key=p_key;
 if found then
  if existing.employee_id=p_employee and existing.work_date=p_date and existing.shift_code=p_shift and existing.expected_revision=p_revision and existing.proposed_status=p_status and existing.arrived_at is not distinct from p_arrived and existing.departed_at is not distinct from p_departed and existing.reason=btrim(p_reason) and existing.maker=auth.uid() then return existing.id;end if;
  raise exception 'Idempotency key payload mismatch';
 end if;
 if p_date>(now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Future attendance is not evidence';end if;
 select * into latest from public.employee_attendance_entries where employee_id=p_employee and work_date=p_date and shift_code=p_shift order by revision desc limit 1;
 if p_revision is distinct from coalesce(latest.revision,0) then raise exception 'Attendance changed; reload';end if;
 select to_jsonb(x) into s from public.employee_schedule(p_employee,p_date,p_date) x where x.shift_code=p_shift;
 if s is null then raise exception 'No active monthly employee shift';end if;
 if latest.id is not null then s:=latest.schedule_snapshot;end if;
 if s->>'schedule_state'='SCHEDULED_OFF' and p_status<>'SCHEDULED_OFF' then raise exception 'Scheduled rest cannot become absence or leave';end if;
 if p_status='SCHEDULED_OFF' and s->>'schedule_state'<>'SCHEDULED_OFF' then raise exception 'Scheduled rest requires schedule evidence';end if;
 if p_status='BUSINESS_TRIP' and s->>'trip_id' is null then raise exception 'Approved trip required';end if;
 if p_arrived is not null and ((p_arrived at time zone 'Asia/Ho_Chi_Minh')::date<>p_date or p_arrived>now()) then raise exception 'Invalid arrival evidence';end if;
 if p_departed is not null and ((p_departed at time zone 'Asia/Ho_Chi_Minh')::date<>p_date or p_departed>now() or p_arrived is null or p_departed<p_arrived) then raise exception 'Invalid departure evidence';end if;
 if p_status='LATE' and (p_arrived is null or p_arrived<=(s->>'starts_at')::timestamptz) then raise exception 'Late arrival evidence required';end if;
 if p_status='EARLY_LEAVE' and (p_departed is null or p_departed>=(s->>'ends_at')::timestamptz) then raise exception 'Early departure evidence required';end if;
 insert into public.employee_attendance_requests(employee_id,work_date,shift_code,expected_revision,proposed_status,arrived_at,departed_at,reason,schedule_snapshot,maker,idempotency_key)
 values(p_employee,p_date,p_shift,p_revision,p_status,p_arrived,p_departed,btrim(p_reason),s,auth.uid(),p_key) returning id into result;return result;end$$;

create function public.review_employee_attendance(p_request uuid,p_decision text,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.employee_attendance_requests;old public.employee_attendance_entries;policy public.employee_leave_policies;e public.employee_versions;used integer;paid integer:=0;unpaid integer:=0;mins integer;eid uuid;result uuid;current_schedule jsonb;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Employee attendance denied';end if;
 select * into r from public.employee_attendance_requests where id=p_request;if not found then raise exception 'Request not found';end if;
 perform 1 from public.employees where id=r.employee_id for update;
 if r.maker=auth.uid() then raise exception 'Independent attendance reviewer required';end if;
 select id into result from public.employee_attendance_reviews where request_id=r.id;if found then return result;end if;
 if p_decision='APPROVED' then
  select * into old from public.employee_attendance_entries where employee_id=r.employee_id and work_date=r.work_date and shift_code=r.shift_code order by revision desc limit 1;
  if r.expected_revision<>coalesce(old.revision,0) then raise exception 'Attendance changed; request again';end if;
  if old.id is null then
   select to_jsonb(x) into current_schedule from public.employee_schedule(r.employee_id,r.work_date,r.work_date) x where x.shift_code=r.shift_code;
   if current_schedule is distinct from r.schedule_snapshot then raise exception 'Schedule changed; request again';end if;
  end if;
  mins:=(r.schedule_snapshot->>'scheduled_minutes')::integer;
  if r.proposed_status='PAID_LEAVE' then
   select * into e from public.employee_versions where employee_id=r.employee_id and version=(r.schedule_snapshot->>'employment_version')::integer;
   select * into policy from public.employee_leave_policies where unit_code=r.schedule_snapshot->>'unit_code' and (employee_id is null or employee_id=r.employee_id) and (employee_group is null or employee_group=e.employee_group) and r.work_date between starts_on and ends_on order by (employee_id is not null) desc,(employee_group is not null) desc limit 1;
   if policy.id is null then raise exception 'Configure approved leave quota before paid leave';end if;
   select coalesce(sum(a.paid_leave_minutes),0) into used from (select distinct on(employee_id,work_date,shift_code) * from public.employee_attendance_entries where employee_id=r.employee_id order by employee_id,work_date,shift_code,revision desc) a where a.leave_policy_id=policy.id and a.id is distinct from old.id;
   paid:=least(mins,greatest(0,policy.paid_minutes-used));unpaid:=mins-paid;
  elsif r.proposed_status='UNPAID_LEAVE' then unpaid:=mins;end if;
  insert into public.employee_attendance_entries(employee_id,work_date,shift_code,revision,status,entry_kind,schedule_snapshot,arrived_at,departed_at,late_minutes,early_minutes,reason,actor,checker,previous_entry_id,request_id,leave_policy_id,paid_leave_minutes,unpaid_leave_minutes)
  values(r.employee_id,r.work_date,r.shift_code,r.expected_revision+1,r.proposed_status,case when old.id is null then 'INITIAL' else 'MANUAL_CORRECTION' end,r.schedule_snapshot,r.arrived_at,r.departed_at,
   greatest(0,ceil(extract(epoch from(r.arrived_at-(r.schedule_snapshot->>'starts_at')::timestamptz))/60))::integer,
   greatest(0,ceil(extract(epoch from((r.schedule_snapshot->>'ends_at')::timestamptz-r.departed_at))/60))::integer,
   r.reason,r.maker,auth.uid(),old.id,r.id,policy.id,paid,unpaid) returning id into eid;
 end if;
 insert into public.employee_attendance_reviews(request_id,decision,reason,checker,entry_id) values(r.id,p_decision,btrim(p_reason),auth.uid(),eid) returning id into result;return result;end$$;

create view public.employee_attendance_current with(security_invoker=true) as
 select distinct on(employee_id,work_date,shift_code) * from public.employee_attendance_entries order by employee_id,work_date,shift_code,revision desc;
revoke all on public.employee_attendance_current from public,anon,service_role;
grant select on public.employee_attendance_current to authenticated;
do $$declare t text;begin
 foreach t in array array['employee_leave_policies','employee_attendance_requests','employee_attendance_reviews'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('create policy hr_admin_read on public.%I for select to authenticated using(public.has_role(''SUPER_ADMIN''))',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create trigger hr_history_immutable before update or delete on public.%I for each row execute function hr_private.immutable()',t);
 end loop;
end$$;
revoke all on function public.configure_employee_leave(text,text,uuid,date,date,integer,text),public.request_employee_attendance(uuid,date,text,integer,text,timestamptz,timestamptz,text,uuid),public.review_employee_attendance(uuid,text,text) from public,anon,service_role;
grant execute on function public.configure_employee_leave(text,text,uuid,date,date,integer,text),public.request_employee_attendance(uuid,date,text,integer,text,timestamptz,timestamptz,text,uuid),public.review_employee_attendance(uuid,text,text) to authenticated;
