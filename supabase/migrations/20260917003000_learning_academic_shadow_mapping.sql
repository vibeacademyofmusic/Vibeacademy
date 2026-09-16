-- Explicit, immutable same-Grade mapping. Reconciliation only: no Academic writes.
create table public.learning_academic_mappings (
 version_id uuid primary key references public.learning_versions(id),
 subject_id uuid not null references public.curriculum_subjects(id),
 created_by uuid not null references public.profiles(id),
 reason text not null check(length(trim(reason)) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.learning_academic_mappings enable row level security;
revoke all on public.learning_academic_mappings from public,anon,authenticated,service_role;
grant select on public.learning_academic_mappings to authenticated;
create policy learning_mapping_admin on public.learning_academic_mappings for select to authenticated using(public.has_role('SUPER_ADMIN'));
create trigger learning_mapping_immutable before update or delete on public.learning_academic_mappings for each row execute function public.reject_learning_history_mutation();
create function public.map_learning_academic_shadow(p_version uuid,p_subject uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.learning_versions;s public.curriculum_subjects;existing public.learning_academic_mappings;
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized';end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 2000 then raise exception 'Mapping evidence required';end if;
 select * into v from public.learning_versions where id=p_version for update;
 if not found or v.state<>'PUBLISHED' then raise exception 'Published version required';end if;
 select * into s from public.curriculum_subjects where id=p_subject;
 if not found or s.level_id<>v.level_id or s.status<>'ACTIVE' or s.completion_rule<>'DIRECT_ASSESSMENT' or not exists(select 1 from public.curriculum_levels l join public.curriculums c on c.id=l.curriculum_id where l.id=v.level_id and l.status='ACTIVE' and c.status='ACTIVE') then raise exception 'Active direct assessment subject in the same Grade required';end if;
 select * into existing from public.learning_academic_mappings where version_id=p_version;
 if found then
 if existing.subject_id is distinct from p_subject or existing.reason is distinct from trim(p_reason) or existing.created_by is distinct from auth.uid() then raise exception 'Mapping is immutable; create a new content version';end if;
 return p_version;
 end if;
 insert into public.learning_academic_mappings(version_id,subject_id,created_by,reason) values(p_version,p_subject,auth.uid(),trim(p_reason));
 insert into public.learning_audit(entity_id,event,actor,reason) values(p_version,'ACADEMIC_SHADOW_MAPPED',auth.uid(),trim(p_reason));
 return p_version;
end$$;
revoke all on function public.map_learning_academic_shadow(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.map_learning_academic_shadow(uuid,uuid,text) to authenticated;

create view public.learning_academic_reconciliation with(security_invoker=true) as
select outcome.attempt_id,outcome.student_id,outcome.version_id,outcome.revision_id,outcome.score,outcome.proposed_outcome,
 v.level_id,m.subject_id,s.name as subject_name,e.enrollment_count,p.progress_count,p.actual_status,
 case when m.version_id is null then 'UNMAPPED'
 when s.level_id is distinct from v.level_id or s.status is distinct from 'ACTIVE' or s.completion_rule is distinct from 'DIRECT_ASSESSMENT' or l.status is distinct from 'ACTIVE' or c.status is distinct from 'ACTIVE' then 'INACTIVE_OR_CHANGED_REQUIREMENT'
 when e.enrollment_count=0 then 'NO_ACADEMIC_ENROLLMENT'
 when e.enrollment_count>1 then 'AMBIGUOUS_ACADEMIC_ENROLLMENT'
 when p.progress_count<>1 then 'NO_UNIQUE_SUBJECT_PROGRESS'
 when outcome.proposed_outcome='PASS' and p.actual_status in('PASS','EXEMPT') then 'MATCH'
 when outcome.proposed_outcome='NOT_PASSED' and p.actual_status='NOT_PASSED' then 'MATCH'
 else 'DIFFERENCE_REVIEW_REQUIRED' end as reconciliation_status,
 'SHADOW_ONLY'::text as mode
from public.learning_final_shadow_outcomes outcome
join public.learning_versions v on v.id=outcome.version_id
join public.curriculum_levels l on l.id=v.level_id
join public.curriculums c on c.id=l.curriculum_id
left join public.learning_academic_mappings m on m.version_id=v.id
left join public.curriculum_subjects s on s.id=m.subject_id
left join lateral(select count(*) as enrollment_count from public.student_curriculum_enrollments e where e.student_id=outcome.student_id and e.curriculum_id=l.curriculum_id and e.status in('ACTIVE','PAUSED','COMPLETED')) e on true
left join lateral(select count(*) as progress_count,min(sp.status) as actual_status
 from public.student_subject_progress sp join public.student_level_progress lp on lp.id=sp.level_progress_id
 join public.student_curriculum_enrollments en on en.id=lp.enrollment_id
 where en.student_id=outcome.student_id and en.curriculum_id=l.curriculum_id and en.status in('ACTIVE','PAUSED','COMPLETED') and lp.level_id=v.level_id and sp.subject_id=m.subject_id) p on true
where public.has_role('SUPER_ADMIN');
revoke all on public.learning_academic_reconciliation from public,anon,authenticated,service_role;
grant select on public.learning_academic_reconciliation to authenticated;
