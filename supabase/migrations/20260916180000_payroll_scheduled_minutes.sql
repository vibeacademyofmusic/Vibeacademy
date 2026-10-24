-- Owner decision: minutes are work units; late/early never implicitly reduce pay.
-- Private calculation boundary reused by payroll generation. No financial writes.
create function hr_private.monthly_payroll_evidence(p_employee uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s record; a public.employee_attendance_entries; required_minutes integer:=0;
 payable_minutes integer:=0; shift_payable integer; sources jsonb:='[]'::jsonb;
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Payroll preparation denied'; end if;
 for s in select * from public.employee_schedule(p_employee,p_from,p_to) order by work_date,shift_code loop
  select * into a from public.employee_attendance_entries e
   where e.employee_id=p_employee and e.work_date=s.work_date and e.shift_code=s.shift_code
   order by e.revision desc limit 1;
  shift_payable:=0;
  if s.scheduled_minutes>0 then
   if a.id is null or a.checker is null then raise exception 'Approved attendance required for every required shift'; end if;
   if a.status in ('WORKED','BUSINESS_TRIP','LATE','EARLY_LEAVE') then shift_payable:=s.scheduled_minutes;
   elsif a.status='PAID_LEAVE' then
    if a.leave_policy_id is null or a.paid_leave_minutes+a.unpaid_leave_minutes<>s.scheduled_minutes then
     raise exception 'Paid leave evidence does not reconcile'; end if;
    shift_payable:=a.paid_leave_minutes;
   elsif a.status not in ('UNPAID_LEAVE','UNAUTHORIZED_ABSENCE') then
    raise exception 'Attendance conflicts with required schedule';
   end if;
  elsif a.id is not null and a.status<>'SCHEDULED_OFF' then
   raise exception 'Attendance conflicts with scheduled rest';
  end if;
  required_minutes:=required_minutes+s.scheduled_minutes;
  payable_minutes:=payable_minutes+shift_payable;
  sources:=sources||jsonb_build_array(jsonb_build_object('schedule',to_jsonb(s),
   'attendance',case when a.id is not null then to_jsonb(a) else null end,
   'payable_minutes',shift_payable));
 end loop;
 if required_minutes=0 then raise exception 'No required minutes; manual payroll review required'; end if;
 if payable_minutes<0 or payable_minutes>required_minutes then raise exception 'Payroll minutes do not reconcile'; end if;
 return jsonb_build_object('calculation_version','SCHEDULED_MINUTES_V1','employee_id',p_employee,
  'starts_on',p_from,'ends_on',p_to,'required_minutes',required_minutes,'payable_minutes',payable_minutes,
  'unpaid_minutes',required_minutes-payable_minutes,'late_early_policy','RECORD_ONLY',
  'sources',sources);
end$$;
revoke all on function hr_private.monthly_payroll_evidence(uuid,date,date) from public,anon,authenticated,service_role;
