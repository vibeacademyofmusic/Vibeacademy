begin;
create function public.family_feedback_list(p_student uuid) returns table(id uuid,session_date timestamptz,rating smallint,comment text,state text)
language sql stable security definer set search_path=public,pg_temp as $$
 select f.id,f.session_starts_at,f.overall_rating,f.comment,coalesce(t.state,case f.resolution_status when 'RESOLVED' then 'RESOLVED' when 'IN_REVIEW' then 'IN_PROGRESS' else 'OPEN' end)
 from lesson_feedback f left join learning_conversations t on t.kind='FEEDBACK' and t.entity_id=f.id and t.source_version=1
 where f.student_id=p_student and can_read_student_history(f.student_id,f.branch_id,'attendance')
 order by f.submitted_at desc,f.id limit 50
$$;
revoke all on function public.family_feedback_list(uuid) from public,anon;
grant execute on function public.family_feedback_list(uuid) to authenticated;
-- Keep the existing feedback work queue in sync without changing rating/comment.
create function public.sync_feedback_conversation_state() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.kind='FEEDBACK' and new.state is distinct from old.state then
  update lesson_feedback set resolution_status=case when new.state='RESOLVED' then 'RESOLVED' else 'IN_REVIEW' end,
   resolved_at=case when new.state='RESOLVED' then clock_timestamp() end,
   resolved_by=case when new.state='RESOLVED' then auth.uid() end
  where id=new.entity_id;
  insert into lesson_feedback_events(feedback_id,status,note,actor_id)
  values(new.entity_id,case when new.state='RESOLVED' then 'RESOLVED' else 'IN_REVIEW' end,'Trạng thái cập nhật từ trao đổi công khai; xem lịch sử trao đổi.',auth.uid());
 end if;
 return new;
end$$;
revoke all on function public.sync_feedback_conversation_state() from public,anon,authenticated;
create trigger feedback_conversation_state after update of state on public.learning_conversations
for each row execute function public.sync_feedback_conversation_state();
notify pgrst,'reload schema';
commit;
