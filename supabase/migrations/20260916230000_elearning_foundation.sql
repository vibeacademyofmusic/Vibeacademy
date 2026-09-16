-- Protected delivery and learning evidence only. Never writes Academic progress.
create table public.learning_versions (
 id uuid primary key default gen_random_uuid(),
 level_id uuid not null references public.curriculum_levels(id),
 version integer not null check(version>0),
 title text not null check(length(trim(title)) between 1 and 200),
 content jsonb not null,
 source_scope text not null check(length(trim(source_scope)) between 1 and 2000),
 state text not null default 'DRAFT' check(state in('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','RETIRED')),
 author_id uuid not null references public.profiles(id),
 reviewer_id uuid references public.profiles(id),
 review_note text,
 created_at timestamptz not null default now(),
 unique(level_id,version)
);
create table public.learning_access_grants (
 id uuid primary key default gen_random_uuid(),
 enrollment_id uuid not null references public.enrollments(id),
 level_id uuid not null references public.curriculum_levels(id),
 valid_from timestamptz not null check(isfinite(valid_from)),
 valid_until timestamptz not null check(isfinite(valid_until)),
 revoked_at timestamptz,
 reason text not null check(length(trim(reason)) between 1 and 2000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 check(valid_until>valid_from)
);
create index learning_grant_lookup on public.learning_access_grants(level_id,enrollment_id,valid_until) where revoked_at is null;
create table public.learning_audit (
 id bigint generated always as identity primary key,
 entity_id uuid not null,
 event text not null,
 actor uuid not null references public.profiles(id),
 reason text not null,
 created_at timestamptz not null default clock_timestamp()
);
create table public.learning_lesson_progress (
 student_id uuid not null references public.students(id),
 version_id uuid not null references public.learning_versions(id),
 lesson_code text not null,
 completed_at timestamptz not null default clock_timestamp(),
 primary key(student_id,version_id,lesson_code)
);
create table public.learning_practice_attempts (
 id uuid primary key,
 student_id uuid not null references public.students(id),
 version_id uuid not null references public.learning_versions(id),
 lesson_code text not null,
 response jsonb not null check(jsonb_typeof(response)='object' and octet_length(response::text)<=20000),
 status text not null default 'RECORDED_UNGRADED' check(status='RECORDED_UNGRADED'),
 created_at timestamptz not null default clock_timestamp()
);
create index learning_practice_history on public.learning_practice_attempts(student_id,created_at desc,id);

create function public.learning_learner_for_level(p_level uuid) returns uuid
language sql stable security definer set search_path=public,pg_temp as $$
 select s.id from public.students s
 join public.enrollments e on e.student_id=s.id
 join public.classes c on c.id=e.class_id join public.courses co on co.id=c.course_id
 join public.curriculum_levels l on l.id=p_level and l.curriculum_id=co.curriculum_id
 join public.learning_access_grants g on g.enrollment_id=e.id and g.level_id=l.id
 where public.account_is_active() and public.has_role('STUDENT') and s.user_id=auth.uid() and s.status='ACTIVE'
 and public.has_role_permission('STUDENT','students.view_own',c.branch_id)
 and e.status='ACTIVE' and c.status='ACTIVE' and co.status='ACTIVE' and l.status='ACTIVE'
 and coalesce(e.started_at,e.enrolled_at)<=(now() at time zone 'Asia/Ho_Chi_Minh')::date
 and (e.ended_at is null or e.ended_at>=(now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and not public.is_enrollment_paused_on(e.id,(now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and g.revoked_at is null and g.valid_from<=now() and g.valid_until>now()
 order by s.id limit 1
$$;
create function public.can_read_learning_version(p_version uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or exists(select 1 from public.learning_versions v
 where v.id=p_version and v.state='PUBLISHED' and public.learning_learner_for_level(v.level_id) is not null)
$$;
create function public.owns_learning_history(p_student uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or (public.account_is_active() and public.has_role('STUDENT') and exists(
 select 1 from public.students s where s.id=p_student and s.user_id=auth.uid() and s.status in('ACTIVE','PAUSED','GRADUATED')))
$$;

alter table public.learning_versions enable row level security;
alter table public.learning_access_grants enable row level security;
alter table public.learning_audit enable row level security;
alter table public.learning_lesson_progress enable row level security;
alter table public.learning_practice_attempts enable row level security;
revoke all on public.learning_versions,public.learning_access_grants,public.learning_audit,public.learning_lesson_progress,public.learning_practice_attempts from public,anon,authenticated,service_role;
grant select on public.learning_versions,public.learning_access_grants,public.learning_audit,public.learning_lesson_progress,public.learning_practice_attempts to authenticated;
create policy learning_version_read on public.learning_versions for select to authenticated using(public.can_read_learning_version(id));
create policy learning_grant_admin_read on public.learning_access_grants for select to authenticated using(public.has_role('SUPER_ADMIN'));
create policy learning_audit_admin_read on public.learning_audit for select to authenticated using(public.has_role('SUPER_ADMIN'));
create policy learning_progress_own_read on public.learning_lesson_progress for select to authenticated using(public.owns_learning_history(student_id));
create policy learning_attempt_own_read on public.learning_practice_attempts for select to authenticated using(public.owns_learning_history(student_id));

create function public.validate_learning_content(p_content jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$
declare m jsonb; l jsonb; b jsonb; module_codes text[]:='{}'; lesson_codes text[]:='{}';
begin
 if p_content is null or jsonb_typeof(p_content)<>'object' or jsonb_typeof(p_content->'modules') is distinct from 'array' or octet_length(p_content::text)>1000000 then raise exception 'Invalid learning content'; end if;
 if jsonb_array_length(p_content->'modules') not between 1 and 100 then raise exception 'Invalid learning content'; end if;
 for m in select value from jsonb_array_elements(p_content->'modules') loop
 if jsonb_typeof(m)<>'object' or coalesce(m->>'code','')!~'^[A-Z0-9._-]{1,50}$' or (m->>'code')=any(module_codes) or length(trim(coalesce(m->>'title',''))) not between 1 and 200 or jsonb_typeof(m->'lessons') is distinct from 'array' then raise exception 'Invalid learning module'; end if;
 module_codes:=array_append(module_codes,m->>'code');
 if jsonb_array_length(m->'lessons') not between 1 and 100 then raise exception 'Invalid learning module'; end if;
 for l in select value from jsonb_array_elements(m->'lessons') loop
 if jsonb_typeof(l)<>'object' or coalesce(l->>'code','')!~'^[A-Z0-9._-]{1,80}$' or (l->>'code')=any(lesson_codes) or length(trim(coalesce(l->>'title',''))) not between 1 and 200 or jsonb_typeof(l->'blocks') is distinct from 'array' then raise exception 'Invalid learning lesson'; end if;
 lesson_codes:=array_append(lesson_codes,l->>'code');
 if jsonb_array_length(l->'blocks') not between 1 and 100 then raise exception 'Invalid learning lesson'; end if;
 for b in select value from jsonb_array_elements(l->'blocks') loop
 if jsonb_typeof(b)<>'object' or coalesce(b->>'type','') not in('TEXT','MEDIA_REFERENCE') or length(trim(coalesce(b->>'text',''))) not between 1 and 10000 or
 (b->>'type'='MEDIA_REFERENCE' and length(trim(coalesce(b->>'asset_ref',''))) not between 1 and 500) then raise exception 'Invalid learning block'; end if;
 end loop;
 end loop;
 end loop;
end$$;

create function public.create_learning_version(p_level uuid,p_version integer,p_title text,p_content jsonb,p_source_scope text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$declare result uuid;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 perform public.validate_learning_content(p_content);
 insert into public.learning_versions(level_id,version,title,content,source_scope,author_id)
 values(p_level,p_version,trim(p_title),p_content,trim(p_source_scope),auth.uid()) returning id into result;
 insert into public.learning_audit(entity_id,event,actor,reason) values(result,'DRAFT',auth.uid(),trim(p_source_scope));
 return result;
end$$;
create function public.transition_learning_version(p_id uuid,p_action text,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$declare v public.learning_versions; target text;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 2000 then raise exception 'Review reason required'; end if;
 select * into v from public.learning_versions where id=p_id for update;
 if not found then raise exception 'Learning version not found'; end if;
 target:=case when p_action='SUBMIT' and v.state='DRAFT' then 'IN_REVIEW'
 when p_action='APPROVE' and v.state='IN_REVIEW' then 'APPROVED'
 when p_action='PUBLISH' and v.state='APPROVED' then 'PUBLISHED'
 when p_action='RETIRE' and v.state='PUBLISHED' then 'RETIRED' end;
 if target is null then raise exception 'Invalid learning transition'; end if;
 if target='APPROVED' and v.author_id=auth.uid() then raise exception 'Independent content reviewer required'; end if;
 update public.learning_versions set state=target,
 reviewer_id=case when target='APPROVED' then auth.uid() else reviewer_id end,
 review_note=case when target='APPROVED' then trim(p_reason) else review_note end where id=p_id;
 insert into public.learning_audit(entity_id,event,actor,reason) values(p_id,target,auth.uid(),trim(p_reason));
end$$;
create function public.guard_learning_version() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='DELETE' then raise exception 'Learning versions are retained'; end if;
 if (new.level_id,new.version,new.title,new.content,new.source_scope,new.author_id,new.created_at) is distinct from (old.level_id,old.version,old.title,old.content,old.source_scope,old.author_id,old.created_at) then raise exception 'Create a new learning version'; end if;
 if old.state in('PUBLISHED','RETIRED') and not(old.state='PUBLISHED' and new.state='RETIRED' and new.reviewer_id is not distinct from old.reviewer_id and new.review_note is not distinct from old.review_note) then raise exception 'Published learning version is immutable'; end if;
 return new;
end$$;
create trigger learning_version_immutable before update or delete on public.learning_versions for each row execute function public.guard_learning_version();
create function public.reject_learning_history_mutation() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 raise exception 'Learning history is immutable';
end$$;
revoke all on function public.reject_learning_history_mutation() from public,anon,authenticated,service_role;
create trigger learning_audit_immutable before update or delete on public.learning_audit for each row execute function public.reject_learning_history_mutation();
create trigger learning_attempt_immutable before update or delete on public.learning_practice_attempts for each row execute function public.reject_learning_history_mutation();

create function public.grant_learning_access(p_enrollment uuid,p_level uuid,p_from timestamptz,p_until timestamptz,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$declare result uuid;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if not exists(select 1 from public.enrollments e join public.classes c on c.id=e.class_id join public.courses co on co.id=c.course_id join public.curriculum_levels l on l.curriculum_id=co.curriculum_id and l.id=p_level where e.id=p_enrollment and e.status='ACTIVE') then raise exception 'Eligible matching enrollment required'; end if;
 insert into public.learning_access_grants(enrollment_id,level_id,valid_from,valid_until,reason,created_by) values(p_enrollment,p_level,p_from,p_until,trim(p_reason),auth.uid()) returning id into result;
 insert into public.learning_audit(entity_id,event,actor,reason) values(result,'GRANT',auth.uid(),trim(p_reason));
 return result;
end$$;
create function public.revoke_learning_access(p_grant uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 2000 then raise exception 'Revocation reason required'; end if;
 update public.learning_access_grants set revoked_at=clock_timestamp() where id=p_grant and revoked_at is null;
 if found then insert into public.learning_audit(entity_id,event,actor,reason) values(p_grant,'REVOKE',auth.uid(),trim(p_reason)); end if;
end$$;
create function public.record_learning_activity(p_version uuid,p_lesson text,p_kind text,p_request uuid default null,p_response jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$declare v public.learning_versions; learner uuid; previous public.learning_practice_attempts;begin
 select * into v from public.learning_versions where id=p_version and state='PUBLISHED' for share;
 if not found then raise exception 'Learning content unavailable'; end if;
 learner:=public.learning_learner_for_level(v.level_id);
 if learner is null then raise exception 'Learning access denied or expired'; end if;
 if not exists(select 1 from jsonb_array_elements(v.content->'modules') m cross join lateral jsonb_array_elements(m->'lessons') l where l->>'code'=p_lesson) then raise exception 'Lesson not found'; end if;
 if p_kind='COMPLETE_LESSON' then
 insert into public.learning_lesson_progress(student_id,version_id,lesson_code) values(learner,p_version,p_lesson) on conflict do nothing;
 elsif p_kind='PRACTICE' and p_request is not null then
 perform pg_advisory_xact_lock(hashtextextended('learning-practice:'||p_request::text,0));
 select * into previous from public.learning_practice_attempts where id=p_request;
 if found then
 if previous.student_id is distinct from learner or previous.version_id is distinct from p_version or previous.lesson_code is distinct from p_lesson or previous.response is distinct from p_response then raise exception 'Practice request mismatch'; end if;
 else insert into public.learning_practice_attempts(id,student_id,version_id,lesson_code,response) values(p_request,learner,p_version,p_lesson,p_response); end if;
 else raise exception 'Unsupported learning activity'; end if;
end$$;
revoke all on function public.learning_learner_for_level(uuid),public.can_read_learning_version(uuid),public.owns_learning_history(uuid),public.validate_learning_content(jsonb),public.create_learning_version(uuid,integer,text,jsonb,text),public.transition_learning_version(uuid,text,text),public.guard_learning_version(),public.grant_learning_access(uuid,uuid,timestamptz,timestamptz,text),public.revoke_learning_access(uuid,text),public.record_learning_activity(uuid,text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.learning_learner_for_level(uuid),public.can_read_learning_version(uuid),public.owns_learning_history(uuid),public.create_learning_version(uuid,integer,text,jsonb,text),public.transition_learning_version(uuid,text,text),public.grant_learning_access(uuid,uuid,timestamptz,timestamptz,text),public.revoke_learning_access(uuid,text),public.record_learning_activity(uuid,text,text,uuid,jsonb) to authenticated;
