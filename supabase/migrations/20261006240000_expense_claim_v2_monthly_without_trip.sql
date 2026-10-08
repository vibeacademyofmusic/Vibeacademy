-- Additive: an employee may file one itemized expense claim per month without a trip order.
alter table public.employee_expense_claims drop constraint employee_expense_claim_model_check;
alter table public.employee_expense_claims add constraint employee_expense_claim_model_check check (
  (claim_model='LEGACY_TRIP_SUMMARY' and trip_id is null) or claim_model='ITEMIZED_V2');

create unique index employee_expense_claim_v2_monthly
  on public.employee_expense_claims(employee_id,requested_month)
  where claim_model='ITEMIZED_V2' and trip_id is null and status not in ('REJECTED','CANCELLED');

create function public.create_employee_expense_claim_v2_monthly(p_month date,p_currency text,p_key uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare ctx record; cid uuid; payload jsonb; prior jsonb; this_month date;
begin
  select * into ctx from vibe_expense_private.current_employee_context();
  if ctx.employee_id is null then raise exception 'EXPENSE_ACTIVE_EMPLOYEE_LINK_AND_OWN_PERMISSION_REQUIRED'; end if;
  this_month:=date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')::date;
  if p_month is null or not isfinite(p_month) or extract(day from p_month)<>1 or p_month>this_month then raise exception 'EXPENSE_INVALID_MONTH'; end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then raise exception 'EXPENSE_INVALID_CURRENCY'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vibe_expense_month:'||ctx.employee_id::text||p_month::text,0));
  payload:=jsonb_build_object('action','CREATE_V2_MONTHLY','employee_id',ctx.employee_id,'branch_id',ctx.branch_id,'month',p_month,'currency',p_currency);
  prior:=vibe_expense_private.replay(p_key,payload); if prior is not null then return prior; end if;
  if exists(select 1 from public.employee_expense_claims c where c.employee_id=ctx.employee_id and c.requested_month=p_month
    and c.claim_model='ITEMIZED_V2' and c.trip_id is null and c.status not in ('REJECTED','CANCELLED')) then
    raise exception 'EXPENSE_MONTH_ALREADY_CLAIMED';
  end if;
  insert into public.employee_expense_claims(employee_id,branch_id,trip_id,claim_model,requested_month,currency,title,created_by)
  values(ctx.employee_id,ctx.branch_id,null,'ITEMIZED_V2',p_month,p_currency,'Công tác phí tháng '||to_char(p_month,'MM/YYYY'),auth.uid()) returning id into cid;
  return vibe_expense_private.record_event(cid,p_key,payload,'CREATED',null);
end;
$fn$;

revoke all on function public.create_employee_expense_claim_v2_monthly(date,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_employee_expense_claim_v2_monthly(date,text,uuid) to authenticated;

create or replace function vibe_expense_private.validate_submission_v2(p_claim uuid)
returns numeric language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare c public.employee_expense_claims; total numeric; item_count integer;
begin
  select * into strict c from public.employee_expense_claims where id=p_claim and claim_model='ITEMIZED_V2';
  if c.trip_id is not null and not exists(select 1 from public.employee_trips t join public.employee_trip_reviews r on r.trip_id=t.id and r.decision='APPROVED' where t.id=c.trip_id and t.employee_id=c.employee_id) then
    raise exception 'EXPENSE_APPROVED_OWN_TRIP_REQUIRED';
  end if;
  select count(*)::integer,coalesce(sum(amount),0) into item_count,total from public.employee_expense_claim_items_v2 where claim_id=p_claim;
  if item_count=0 or total<=0 then raise exception 'EXPENSE_NONEMPTY_POSITIVE_CLAIM_REQUIRED'; end if;
  if total>999999999999.99 then raise exception 'EXPENSE_TOTAL_TOO_LARGE'; end if;
  return total;
end;
$fn$;
