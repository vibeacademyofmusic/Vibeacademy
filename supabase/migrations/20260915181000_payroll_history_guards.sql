-- Close privileged write paths too; ordinary authenticated writes already have no grant.
create or replace function public.guard_payroll_history() returns trigger language plpgsql set search_path=public as $$
declare pid uuid; state text;
begin
 if tg_table_name='payroll_periods' then
 if old.status='FINALIZED' or (old.status='APPROVED' and (tg_op='DELETE' or new.status<>'FINALIZED' or (to_jsonb(new)-array['status','version','finalized_by','finalized_at']) is distinct from (to_jsonb(old)-array['status','version','finalized_by','finalized_at']))) then raise exception 'Approved payroll is immutable'; end if;
 elsif tg_table_name='teacher_payrolls' then
 if tg_op='UPDATE' and (new.period_id is distinct from old.period_id or new.teacher_id is distinct from old.teacher_id or new.branch_id is distinct from old.branch_id) then raise exception 'Payroll identity is immutable'; end if;
 pid:=case when tg_op='INSERT' then new.period_id else old.period_id end;
 else
 if tg_op='UPDATE' and new.payroll_id is distinct from old.payroll_id then raise exception 'Payroll identity is immutable'; end if;
 select period_id into pid from teacher_payrolls where id=case when tg_op='INSERT' then new.payroll_id else old.payroll_id end;
 end if;
 if pid is not null then
 select status into state from payroll_periods where id=pid;
 if state in ('APPROVED','FINALIZED') then raise exception 'Approved payroll is immutable'; end if;
 end if;
 if tg_table_name='payroll_adjustments' and tg_op in ('UPDATE','DELETE') then
 if tg_op='DELETE' or (to_jsonb(new)-array['approved_by','approved_at']) is distinct from (to_jsonb(old)-array['approved_by','approved_at']) then raise exception 'Adjustment history is immutable'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create function public.guard_payroll_audit() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Payroll audit is immutable'; end $$;
create trigger payroll_audit_guard before update or delete on public.payroll_events for each row execute function public.guard_payroll_audit();
revoke all on function public.guard_payroll_audit() from public,anon,authenticated;
