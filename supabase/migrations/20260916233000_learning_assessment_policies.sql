-- Assessment attempts and immutable policy snapshots. Academic integration is shadow only.
create table public.learning_assessments (
 id uuid primary key default gen_random_uuid(),
 version_id uuid not null references public.learning_versions(id),
 title text not null check(length(trim(title)) between 1 and 200),
 kind text not null check(kind in('PRACTICE','CHECKPOINT','FINAL')),
 pass_threshold numeric not null check(pass_threshold between 0 and 100),
 attempt_limit integer check(attempt_limit between 1 and 100),
 cooldown_seconds integer not null check(cooldown_seconds between 0 and 31536000),
 questions jsonb not null,
 state text not null default 'DRAFT' check(state in('DRAFT','APPROVED')),
 author_id uuid not null references public.profiles(id),
 reviewer_id uuid references public.profiles(id),
 review_note text,
 created_at timestamptz not null default now(),
 check(kind<>'PRACTICE' or (attempt_limit is null and cooldown_seconds=0)),
 check(kind<>'FINAL' or (attempt_limit=3 and cooldown_seconds=86400)),
 check(state<>'APPROVED' or (reviewer_id is not null and reviewer_id<>author_id and length(trim(review_note))>0))
);
create table public.learning_assessment_overrides (
 id uuid primary key default gen_random_uuid(),
 assessment_id uuid not null references public.learning_assessments(id),
 student_id uuid not null references public.students(id),
 extra_attempts integer not null check(extra_attempts between 1 and 100),
 valid_until timestamptz not null check(isfinite(valid_until)),
 reason text not null check(length(trim(reason)) between 1 and 2000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp()
);
create table public.learning_assessment_attempts (
 id uuid primary key,
 assessment_id uuid not null references public.learning_assessments(id),
 student_id uuid not null references public.students(id),
 override_id uuid references public.learning_assessment_overrides(id),
 policy_snapshot jsonb not null,
 question_snapshot jsonb not null,
 answers jsonb,
 state text not null default 'IN_PROGRESS' check(state in('IN_PROGRESS','PENDING_REVIEW','PASSED','FAILED')),
 score numeric check(score between 0 and 100),
 evidence jsonb,
 identity_confirmed boolean not null,
 started_at timestamptz not null default clock_timestamp(),
 submitted_at timestamptz,
 completed_at timestamptz,
 reviewed_by uuid references public.profiles(id),
 review_reason text
);
create unique index learning_one_active_attempt on public.learning_assessment_attempts(assessment_id,student_id) where state in('IN_PROGRESS','PENDING_REVIEW');
create index learning_assessment_student_history on public.learning_assessment_attempts(student_id,assessment_id,started_at desc);
create table public.learning_academic_shadow (
 attempt_id uuid primary key references public.learning_assessment_attempts(id),
 version_id uuid not null references public.learning_versions(id),
 student_id uuid not null references public.students(id),
 proposed_outcome text not null check(proposed_outcome='PASS'),
 created_at timestamptz not null default clock_timestamp(),
 mode text not null default 'SHADOW' check(mode='SHADOW')
);
alter table public.learning_assessments enable row level security;
alter table public.learning_assessment_overrides enable row level security;
alter table public.learning_assessment_attempts enable row level security;
alter table public.learning_academic_shadow enable row level security;
revoke all on public.learning_assessments,public.learning_assessment_overrides,public.learning_assessment_attempts,public.learning_academic_shadow from public,anon,authenticated,service_role;
grant select on public.learning_assessments,public.learning_assessment_overrides,public.learning_assessment_attempts,public.learning_academic_shadow to authenticated;
create policy learning_assessment_admin on public.learning_assessments for select to authenticated using(public.has_role('SUPER_ADMIN'));
create policy learning_override_admin on public.learning_assessment_overrides for select to authenticated using(public.has_role('SUPER_ADMIN'));
create function public.can_read_learning_attempt(p_assessment uuid,p_student uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or exists(
 select 1 from public.learning_assessments a join public.learning_versions v on v.id=a.version_id
 where a.id=p_assessment and v.state='PUBLISHED' and public.learning_learner_for_level(v.level_id)=p_student)
$$;
revoke all on function public.can_read_learning_attempt(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_read_learning_attempt(uuid,uuid) to authenticated;
create policy learning_attempt_own on public.learning_assessment_attempts for select to authenticated using(public.can_read_learning_attempt(assessment_id,student_id));
-- Expired access retains outcomes without re-exposing licensed question payloads.
create function public.learning_assessment_history(p_offset integer default 0)
returns table(id uuid,assessment_id uuid,kind text,state text,score numeric,started_at timestamptz,completed_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select a.id,a.assessment_id,a.policy_snapshot->>'kind',a.state,a.score,a.started_at,a.completed_at
 from public.learning_assessment_attempts a where public.owns_learning_history(a.student_id)
 order by a.started_at desc,a.id limit 25 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;
revoke all on function public.learning_assessment_history(integer) from public,anon,authenticated,service_role;
grant execute on function public.learning_assessment_history(integer) to authenticated;
create policy learning_shadow_admin on public.learning_academic_shadow for select to authenticated using(public.has_role('SUPER_ADMIN'));
create trigger learning_override_immutable before update or delete on public.learning_assessment_overrides for each row execute function public.reject_learning_history_mutation();
create trigger learning_shadow_immutable before update or delete on public.learning_academic_shadow for each row execute function public.reject_learning_history_mutation();

create function public.create_learning_assessment(p_version uuid,p_title text,p_kind text,p_threshold numeric,p_limit integer,p_cooldown integer,p_questions jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare q jsonb; codes text[]:='{}'; result uuid;
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if not exists(select 1 from public.learning_versions where id=p_version and state='PUBLISHED') then raise exception 'Published learning version required'; end if;
 if p_questions is null or jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions) not between 1 and 100 or octet_length(p_questions::text)>500000 then raise exception 'Invalid assessment questions'; end if;
 for q in select value from jsonb_array_elements(p_questions) loop
 if jsonb_typeof(q)<>'object' or coalesce(q->>'code','')!~'^[A-Z0-9._-]{1,80}$' or (q->>'code')=any(codes) or length(trim(coalesce(q->>'prompt',''))) not between 1 and 10000 or
 coalesce(q->>'type','') not in('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE','NOTE_IDENTIFICATION','NOTE_PLACEMENT','REST_IDENTIFICATION','ACCIDENTAL_PLACEMENT','KEY_SIGNATURE','SCALE_CONSTRUCTION','INTERVAL_CONSTRUCTION','TRIAD_CONSTRUCTION','RHYTHM_GROUPING','REWRITE','ERROR_CORRECTION','COMPOSITION','MANUAL_REVIEW') or
 coalesce(q->>'mode','') not in('AUTO','HYBRID','MANUAL') or jsonb_typeof(q->'points') is distinct from 'number' or (q->>'points')::numeric<=0 or (q->>'points')::numeric>1000
 then raise exception 'Invalid assessment question'; end if;
 codes:=array_append(codes,q->>'code');
 if q->>'mode'='AUTO' then
 if ((q->>'type'='SINGLE_CHOICE' and jsonb_typeof(q->'key')='string') or (q->>'type'='TRUE_FALSE' and jsonb_typeof(q->'key')='boolean') or (q->>'type'='MULTIPLE_CHOICE' and jsonb_typeof(q->'key')='array')) is not true then raise exception 'Unsupported automatic grading; manual review required'; end if;
 if q->>'type' in('SINGLE_CHOICE','MULTIPLE_CHOICE') then
 if jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options') not between 2 and 30 or exists(select 1 from jsonb_array_elements(q->'options') o where jsonb_typeof(o)<>'string') or
 (select count(*) from jsonb_array_elements(q->'options'))<>(select count(distinct o) from jsonb_array_elements(q->'options') o) then raise exception 'Invalid answer options'; end if;
 if q->>'type'='SINGLE_CHOICE' and not (q->'options' @> jsonb_build_array(q->'key')) then raise exception 'Answer key not in options'; end if;
 if q->>'type'='MULTIPLE_CHOICE' and (jsonb_array_length(q->'key')=0 or not ((q->'options') @> (q->'key')) or (select count(*) from jsonb_array_elements(q->'key'))<>(select count(distinct k) from jsonb_array_elements(q->'key') k)) then raise exception 'Invalid multiple-choice key'; end if;
 end if;
 else
 if length(trim(coalesce(q->>'rubric',''))) not between 1 and 10000 then raise exception 'Manual rubric required'; end if;
 end if;
 end loop;
 insert into public.learning_assessments(version_id,title,kind,pass_threshold,attempt_limit,cooldown_seconds,questions,author_id) values(p_version,trim(p_title),p_kind,p_threshold,p_limit,p_cooldown,p_questions,auth.uid()) returning id into result;
 insert into public.learning_audit(entity_id,event,actor,reason) values(result,'ASSESSMENT_DRAFT',auth.uid(),trim(p_title));
 return result;
end$$;
create function public.approve_learning_assessment(p_id uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$declare p public.learning_assessments;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 2000 then raise exception 'Review reason required'; end if;
 select * into p from public.learning_assessments where id=p_id for update;
 if not found or p.state<>'DRAFT' then raise exception 'Assessment is not draft'; end if;
 if p.author_id=auth.uid() then raise exception 'Independent content reviewer required'; end if;
 update public.learning_assessments set state='APPROVED',reviewer_id=auth.uid(),review_note=trim(p_reason) where id=p_id;
 insert into public.learning_audit(entity_id,event,actor,reason) values(p_id,'ASSESSMENT_APPROVED',auth.uid(),trim(p_reason));
end$$;
create function public.guard_learning_assessment() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='DELETE' then raise exception 'Assessment history is retained'; end if;
 if old.state<>'DRAFT' or new.state<>'APPROVED' or (new.version_id,new.title,new.kind,new.pass_threshold,new.attempt_limit,new.cooldown_seconds,new.questions,new.author_id,new.created_at) is distinct from (old.version_id,old.title,old.kind,old.pass_threshold,old.attempt_limit,old.cooldown_seconds,old.questions,old.author_id,old.created_at) then raise exception 'Assessment policy is immutable'; end if;
 return new;
end$$;
create trigger learning_assessment_immutable before update or delete on public.learning_assessments for each row execute function public.guard_learning_assessment();

create function public.available_learning_assessments(p_version uuid)
returns table(id uuid,title text,kind text,pass_threshold numeric,attempt_limit integer,cooldown_seconds integer)
language sql stable security definer set search_path=public,pg_temp as $$
 select a.id,a.title,a.kind,a.pass_threshold,a.attempt_limit,a.cooldown_seconds from public.learning_assessments a join public.learning_versions v on v.id=a.version_id
 where a.version_id=p_version and a.state='APPROVED' and v.state='PUBLISHED' and public.learning_learner_for_level(v.level_id) is not null order by a.created_at,a.id limit 100
$$;
create function public.start_learning_assessment(p_id uuid,p_request uuid,p_identity_confirmed boolean) returns uuid
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
 select count(*),max(completed_at) filter(where state='FAILED') into used,failed_at from public.learning_assessment_attempts where assessment_id=p_id and student_id=learner;
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

create function public.submit_learning_assessment(p_attempt uuid,p_answers jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.learning_assessment_attempts; p public.learning_assessments; level uuid; learner uuid; q jsonb; answer jsonb; points numeric; total numeric:=0; earned numeric:=0; pending boolean:=false; correct boolean; v_score numeric; v_evidence jsonb:='[]'; result text;
begin
 select * into a from public.learning_assessment_attempts where id=p_attempt for update;
 if not found then raise exception 'Assessment attempt unavailable'; end if;
 select * into p from public.learning_assessments where id=a.assessment_id;
 select level_id into level from public.learning_versions where id=p.version_id and state='PUBLISHED';
 learner:=public.learning_learner_for_level(level);
 if learner is null or learner<>a.student_id then raise exception 'Learning access denied or expired'; end if;
 if a.state<>'IN_PROGRESS' then
 if a.answers=p_answers then return; end if;
 raise exception 'Assessment submission is immutable';
 end if;
 if p_answers is null or jsonb_typeof(p_answers)<>'object' or octet_length(p_answers::text)>100000 then raise exception 'Invalid assessment answers'; end if;
 if exists(select 1 from jsonb_object_keys(p_answers) k where not exists(select 1 from jsonb_array_elements(p.questions) question where question->>'code'=k)) then raise exception 'Unknown question in submission'; end if;
 for q in select value from jsonb_array_elements(p.questions) loop
 points:=(q->>'points')::numeric;total:=total+points;answer:=p_answers->(q->>'code');correct:=false;
 if q->>'mode'<>'AUTO' then pending:=true;
 elsif q->>'type' in('SINGLE_CHOICE','TRUE_FALSE') then correct:=coalesce(answer=q->'key',false);
 elsif q->>'type'='MULTIPLE_CHOICE' and jsonb_typeof(answer)='array' then
 correct:=answer @> (q->'key') and (q->'key') @> answer and jsonb_array_length(answer)=jsonb_array_length(q->'key');
 end if;
 if correct then earned:=earned+points; end if;
 v_evidence:=v_evidence||jsonb_build_array(jsonb_build_object('code',q->>'code','mode',q->>'mode','points',case when q->>'mode'='AUTO' then case when correct then points else 0 end else null end,'max_points',points));
 end loop;
 v_score:=round(100*earned/total,4);result:=case when pending then 'PENDING_REVIEW' when v_score>=p.pass_threshold then 'PASSED' else 'FAILED' end;
 update public.learning_assessment_attempts set answers=p_answers,state=result,score=case when pending then null else v_score end,evidence=v_evidence,submitted_at=clock_timestamp(),completed_at=case when pending then null else clock_timestamp() end where id=p_attempt;
 if result='PASSED' and p.kind='FINAL' then insert into public.learning_academic_shadow(attempt_id,version_id,student_id,proposed_outcome) values(p_attempt,p.version_id,learner,'PASS') on conflict do nothing; end if;
end$$;

create function public.review_learning_assessment(p_attempt uuid,p_marks jsonb,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.learning_assessment_attempts; p public.learning_assessments; e jsonb; mark numeric; earned numeric:=0; total numeric:=0; final_evidence jsonb:='[]'; v_score numeric; result text;
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 2000 or p_marks is null or jsonb_typeof(p_marks)<>'object' then raise exception 'Manual review evidence required'; end if;
 select * into a from public.learning_assessment_attempts where id=p_attempt for update;
 if not found or a.state<>'PENDING_REVIEW' then raise exception 'Attempt is not awaiting review'; end if;
 if exists(select 1 from public.students where id=a.student_id and user_id=auth.uid()) then raise exception 'Cannot review own assessment'; end if;
 select * into p from public.learning_assessments where id=a.assessment_id;
 for e in select value from jsonb_array_elements(a.evidence) loop
 total:=total+(e->>'max_points')::numeric;
 if e->>'mode'='AUTO' then mark:=(e->>'points')::numeric;
 else
 if jsonb_typeof(p_marks->(e->>'code')) is distinct from 'number' then raise exception 'All manual questions require marks'; end if;
 mark:=(p_marks->>(e->>'code'))::numeric;
 if mark<0 or mark>(e->>'max_points')::numeric then raise exception 'Manual mark outside rubric range'; end if;
 end if;
 earned:=earned+mark;final_evidence:=final_evidence||jsonb_build_array(e||jsonb_build_object('points',mark));
 end loop;
 v_score:=round(100*earned/total,4);result:=case when v_score>=p.pass_threshold then 'PASSED' else 'FAILED' end;
 update public.learning_assessment_attempts set state=result,score=v_score,evidence=final_evidence,reviewed_by=auth.uid(),review_reason=trim(p_reason),completed_at=clock_timestamp() where id=p_attempt;
 insert into public.learning_audit(entity_id,event,actor,reason) values(p_attempt,'ASSESSMENT_REVIEWED',auth.uid(),trim(p_reason));
 if result='PASSED' and p.kind='FINAL' then insert into public.learning_academic_shadow(attempt_id,version_id,student_id,proposed_outcome) values(p_attempt,p.version_id,a.student_id,'PASS') on conflict do nothing; end if;
end$$;
create function public.override_learning_assessment(p_assessment uuid,p_student uuid,p_attempts integer,p_until timestamptz,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$declare result uuid;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if p_until is null or p_until<=now() then raise exception 'Future override expiry required'; end if;
 insert into public.learning_assessment_overrides(assessment_id,student_id,extra_attempts,valid_until,reason,created_by) values(p_assessment,p_student,p_attempts,p_until,trim(p_reason),auth.uid()) returning id into result;
 insert into public.learning_audit(entity_id,event,actor,reason) values(result,'ASSESSMENT_OVERRIDE',auth.uid(),trim(p_reason));
 return result;
end$$;
create function public.guard_assessment_attempt() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='DELETE' then raise exception 'Assessment attempts are retained'; end if;
 if old.state in('PASSED','FAILED') or (new.id,new.assessment_id,new.student_id,new.override_id,new.policy_snapshot,new.question_snapshot,new.identity_confirmed,new.started_at) is distinct from (old.id,old.assessment_id,old.student_id,old.override_id,old.policy_snapshot,old.question_snapshot,old.identity_confirmed,old.started_at) or (old.state='PENDING_REVIEW' and new.answers is distinct from old.answers) then raise exception 'Assessment evidence is immutable'; end if;
 return new;
end$$;
create trigger learning_attempt_guard before update or delete on public.learning_assessment_attempts for each row execute function public.guard_assessment_attempt();
revoke all on function public.create_learning_assessment(uuid,text,text,numeric,integer,integer,jsonb),public.approve_learning_assessment(uuid,text),public.guard_learning_assessment(),public.available_learning_assessments(uuid),public.start_learning_assessment(uuid,uuid,boolean),public.submit_learning_assessment(uuid,jsonb),public.review_learning_assessment(uuid,jsonb,text),public.override_learning_assessment(uuid,uuid,integer,timestamptz,text),public.guard_assessment_attempt() from public,anon,authenticated,service_role;
grant execute on function public.create_learning_assessment(uuid,text,text,numeric,integer,integer,jsonb),public.approve_learning_assessment(uuid,text),public.available_learning_assessments(uuid),public.start_learning_assessment(uuid,uuid,boolean),public.submit_learning_assessment(uuid,jsonb),public.review_learning_assessment(uuid,jsonb,text),public.override_learning_assessment(uuid,uuid,integer,timestamptz,text) to authenticated;
