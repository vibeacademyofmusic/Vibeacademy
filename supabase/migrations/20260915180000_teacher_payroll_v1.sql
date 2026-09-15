-- Foundation only: no payouts, tax, social insurance or feedback-based deductions.
create table public.teacher_compensation_rules (
 id uuid primary key default gen_random_uuid(),teacher_id uuid not null references public.teachers(id),branch_id uuid not null references public.branches(id),
 pay_type text not null check(pay_type in ('MONTHLY','HOURLY')),currency text not null default 'VND' check(currency ~ '^[A-Z]{3}$'),
 rate numeric(16,2) not null check(rate>0 and rate<>'NaN'::numeric),effective_from date not null,effective_to date, status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
 created_by uuid references auth.users(id),created_at timestamptz not null default now(),check(effective_to is null or effective_to>=effective_from)
);
create index compensation_teacher_branch_dates on public.teacher_compensation_rules(teacher_id,branch_id,effective_from,effective_to);
create table public.payroll_periods (
 id uuid primary key default gen_random_uuid(),branch_id uuid not null references public.branches(id),starts_on date not null,ends_on date not null,
 status text not null default 'DRAFT' check(status in ('DRAFT','GENERATED','REVIEW','APPROVED','FINALIZED')),
 generated_by uuid references auth.users(id),generated_at timestamptz,approved_by uuid references auth.users(id),approved_at timestamptz,finalized_by uuid references auth.users(id),finalized_at timestamptz,
 version integer not null default 1,unique(branch_id,starts_on),check(starts_on=date_trunc('month',starts_on)::date and ends_on=(starts_on+interval '1 month - 1 day')::date)
);
create table public.teacher_payrolls (
 id uuid primary key default gen_random_uuid(),period_id uuid not null references public.payroll_periods(id),teacher_id uuid not null references public.teachers(id),branch_id uuid not null references public.branches(id),
 teacher_name text not null,pay_type text not null,currency text not null,
 base_salary numeric(16,2) not null default 0,teaching_hours numeric(16,6) not null default 0,hourly_earnings numeric(16,2) not null default 0,adjustment_amount numeric(16,2) not null default 0,gross_amount numeric(16,2) not null default 0,
 unique(period_id,teacher_id)
);
create index payroll_teacher_period on public.teacher_payrolls(teacher_id,period_id);
create table public.payroll_earning_lines (
 id uuid primary key default gen_random_uuid(),payroll_id uuid not null references public.teacher_payrolls(id),session_id uuid references public.session_occurrences(id),
 actual_teacher_id uuid not null references public.teachers(id),class_id uuid references public.classes(id),branch_id uuid not null references public.branches(id),earned_on date not null,
 rule_id uuid references public.teacher_compensation_rules(id),earning_type text not null check(earning_type in ('TEACHING','MONTHLY_BASE')),
 duration_hours numeric(16,6) not null default 0,duration_source text not null default 'SCHEDULED',rate numeric(16,2) not null,amount numeric(16,2) not null,
 unique(payroll_id,session_id),check((earning_type='TEACHING')=(session_id is not null))
);
create unique index payroll_one_monthly_base on public.payroll_earning_lines(payroll_id) where earning_type='MONTHLY_BASE';
create index payroll_earning_session on public.payroll_earning_lines(session_id);
create table public.payroll_adjustments (
 id uuid primary key default gen_random_uuid(),payroll_id uuid not null references public.teacher_payrolls(id),kind text not null check(kind in ('BONUS','DEDUCTION','CORRECTION')),
 amount numeric(16,2) not null check(amount<>0 and amount<>'NaN'::numeric),reason text not null check(char_length(btrim(reason)) between 1 and 2000),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),approved_by uuid references auth.users(id),approved_at timestamptz,
 check((kind='BONUS' and amount>0) or (kind='DEDUCTION' and amount<0) or kind='CORRECTION')
);
create index payroll_adjustment_lookup on public.payroll_adjustments(payroll_id);
create table public.payroll_events (
 id uuid primary key default gen_random_uuid(),period_id uuid not null references public.payroll_periods(id),status text not null,note text not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index payroll_events_period on public.payroll_events(period_id,created_at);

alter table public.teacher_compensation_rules enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.teacher_payrolls enable row level security;
alter table public.payroll_earning_lines enable row level security;
alter table public.payroll_adjustments enable row level security;
alter table public.payroll_events enable row level security;
revoke all on public.teacher_compensation_rules,public.payroll_periods,public.teacher_payrolls,public.payroll_earning_lines,public.payroll_adjustments,public.payroll_events from anon,authenticated;
grant select on public.teacher_compensation_rules,public.payroll_periods,public.teacher_payrolls,public.payroll_earning_lines,public.payroll_adjustments,public.payroll_events to authenticated;
create policy compensation_admin on public.teacher_compensation_rules for select to authenticated using(public.has_role('SUPER_ADMIN'));
create function public.can_read_payroll_period(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(public.has_role('SUPER_ADMIN'),false) or exists(select 1 from teacher_payrolls r join teachers t on t.id=r.teacher_id join payroll_periods p on p.id=r.period_id where p.id=p_id and t.user_id=auth.uid() and p.status in ('APPROVED','FINALIZED'))
$$;
revoke all on function public.can_read_payroll_period(uuid) from public,anon;
grant execute on function public.can_read_payroll_period(uuid) to authenticated;
create policy period_read on public.payroll_periods for select to authenticated using(public.can_read_payroll_period(id));
create policy payroll_read on public.teacher_payrolls for select to authenticated using(public.has_role('SUPER_ADMIN') or (exists(select 1 from public.teachers t where t.id=teacher_id and t.user_id=auth.uid()) and exists(select 1 from public.payroll_periods p where p.id=period_id and p.status in ('APPROVED','FINALIZED'))));
create policy earning_read on public.payroll_earning_lines for select to authenticated using(exists(select 1 from public.teacher_payrolls p where p.id=payroll_id));
create policy adjustment_read on public.payroll_adjustments for select to authenticated using(exists(select 1 from public.teacher_payrolls p where p.id=payroll_id));
create policy payroll_event_admin on public.payroll_events for select to authenticated using(public.has_role('SUPER_ADMIN'));

create function public.add_compensation_rule(p_teacher uuid,p_branch uuid,p_type text,p_rate numeric,p_currency text,p_from date,p_to date default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 if not coalesce(has_role('SUPER_ADMIN'),false) then raise exception 'Unauthorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_teacher::text||p_branch::text,0));
 if not exists(select 1 from teachers t join teacher_branches b on b.teacher_id=t.id where t.id=p_teacher and t.status='ACTIVE' and b.branch_id=p_branch) then raise exception 'Invalid teacher branch'; end if;
 if exists(select 1 from teacher_compensation_rules where teacher_id=p_teacher and branch_id=p_branch and status='ACTIVE' and daterange(effective_from,effective_to,'[]') && daterange(p_from,p_to,'[]')) then raise exception 'Compensation dates overlap'; end if;
 insert into teacher_compensation_rules(teacher_id,branch_id,pay_type,rate,currency,effective_from,effective_to,created_by) values(p_teacher,p_branch,p_type,p_rate,p_currency,p_from,p_to,auth.uid()) returning id into result;
 return result;
end $$;
create function public.create_payroll_period(p_branch uuid,p_month date) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 if not coalesce(has_role('SUPER_ADMIN'),false) then raise exception 'Unauthorized'; end if;
 insert into payroll_periods(branch_id,starts_on,ends_on) values(p_branch,p_month,(p_month+interval '1 month - 1 day')::date) on conflict(branch_id,starts_on) do nothing returning id into result;
 if result is null then select id into result from payroll_periods where branch_id=p_branch and starts_on=p_month; end if;
 return result;
end $$;

create function public.generate_teacher_payroll(p_period uuid) returns void language plpgsql security definer set search_path=public as $$
declare p payroll_periods;
begin
 if not coalesce(has_role('SUPER_ADMIN'),false) then raise exception 'Unauthorized'; end if;
 select * into p from payroll_periods where id=p_period for update;
 if not found then raise exception 'Payroll period not found'; end if;
 if p.status='GENERATED' then return; end if;
 if p.status<>'DRAFT' then raise exception 'Payroll generation requires DRAFT'; end if;
 lock table teacher_compensation_rules in share mode;
 -- Completed means the administrator confirmed teaching. No teacher clock-in exists in V1.
 if exists(select 1 from session_actual_teachers s where s.branch_id=p.branch_id and s.occurrence_date between p.starts_on and p.ends_on and s.status='COMPLETED' and s.ends_at<=now() and (s.teacher_id is null or not exists(select 1 from teacher_compensation_rules r where r.teacher_id=s.teacher_id and r.branch_id=s.branch_id and r.status='ACTIVE' and s.occurrence_date>=r.effective_from and (r.effective_to is null or s.occurrence_date<=r.effective_to)))) then raise exception 'Completed session has unresolved teacher or compensation'; end if;
 if exists(select 1 from teacher_compensation_rules r where r.branch_id=p.branch_id and r.status='ACTIVE' and r.effective_from<=p.ends_on and coalesce(r.effective_to,p.ends_on)>=p.starts_on group by r.teacher_id having count(distinct r.pay_type)>1 or count(distinct r.currency)>1 or bool_or(r.pay_type='MONTHLY' and (r.effective_from>p.starts_on or coalesce(r.effective_to,p.ends_on)<p.ends_on))) then raise exception 'Monthly rule must cover full period; pay type and currency cannot change within period'; end if;
 if exists(select 1 from payroll_adjustments a join teacher_payrolls t on t.id=a.payroll_id where t.period_id=p.id) then raise exception 'Payroll with adjustments cannot regenerate; use correction adjustment'; end if;
 delete from payroll_earning_lines where payroll_id in(select id from teacher_payrolls where period_id=p.id);
 delete from teacher_payrolls where period_id=p.id;
 insert into teacher_payrolls(period_id,teacher_id,branch_id,teacher_name,pay_type,currency)
 select p.id,r.teacher_id,p.branch_id,coalesce(t.full_name,t.teacher_code),min(r.pay_type),min(r.currency) from teacher_compensation_rules r join teachers t on t.id=r.teacher_id
 where r.branch_id=p.branch_id and r.status='ACTIVE' and r.effective_from<=p.ends_on and coalesce(r.effective_to,p.ends_on)>=p.starts_on group by r.teacher_id,t.full_name,t.teacher_code;
 insert into payroll_earning_lines(payroll_id,actual_teacher_id,branch_id,earned_on,rule_id,earning_type,rate,amount)
 select t.id,t.teacher_id,p.branch_id,p.starts_on,r.id,'MONTHLY_BASE',r.rate,r.rate from teacher_payrolls t join teacher_compensation_rules r on r.teacher_id=t.teacher_id and r.branch_id=t.branch_id and r.status='ACTIVE' and r.effective_from<=p.starts_on and coalesce(r.effective_to,p.ends_on)>=p.ends_on where t.period_id=p.id and t.pay_type='MONTHLY';
 insert into payroll_earning_lines(payroll_id,session_id,actual_teacher_id,class_id,branch_id,earned_on,rule_id,earning_type,duration_hours,rate,amount)
 select t.id,s.session_id,s.teacher_id,s.class_id,s.branch_id,s.occurrence_date,r.id,'TEACHING',extract(epoch from(s.ends_at-s.starts_at))/3600,r.rate,
 case when t.pay_type='HOURLY' then round(extract(epoch from(s.ends_at-s.starts_at))/3600*r.rate,2) else 0 end
 from session_actual_teachers s join teacher_payrolls t on t.period_id=p.id and t.teacher_id=s.teacher_id and t.branch_id=s.branch_id
 join teacher_compensation_rules r on r.teacher_id=t.teacher_id and r.branch_id=t.branch_id and r.status='ACTIVE' and s.occurrence_date>=r.effective_from and (r.effective_to is null or s.occurrence_date<=r.effective_to)
 where s.status='COMPLETED' and s.ends_at<=now() and s.occurrence_date between p.starts_on and p.ends_on;
 update teacher_payrolls t set base_salary=x.base,teaching_hours=x.hours,hourly_earnings=x.hourly,gross_amount=x.base+x.hourly from
 (select t2.id,coalesce(sum(l.amount) filter(where l.earning_type='MONTHLY_BASE'),0) base,coalesce(sum(l.duration_hours),0) hours,coalesce(sum(l.amount) filter(where l.earning_type='TEACHING'),0) hourly from teacher_payrolls t2 left join payroll_earning_lines l on l.payroll_id=t2.id where t2.period_id=p.id group by t2.id) x where t.id=x.id;
 update payroll_periods set status='GENERATED',generated_by=auth.uid(),generated_at=now(),version=version+1 where id=p.id;
 insert into payroll_events(period_id,status,note,actor_id) values(p.id,'GENERATED','Generated using completed sessions and scheduled duration',auth.uid());
end $$;

create function public.add_payroll_adjustment(p_payroll uuid,p_kind text,p_amount numeric,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare pid uuid; state text;
begin
 if not coalesce(has_role('SUPER_ADMIN'),false) then raise exception 'Unauthorized'; end if;
 select period_id into pid from teacher_payrolls where id=p_payroll;
 select status into state from payroll_periods where id=pid for update;
 if state is null or state not in ('GENERATED','REVIEW') then raise exception 'Adjustment requires generated or review payroll'; end if;
 insert into payroll_adjustments(payroll_id,kind,amount,reason,created_by) values(p_payroll,p_kind,p_amount,btrim(p_reason),auth.uid());
 update teacher_payrolls set adjustment_amount=adjustment_amount+p_amount,gross_amount=gross_amount+p_amount where id=p_payroll;
 update payroll_periods set version=version+1 where id=pid;
 insert into payroll_events(period_id,status,note,actor_id) values(pid,state,'Adjustment: '||btrim(p_reason),auth.uid());
end $$;
create function public.transition_payroll(p_period uuid,p_version integer,p_status text,p_note text) returns void language plpgsql security definer set search_path=public as $$
declare p payroll_periods;
begin
 if not coalesce(has_role('SUPER_ADMIN'),false) then raise exception 'Unauthorized'; end if;
 select * into p from payroll_periods where id=p_period for update;
 if not found or p.version is distinct from p_version then raise exception 'Payroll changed; reload'; end if;
 if p_note is null or char_length(btrim(p_note)) not between 1 and 2000 then raise exception 'Audit note required'; end if;
 if p_status is null or not ((p.status='GENERATED' and p_status in ('DRAFT','REVIEW')) or (p.status='REVIEW' and p_status in ('DRAFT','APPROVED')) or (p.status='APPROVED' and p_status='FINALIZED')) then raise exception 'Invalid payroll transition'; end if;
 if p_status='DRAFT' and exists(select 1 from payroll_adjustments a join teacher_payrolls t on t.id=a.payroll_id where t.period_id=p.id) then raise exception 'Payroll with adjustments cannot return to draft'; end if;
 if p_status='APPROVED' and not exists(select 1 from teacher_payrolls where period_id=p.id) then raise exception 'Empty payroll cannot be approved'; end if;
 if p_status='APPROVED' then
 update payroll_adjustments a set approved_by=auth.uid(),approved_at=now() from teacher_payrolls t where t.id=a.payroll_id and t.period_id=p.id;
 end if;
 update payroll_periods set status=p_status,version=version+1,
 approved_by=case when p_status='APPROVED' then auth.uid() else approved_by end,approved_at=case when p_status='APPROVED' then now() else approved_at end,
 finalized_by=case when p_status='FINALIZED' then auth.uid() else finalized_by end,finalized_at=case when p_status='FINALIZED' then now() else finalized_at end where id=p.id;
 insert into payroll_events(period_id,status,note,actor_id) values(p.id,p_status,case when p_status='APPROVED' and p.generated_by=auth.uid() then 'SUPER_ADMIN self-approval: ' else '' end||btrim(p_note),auth.uid());
end $$;

create function public.guard_payroll_history() returns trigger language plpgsql set search_path=public as $$
declare pid uuid; state text;
begin
 if tg_table_name='payroll_periods' then
 if old.status='FINALIZED' or (old.status='APPROVED' and (tg_op='DELETE' or new.status<>'FINALIZED' or (to_jsonb(new)-array['status','version','finalized_by','finalized_at']) is distinct from (to_jsonb(old)-array['status','version','finalized_by','finalized_at']))) then raise exception 'Approved payroll is immutable'; end if;
 elsif tg_table_name='teacher_payrolls' then pid:=case when tg_op='INSERT' then new.period_id else old.period_id end;
 else select period_id into pid from teacher_payrolls where id=case when tg_op='INSERT' then new.payroll_id else old.payroll_id end;
 end if;
 if pid is not null then
 select status into state from payroll_periods where id=pid;
 if state in ('APPROVED','FINALIZED') then raise exception 'Approved payroll is immutable'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger payroll_period_guard before update or delete on public.payroll_periods for each row execute function public.guard_payroll_history();
create trigger teacher_payroll_guard before insert or update or delete on public.teacher_payrolls for each row execute function public.guard_payroll_history();
create trigger earning_guard before insert or update or delete on public.payroll_earning_lines for each row execute function public.guard_payroll_history();
create trigger adjustment_guard before insert or update or delete on public.payroll_adjustments for each row execute function public.guard_payroll_history();
create view public.payroll_period_summary with(security_invoker=true) as
select p.id,p.branch_id,p.starts_on,p.ends_on,p.status,t.currency,count(t.id) teacher_count,coalesce(sum(t.gross_amount),0) gross_amount,coalesce(sum(t.base_salary),0) monthly_total,coalesce(sum(t.hourly_earnings),0) hourly_total,coalesce(sum(t.adjustment_amount),0) adjustments
from public.payroll_periods p left join public.teacher_payrolls t on t.period_id=p.id group by p.id,t.currency;
grant select on public.payroll_period_summary to authenticated;
revoke all on function public.add_compensation_rule(uuid,uuid,text,numeric,text,date,date),public.create_payroll_period(uuid,date),public.generate_teacher_payroll(uuid),public.add_payroll_adjustment(uuid,text,numeric,text),public.transition_payroll(uuid,integer,text,text),public.guard_payroll_history() from public,anon,authenticated;
grant execute on function public.add_compensation_rule(uuid,uuid,text,numeric,text,date,date),public.create_payroll_period(uuid,date),public.generate_teacher_payroll(uuid),public.add_payroll_adjustment(uuid,text,numeric,text),public.transition_payroll(uuid,integer,text,text) to authenticated;
