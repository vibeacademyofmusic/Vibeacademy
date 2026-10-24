-- Owner-approved V3 separation of duties; existing history guards remain in force.
insert into public.permissions(code,name,module) values
 ('payroll.prepare','Prepare payroll','payroll'),
 ('payroll.finalize','Finalize payroll','payroll') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='FINANCE' and p.code in ('payroll.prepare','payroll.approve','payroll.finalize')
on conflict do nothing;

-- Reuse append-only payroll_events: actor_id/created_at are performed_by/performed_at.
alter table public.payroll_events
 add column event_type text not null default 'LEGACY',
 add column override_type text,
 add column override_reason text,
 add column before_snapshot jsonb,
 add column after_snapshot jsonb,
 add constraint payroll_override_audit_required check (
   (event_type='EMERGENCY_OVERRIDE' and override_type='MAKER_CHECKER_EMERGENCY'
    and override_type is not null and override_reason is not null
    and char_length(btrim(override_reason)) between 1 and 2000
    and before_snapshot is not null and after_snapshot is not null)
   or (event_type<>'EMERGENCY_OVERRIDE' and override_type is null and override_reason is null)
 );

create function public.payroll_approval_snapshot(p_period uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('period',to_jsonb(p),
 'payrolls',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.teacher_payrolls t where t.period_id=p.id),'[]'::jsonb),
 'adjustments',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.payroll_adjustments a join public.teacher_payrolls t on t.id=a.payroll_id where t.period_id=p.id),'[]'::jsonb))
 from public.payroll_periods p where p.id=p_period
$$;
revoke all on function public.payroll_approval_snapshot(uuid) from public,anon,authenticated;

create function public.transition_payroll_with_override(p_period uuid,p_version integer,p_status text,p_note text,p_override_type text,p_override_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.payroll_periods; before_state jsonb; after_state jsonb; emergency boolean; action_permission text;
begin

 action_permission:=case p_status when 'APPROVED' then 'payroll.approve' when 'FINALIZED' then 'payroll.finalize' else 'payroll.prepare' end;
 -- Authorize scope before locking or revealing the record version.
 select * into p from public.payroll_periods target where target.id=p_period
   and public.has_permission(action_permission,target.branch_id)
   and (public.has_role('SUPER_ADMIN') or public.has_role_permission('FINANCE',action_permission,target.branch_id))
 for update;
 if not found then raise exception 'Unauthorized'; end if;
 if p.version is distinct from p_version then raise exception 'Payroll changed; reload'; end if;
 emergency:=p_override_type is not null or p_override_reason is not null;
 if emergency then
   if p_status not in ('APPROVED','FINALIZED') or not public.has_permission(action_permission,p.branch_id)
     or not public.has_role('SUPER_ADMIN') or p_override_type is distinct from 'MAKER_CHECKER_EMERGENCY'
     or p_override_reason is null or char_length(btrim(p_override_reason)) not between 1 and 2000 then
     raise exception 'Valid SUPER_ADMIN emergency override reason and type required';
   end if;
 elsif p_status in ('APPROVED','FINALIZED') and (
   p.generated_by is null or p.generated_by=auth.uid() or exists(
     select 1 from public.payroll_adjustments a join public.teacher_payrolls t on t.id=a.payroll_id
     where t.period_id=p.id and a.created_by=auth.uid())) then
   raise exception 'Payroll maker cannot approve or finalize';
 end if;
 before_state:=public.payroll_approval_snapshot(p.id);

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
 after_state:=public.payroll_approval_snapshot(p.id);
 insert into public.payroll_events(period_id,status,note,actor_id,event_type,override_type,override_reason,before_snapshot,after_snapshot)
 values(p.id,p_status,btrim(p_note),auth.uid(),case when emergency then 'EMERGENCY_OVERRIDE' else 'STATUS_TRANSITION' end,
 case when emergency then p_override_type end,case when emergency then btrim(p_override_reason) end,before_state,after_state);
end $$;

-- The existing RPC must enforce the same check; no unaudited compatibility path.
create or replace function public.transition_payroll(p_period uuid,p_version integer,p_status text,p_note text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.transition_payroll_with_override(p_period,p_version,p_status,p_note,null,null);
end $$;
revoke all on function public.transition_payroll_with_override(uuid,integer,text,text,text,text) from public,anon,authenticated;
grant execute on function public.transition_payroll_with_override(uuid,integer,text,text,text,text) to authenticated;
