-- Master plan 7.8: allowance, transport, lodging and payroll linkage.
-- Uses the existing adjustment and maker-checker workflow; no cash payout.
create table public.payroll_trip_cost_breakdowns (
 adjustment_id uuid primary key references public.payroll_adjustments(id),
 allowance numeric(16,2) not null check(allowance>=0 and allowance<>'NaN'::numeric),
 transport numeric(16,2) not null check(transport>=0 and transport<>'NaN'::numeric),
 lodging numeric(16,2) not null check(lodging>=0 and lodging<>'NaN'::numeric)
);
alter table public.payroll_trip_cost_breakdowns enable row level security;
revoke all on public.payroll_trip_cost_breakdowns from public,anon,authenticated,service_role;
grant select on public.payroll_trip_cost_breakdowns to authenticated;
create policy trip_cost_read on public.payroll_trip_cost_breakdowns for select to authenticated using(
 public.account_is_active() and exists(
  select 1 from public.payroll_adjustments a
  join public.teacher_payrolls t on t.id=a.payroll_id
  join public.payroll_periods p on p.id=t.period_id
  where a.id=adjustment_id and (
   public.has_role('SUPER_ADMIN')
   or public.has_role_permission('FINANCE','payroll.view',t.branch_id)
   or (p.status in ('APPROVED','FINALIZED') and (
    public.can_read_employee_payroll(t.employee_id,t.branch_id)
    or public.can_read_own_payroll(t.teacher_id,t.branch_id)))
  )
 )
);
create trigger trip_cost_immutable before update or delete on public.payroll_trip_cost_breakdowns for each row execute function hr_private.immutable();
create function public.add_payroll_trip_costs(p_payroll uuid,p_trip uuid,p_allowance numeric,p_transport numeric,p_lodging numeric,p_reason text,p_key uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid; prior public.payroll_trip_cost_breakdowns; state text;
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized';end if;
 if p_allowance is null or p_transport is null or p_lodging is null or least(p_allowance,p_transport,p_lodging)<0 or p_allowance<>round(p_allowance,2) or p_transport<>round(p_transport,2) or p_lodging<>round(p_lodging,2) then raise exception 'Invalid trip cost breakdown';end if;
 result:=public.add_payroll_evidence_adjustment(p_payroll,'TRAVEL_ALLOWANCE',p_allowance+p_transport+p_lodging,p_reason,null,p_trip,p_key);
 select * into prior from public.payroll_trip_cost_breakdowns where adjustment_id=result;
 if found then
  if prior.allowance<>p_allowance or prior.transport<>p_transport or prior.lodging<>p_lodging then raise exception 'Idempotency key already used';end if;
  return result;
 end if;
 select p.status into state from public.payroll_periods p join public.teacher_payrolls t on t.period_id=p.id where t.id=p_payroll for update of p;
 if state is null or state not in ('GENERATED','REVIEW') then raise exception 'Approved payroll is immutable';end if;
 insert into public.payroll_trip_cost_breakdowns values(result,p_allowance,p_transport,p_lodging);
 return result;
end$$;
revoke all on function public.add_payroll_trip_costs(uuid,uuid,numeric,numeric,numeric,text,uuid) from public,anon,service_role;
grant execute on function public.add_payroll_trip_costs(uuid,uuid,numeric,numeric,numeric,text,uuid) to authenticated;
create function hr_private.guard_trip_cost_insert() returns trigger language plpgsql set search_path=public,pg_temp as $$declare a public.payroll_adjustments; state text;begin
 select * into a from public.payroll_adjustments where id=new.adjustment_id;
 select p.status into state from public.payroll_periods p join public.teacher_payrolls t on t.period_id=p.id where t.id=a.payroll_id for update of p;
 if state is null or state not in ('GENERATED','REVIEW') then raise exception 'Approved payroll is immutable';end if;
 if a.kind<>'TRAVEL_ALLOWANCE' or a.trip_id is null or a.amount<>new.allowance+new.transport+new.lodging then raise exception 'Trip cost breakdown must reconcile to approved-trip adjustment';end if;
 return new;
end$$;
create trigger trip_cost_insert_guard before insert on public.payroll_trip_cost_breakdowns for each row execute function hr_private.guard_trip_cost_insert();
revoke all on function hr_private.guard_trip_cost_insert() from public,anon,authenticated,service_role;
