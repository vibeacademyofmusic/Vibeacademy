-- Operational metadata only. Existing rate resolvers and financial engines remain canonical.
alter table public.teacher_compensation_rules add column reason text
 check (reason is null or char_length(btrim(reason)) between 1 and 2000);

create function public.configure_employee_compensation(
 p_employee uuid,p_branch uuid,p_type text,p_rate numeric,p_currency text,
 p_from date,p_to date,p_class_type text,p_reason text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid; teacher uuid;
begin
 if not coalesce(public.has_role('SUPER_ADMIN'),false) then raise exception 'Unauthorized';end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'Compensation reason required';end if;
 select teacher_id into teacher from public.employees where id=p_employee;
 if not found then raise exception 'Employee not found';end if;
 if p_type='MONTHLY' then
  result:=public.add_employee_compensation_rule(p_employee,p_branch,p_rate,p_currency,p_from,p_to);
 elsif p_type='PER_SESSION' and teacher is not null then
  result:=public.add_session_compensation_rule(teacher,p_branch,p_class_type,p_rate,p_currency,p_from,p_to);
 elsif p_type='HOURLY' and teacher is not null then
  result:=public.add_compensation_rule(teacher,p_branch,p_type,p_rate,p_currency,p_from,p_to);
 else raise exception 'Linked teacher required for session or hourly compensation';end if;
 update public.teacher_compensation_rules set reason=btrim(p_reason) where id=result;
 return result;
end$$;
revoke all on function public.configure_employee_compensation(uuid,uuid,text,numeric,text,date,date,text,text) from public,anon,service_role;
grant execute on function public.configure_employee_compensation(uuid,uuid,text,numeric,text,date,date,text,text) to authenticated;

-- Curated document projection: do not expose private attendance sources or current salary rules.
create function public.payroll_payslip(p_payroll uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare pay public.teacher_payrolls; period public.payroll_periods; code text;
begin
 if not coalesce(public.account_is_active(),false) then raise exception 'Unauthorized';end if;
 select * into pay from public.teacher_payrolls where id=p_payroll;
 if not found then return null;end if;
 select * into period from public.payroll_periods where id=pay.period_id;
 if period.status not in ('APPROVED','FINALIZED') then return null;end if;
 if not (coalesce(public.has_role('SUPER_ADMIN'),false)
  or coalesce(public.has_role_permission('FINANCE','payroll.view',pay.branch_id),false)
  or coalesce(public.can_read_employee_payroll(pay.employee_id,pay.branch_id),false)
  or coalesce(public.can_read_own_payroll(pay.teacher_id,pay.branch_id),false)) then return null;end if;
 select employee_code into code from public.employees where id=pay.employee_id;
 return jsonb_build_object(
  'payroll',to_jsonb(pay),'employee_code',coalesce(code,pay.teacher_id::text),
  'period',jsonb_build_object('starts_on',period.starts_on,'ends_on',period.ends_on,'status',period.status,
   'approved_by',period.approved_by,'approved_at',period.approved_at,'finalized_at',period.finalized_at),
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'earned_on',l.earned_on,
   'kind',case when l.earning_type='MONTHLY_BASE' then 'MONTHLY_BASE' else coalesce(l.calculation_snapshot->>'pay_type',pay.pay_type) end,
   'hours',l.duration_hours,'rate',l.rate,'amount',l.amount,
   'required_minutes',l.calculation_snapshot->'required_minutes','payable_minutes',l.calculation_snapshot->'payable_minutes') order by l.earned_on,l.id)
   from public.payroll_earning_lines l where l.payroll_id=pay.id),'[]'::jsonb),
  'adjustments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'amount',a.amount,'reason',a.reason) order by a.created_at,a.id)
   from public.payroll_adjustments a where a.payroll_id=pay.id),'[]'::jsonb));
end$$;
revoke all on function public.payroll_payslip(uuid) from public,anon,service_role;
grant execute on function public.payroll_payslip(uuid) to authenticated;
