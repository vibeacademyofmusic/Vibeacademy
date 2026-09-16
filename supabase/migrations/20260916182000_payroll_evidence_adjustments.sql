alter table public.payroll_adjustments drop constraint payroll_adjustments_kind_check;
alter table public.payroll_adjustments drop constraint payroll_adjustments_check;
alter table public.payroll_adjustments add constraint payroll_adjustments_kind_check check(kind in ('BONUS','DEDUCTION','CORRECTION','TRAVEL_ALLOWANCE','ADJUSTMENT'));
alter table public.payroll_adjustments add constraint payroll_adjustments_sign_check check((kind in ('BONUS','TRAVEL_ALLOWANCE') and amount>0) or (kind='DEDUCTION' and amount<0) or kind in ('CORRECTION','ADJUSTMENT'));
alter table public.payroll_adjustments add column attendance_id uuid references public.employee_attendance_entries(id);
alter table public.payroll_adjustments add column trip_id uuid references public.employee_trips(id);
alter table public.payroll_adjustments add column source_snapshot jsonb;
alter table public.payroll_adjustments add column idempotency_key uuid;
create unique index payroll_adjustment_request_key on public.payroll_adjustments(created_by,idempotency_key) where idempotency_key is not null;
-- One late/early event cannot be deducted twice, including different revisions/periods.
create table hr_private.payroll_deducted_shifts(employee_id uuid references public.employees(id),work_date date,shift_code text,adjustment_id uuid unique references public.payroll_adjustments(id),primary key(employee_id,work_date,shift_code));
revoke all on hr_private.payroll_deducted_shifts from public,anon,authenticated,service_role;
create unique index payroll_trip_allowance_once on public.payroll_adjustments(trip_id) where kind='TRAVEL_ALLOWANCE';

create function public.add_payroll_evidence_adjustment(p_payroll uuid,p_kind text,p_amount numeric,p_reason text,p_attendance uuid,p_trip uuid,p_key uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare pay public.teacher_payrolls; period public.payroll_periods; a public.employee_attendance_entries; t public.employee_trips; result uuid; prior public.payroll_adjustments; source jsonb;
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized';end if;
 if p_key is null then raise exception 'Idempotency key required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select * into prior from public.payroll_adjustments where created_by=auth.uid() and idempotency_key=p_key;
 if found then
  if prior.payroll_id is distinct from p_payroll or prior.kind is distinct from p_kind or prior.amount is distinct from p_amount or prior.reason is distinct from btrim(p_reason) or prior.attendance_id is distinct from p_attendance or prior.trip_id is distinct from p_trip then raise exception 'Idempotency key already used';end if;
  return prior.id;
 end if;
 select * into pay from public.teacher_payrolls where id=p_payroll;
 select * into period from public.payroll_periods where id=pay.period_id for update;
 if period.id is null or period.status not in ('GENERATED','REVIEW') then raise exception 'Adjustment requires generated or review payroll';end if;
 if p_kind='DEDUCTION' then
  select * into a from public.employee_attendance_entries where id=p_attendance and employee_id=pay.employee_id and status in ('LATE','EARLY_LEAVE') and checker is not null and work_date between period.starts_on and period.ends_on;
  if not found then raise exception 'Deduction requires payable late or early evidence from this payroll';end if;
  if not exists(select 1 from public.payroll_earning_lines l cross join lateral jsonb_array_elements(coalesce(l.calculation_snapshot->'sources','[]'::jsonb)) x where l.payroll_id=pay.id and x->'attendance'->>'id'=a.id::text and (x->>'payable_minutes')::integer>0) then raise exception 'Deduction evidence must match generated payable snapshot';end if;
  if p_trip is not null then raise exception 'Unexpected trip evidence';end if;
  source:=to_jsonb(a);
 elsif p_kind='TRAVEL_ALLOWANCE' then
  select x.* into t from public.employee_trips x join public.employee_trip_reviews r on r.trip_id=x.id and r.decision='APPROVED' where x.id=p_trip and x.employee_id=pay.employee_id;
  if not found then raise exception 'Approved trip for payroll employee required';end if;
  if p_attendance is not null then raise exception 'Unexpected attendance evidence';end if;
  source:=to_jsonb(t);
 elsif p_kind in ('BONUS','ADJUSTMENT','CORRECTION') then
  if p_attendance is not null or p_trip is not null then raise exception 'Unexpected evidence';end if;
 else raise exception 'Invalid adjustment kind';end if;
 insert into public.payroll_adjustments(payroll_id,kind,amount,reason,created_by,attendance_id,trip_id,source_snapshot,idempotency_key)
 values(pay.id,p_kind,p_amount,btrim(p_reason),auth.uid(),p_attendance,p_trip,source,p_key) returning id into result;
 if p_kind='DEDUCTION' then insert into hr_private.payroll_deducted_shifts values(pay.employee_id,a.work_date,a.shift_code,result);end if;
 update public.teacher_payrolls set adjustment_amount=adjustment_amount+p_amount,gross_amount=gross_amount+p_amount where id=pay.id;
 update public.payroll_periods set version=version+1 where id=period.id;
 insert into public.payroll_events(period_id,status,note,actor_id,event_type,after_snapshot) values(period.id,period.status,btrim(p_reason),auth.uid(),'EVIDENCE_ADJUSTMENT',jsonb_build_object('adjustment_id',result,'source',source));
 return result;
end$$;
-- Preserve teacher compatibility but require evidence on the new employee path.
create or replace function public.add_payroll_adjustment(p_payroll uuid,p_kind text,p_amount numeric,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare pid uuid; state text;
begin
 if not coalesce(has_role('SUPER_ADMIN'),false) then raise exception 'Unauthorized'; end if;
 if p_kind='TRAVEL_ALLOWANCE' or (p_kind='DEDUCTION' and exists(select 1 from public.teacher_payrolls where id=p_payroll and employee_id is not null)) then raise exception 'Use evidence-linked adjustment';end if;
 select period_id into pid from teacher_payrolls where id=p_payroll;
 select status into state from payroll_periods where id=pid for update;
 if state is null or state not in ('GENERATED','REVIEW') then raise exception 'Adjustment requires generated or review payroll'; end if;
 insert into payroll_adjustments(payroll_id,kind,amount,reason,created_by) values(p_payroll,p_kind,p_amount,btrim(p_reason),auth.uid());
 update teacher_payrolls set adjustment_amount=adjustment_amount+p_amount,gross_amount=gross_amount+p_amount where id=p_payroll;
 update payroll_periods set version=version+1 where id=pid;
 insert into payroll_events(period_id,status,note,actor_id) values(pid,state,'Adjustment: '||btrim(p_reason),auth.uid());
end$$;
revoke all on function public.add_payroll_evidence_adjustment(uuid,text,numeric,text,uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.add_payroll_evidence_adjustment(uuid,text,numeric,text,uuid,uuid,uuid) to authenticated;

insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code='STAFF' and p.code='payroll.view_own' on conflict do nothing;
create function public.can_read_employee_payroll(p_employee uuid,p_branch uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_permission('payroll.view_own',p_branch) and exists(select 1 from public.employees e cross join lateral hr_private.employee_at(e.id,(now() at time zone 'Asia/Ho_Chi_Minh')::date) v where e.id=p_employee and e.profile_id=auth.uid() and v.employment_status='ACTIVE')
$$;
create policy employee_payroll_self on public.teacher_payrolls for select to authenticated using(public.can_read_employee_payroll(employee_id,branch_id) and exists(select 1 from public.payroll_periods p where p.id=period_id and p.status in ('APPROVED','FINALIZED')));
create or replace function public.can_read_payroll_period(p_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or exists(select 1 from public.payroll_periods p where p.id=p_id and (public.has_role_permission('FINANCE','payroll.view',p.branch_id) or (p.status in ('APPROVED','FINALIZED') and exists(select 1 from public.teacher_payrolls r where r.period_id=p.id and (public.can_read_own_payroll(r.teacher_id,p.branch_id) or public.can_read_employee_payroll(r.employee_id,p.branch_id))))))
$$;
revoke all on function public.can_read_employee_payroll(uuid,uuid) from public,anon,service_role;
grant execute on function public.can_read_employee_payroll(uuid,uuid) to authenticated;
