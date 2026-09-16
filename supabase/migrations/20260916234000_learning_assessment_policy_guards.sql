-- Final assessments must not evade the approved attempt cap through SQL NULL.
alter table public.learning_assessments add constraint learning_final_limit_required
 check(kind <> 'FINAL' or attempt_limit is not null);
-- A display target, not an automatic grading or escalation rule. Holidays are not
-- configured yet; the local pilot uses Monday-Friday in Vietnam time.
create function public.learning_review_due(p_submitted timestamptz) returns timestamptz
language plpgsql immutable set search_path=public,pg_temp as $$
declare d timestamp; remaining integer:=2;
begin
 if p_submitted is null then return null; end if;
 d:=p_submitted at time zone 'Asia/Ho_Chi_Minh';
 while remaining>0 loop
 d:=d+interval '1 day';
 if extract(isodow from d)<6 then remaining:=remaining-1; end if;
 end loop;
 return d at time zone 'Asia/Ho_Chi_Minh';
end$$;
alter table public.learning_assessment_attempts add column review_due_at timestamptz
 generated always as(public.learning_review_due(submitted_at)) stored;
revoke all on function public.learning_review_due(timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.learning_review_due(timestamptz) to authenticated;
