-- Regrade events correct manual marks without mutating historical attempts.
-- Academic outcomes remain shadow only; no live progression is written.
create table public.learning_assessment_regrades (
 id uuid primary key,
 attempt_id uuid not null references public.learning_assessment_attempts(id),
 previous_regrade_id uuid references public.learning_assessment_regrades(id),
 prior_score numeric not null check(prior_score between 0 and 100),
 corrected_score numeric not null check(corrected_score between 0 and 100),
 prior_state text not null check(prior_state in('PASSED','FAILED')),
 corrected_state text not null check(corrected_state in('PASSED','FAILED')),
 marks jsonb not null,
 evidence jsonb not null,
 reason text not null check(length(trim(reason)) between 1 and 2000),
 reviewer_id uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp()
);
create unique index learning_regrade_successor on public.learning_assessment_regrades(previous_regrade_id) where previous_regrade_id is not null;
create unique index learning_regrade_root on public.learning_assessment_regrades(attempt_id) where previous_regrade_id is null;
create index learning_regrade_history on public.learning_assessment_regrades(attempt_id,created_at desc,id);
alter table public.learning_assessment_regrades enable row level security;
revoke all on public.learning_assessment_regrades from public,anon,authenticated,service_role;
grant select on public.learning_assessment_regrades to authenticated;
create policy learning_regrade_own on public.learning_assessment_regrades for select to authenticated
 using(public.has_role('SUPER_ADMIN') or exists(select 1 from public.learning_assessment_attempts a where a.id=attempt_id and public.owns_learning_history(a.student_id)));
create trigger learning_regrade_immutable before update or delete on public.learning_assessment_regrades for each row execute function public.reject_learning_history_mutation();

create view public.learning_effective_assessment_results with(security_invoker=true) as
 select a.id,a.assessment_id,a.student_id,a.question_snapshot,a.policy_snapshot,a.answers,
 coalesce(r.corrected_state,a.state) as state,coalesce(r.corrected_score,a.score) as score,
 coalesce(r.evidence,a.evidence) as evidence,a.started_at,a.submitted_at,a.completed_at,
 r.id as revision_id,r.created_at as regraded_at
 from public.learning_assessment_attempts a
 left join lateral (select r.* from public.learning_assessment_regrades r where r.attempt_id=a.id order by r.created_at desc,r.id desc limit 1) r on true;
create view public.learning_final_shadow_outcomes with(security_invoker=true) as
 select a.id as attempt_id,a.student_id,(a.policy_snapshot->>'version_id')::uuid as version_id,
 a.revision_id,a.score,case when a.state='PASSED' then 'PASS' else 'NOT_PASSED' end as proposed_outcome,'SHADOW'::text as mode
 from public.learning_effective_assessment_results a
 where a.policy_snapshot->>'kind'='FINAL' and a.state in('PASSED','FAILED') and public.has_role('SUPER_ADMIN');
revoke all on public.learning_effective_assessment_results,public.learning_final_shadow_outcomes from public,anon,authenticated,service_role;
grant select on public.learning_effective_assessment_results,public.learning_final_shadow_outcomes to authenticated;

create function public.regrade_learning_assessment(p_attempt uuid,p_request uuid,p_expected_revision uuid,p_marks jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.learning_assessment_attempts; p public.learning_assessments; previous public.learning_assessment_regrades; retry public.learning_assessment_regrades; e jsonb; mark numeric; total numeric:=0; earned numeric:=0; v_score numeric; v_state text; v_evidence jsonb:='[]';
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if p_request is null or p_reason is null or length(trim(p_reason)) not between 1 and 2000 or jsonb_typeof(p_marks) is distinct from 'object' or octet_length(p_marks::text)>20000 then raise exception 'Regrade evidence required'; end if;
 select * into a from public.learning_assessment_attempts where id=p_attempt for update;
 if not found or a.state not in('PASSED','FAILED') then raise exception 'Completed assessment required'; end if;
 if exists(select 1 from public.students where id=a.student_id and user_id=auth.uid()) then raise exception 'Cannot review own assessment'; end if;
 select * into retry from public.learning_assessment_regrades where id=p_request;
 if found then
 if retry.attempt_id is distinct from p_attempt or retry.previous_regrade_id is distinct from p_expected_revision or retry.marks is distinct from p_marks or retry.reason is distinct from trim(p_reason) or retry.reviewer_id is distinct from auth.uid() then raise exception 'Regrade request mismatch'; end if;
 return retry.id;
 end if;
 select * into previous from public.learning_assessment_regrades where attempt_id=p_attempt order by created_at desc,id desc limit 1;
 if previous.id is distinct from p_expected_revision then raise exception 'Result changed; reload before regrading'; end if;
 select * into p from public.learning_assessments where id=a.assessment_id;
 if not exists(select 1 from jsonb_array_elements(a.evidence) item where item->>'mode'<>'AUTO') then raise exception 'Automatic answer keys require a new assessment version'; end if;
 if exists(select 1 from jsonb_object_keys(p_marks) code where not exists(select 1 from jsonb_array_elements(a.evidence) item where item->>'code'=code and item->>'mode'<>'AUTO')) then raise exception 'Unknown manual question'; end if;
 for e in select value from jsonb_array_elements(a.evidence) loop
 total:=total+(e->>'max_points')::numeric;
 if e->>'mode'='AUTO' then mark:=(e->>'points')::numeric;
 else
 if jsonb_typeof(p_marks->(e->>'code')) is distinct from 'number' then raise exception 'All manual questions require marks'; end if;
 mark:=(p_marks->>(e->>'code'))::numeric;
 if mark<0 or mark>(e->>'max_points')::numeric then raise exception 'Manual mark outside rubric range'; end if;
 end if;
 earned:=earned+mark;v_evidence:=v_evidence||jsonb_build_array(e||jsonb_build_object('points',mark));
 end loop;
 v_score:=round(100*earned/total,4);v_state:=case when v_score>=p.pass_threshold then 'PASSED' else 'FAILED' end;
 insert into public.learning_assessment_regrades(id,attempt_id,previous_regrade_id,prior_score,corrected_score,prior_state,corrected_state,marks,evidence,reason,reviewer_id)
 values(p_request,p_attempt,previous.id,coalesce(previous.corrected_score,a.score),v_score,coalesce(previous.corrected_state,a.state),v_state,p_marks,v_evidence,trim(p_reason),auth.uid());
 insert into public.learning_audit(entity_id,event,actor,reason) values(p_request,'ASSESSMENT_REGRADED',auth.uid(),trim(p_reason));
 return p_request;
end$$;
revoke all on function public.regrade_learning_assessment(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.regrade_learning_assessment(uuid,uuid,uuid,jsonb,text) to authenticated;

create or replace function public.learning_assessment_history(p_offset integer default 0)
returns table(id uuid,assessment_id uuid,kind text,state text,score numeric,started_at timestamptz,completed_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select a.id,a.assessment_id,a.policy_snapshot->>'kind',a.state,a.score,a.started_at,a.completed_at
 from public.learning_effective_assessment_results a where public.owns_learning_history(a.student_id)
 order by a.started_at desc,a.id limit 25 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;

-- Regrades change the effective outcome, not the original attempt completion time.
-- The approved 24-hour failure cooldown remains anchored to that attempt time.
create or replace function public.start_learning_assessment(p_id uuid,p_request uuid,p_identity_confirmed boolean) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.learning_assessments; v public.learning_versions; learner uuid; prior public.learning_assessment_attempts; used integer; failed_at timestamptz; override uuid; delivered jsonb;
begin
 select * into p from public.learning_assessments where id=p_id and state='APPROVED';
 if not found then raise exception 'Assessment unavailable'; end if;
 select * into v from public.learning_versions where id=p.version_id and state='PUBLISHED';
 if not found then raise exception 'Learning content unavailable'; end if;
 learner:=public.learning_learner_for_level(v.level_id);
 if learner is null then raise exception 'Learning access denied or expired'; end if;
 if p_request is null or (p.kind='FINAL' and p_identity_confirmed is distinct from true) then raise exception 'Identity confirmation required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('assessment:'||p_id::text||':'||learner::text,0));
 select * into prior from public.learning_assessment_attempts where id=p_request;
 if found then
 if prior.assessment_id is distinct from p_id or prior.student_id is distinct from learner then raise exception 'Assessment request mismatch'; end if;
 return prior.id;
 end if;
 if exists(select 1 from public.learning_assessment_attempts where assessment_id=p_id and student_id=learner and state in('IN_PROGRESS','PENDING_REVIEW')) then raise exception 'An assessment attempt is already active'; end if;
 select count(*),max(completed_at) filter(where state='FAILED') into used,failed_at from public.learning_effective_assessment_results where assessment_id=p_id and student_id=learner;
 if (p.attempt_limit is not null and used>=p.attempt_limit) or (failed_at is not null and failed_at+make_interval(secs=>p.cooldown_seconds)>clock_timestamp()) then
 select o.id into override from public.learning_assessment_overrides o where o.assessment_id=p_id and o.student_id=learner and o.valid_until>clock_timestamp() and (failed_at is null or o.created_at>=failed_at)
 and (select count(*) from public.learning_assessment_attempts a where a.override_id=o.id)<o.extra_attempts order by o.created_at,o.id limit 1 for update;
 if override is null then raise exception 'Assessment attempt limit or cooldown reached'; end if;
 end if;
 select jsonb_agg(jsonb_build_object('code',q->'code','type',q->'type','prompt',q->'prompt','options',case when jsonb_typeof(q->'options')='array' then (select jsonb_agg(o order by random()) from jsonb_array_elements(q->'options') o) else 'null'::jsonb end,'points',q->'points','mode',q->'mode') order by random()) into delivered from jsonb_array_elements(p.questions) q;
 insert into public.learning_assessment_attempts(id,assessment_id,student_id,override_id,policy_snapshot,question_snapshot,identity_confirmed)
 values(p_request,p_id,learner,override,jsonb_build_object('version_id',p.version_id,'kind',p.kind,'threshold',p.pass_threshold,'attempt_limit',p.attempt_limit,'cooldown_seconds',p.cooldown_seconds,'academic_mode','SHADOW'),delivered,coalesce(p_identity_confirmed,false));
 return p_request;
end$$;
