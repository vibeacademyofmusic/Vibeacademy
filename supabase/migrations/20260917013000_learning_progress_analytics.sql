-- Read-only administrator analytics. Lesson acknowledgements are not Academic results.
create index learning_progress_version_lookup on public.learning_lesson_progress(version_id,lesson_code);
create index learning_assessment_version_lookup on public.learning_assessments(version_id,id);
create index learning_attempt_assessment_lookup on public.learning_assessment_attempts(assessment_id);

create function public.learning_version_analytics(p_version uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v public.learning_versions; lessons jsonb; assessments jsonb;
begin
 if not public.account_is_active() or not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 select * into v from public.learning_versions where id=p_version;
 if not found then raise exception 'Learning version not found'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('code',l.value->>'code','title',l.value->>'title',
   'acknowledged_learners',coalesce(p.learners,0)) order by m.ordinality,l.ordinality),'[]') into lessons
 from jsonb_array_elements(v.content->'modules') with ordinality m
 cross join lateral jsonb_array_elements(m.value->'lessons') with ordinality l
 left join (select lesson_code,count(distinct student_id) learners from public.learning_lesson_progress
   where version_id=p_version group by lesson_code) p on p.lesson_code=l.value->>'code';

 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'kind',a.kind,'policy_state',a.state,
   'attempts',s.attempts,'learners',s.learners,'in_progress',s.in_progress,'pending_review',s.pending_review,
   'passed',s.passed,'failed',s.failed,'average_completed_score',s.average_completed_score)
   order by a.created_at,a.id),'[]') into assessments
 from public.learning_assessments a
 cross join lateral (select count(*) attempts,count(distinct r.student_id) learners,
   count(*) filter(where r.state='IN_PROGRESS') in_progress,
   count(*) filter(where r.state='PENDING_REVIEW') pending_review,
   count(*) filter(where r.state='PASSED') passed,count(*) filter(where r.state='FAILED') failed,
   round(avg(r.score) filter(where r.state in('PASSED','FAILED')),2) average_completed_score
   from public.learning_effective_assessment_results r where r.assessment_id=a.id) s
 where a.version_id=p_version;
 return jsonb_build_object('version_id',v.id,'title',v.title,'version',v.version,'state',v.state,
   'lessons',lessons,'assessments',assessments);
end$$;
revoke all on function public.learning_version_analytics(uuid) from public,anon,authenticated,service_role;
grant execute on function public.learning_version_analytics(uuid) to authenticated;
