-- Align the actual local catalogue with the repository's authoritative security contract.
-- This is corrective and intentionally separate from already-applied migrations.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $security_contract$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    execute format('alter function %s set search_path = public, pg_temp',fn.signature);
    execute format('revoke execute on function %s from public, anon',fn.signature);
  end loop;
end;
$security_contract$;

-- V2 financial endpoints are application RPCs only; private helpers remain private.
revoke execute on function public.get_expense_claim_v2_create_context(),
  public.list_employee_expense_claims_v2(text,integer,integer),
  public.create_employee_expense_claim_v2(uuid,date,text,uuid),
  public.save_employee_expense_claim_item_v2(uuid,integer,uuid,date,text,text,numeric,uuid),
  public.remove_employee_expense_claim_item_v2(uuid,integer,uuid,uuid),
  public.submit_employee_expense_claim_v2(uuid,integer,uuid),
  public.review_employee_expense_claim_v2(uuid,integer,text,text,uuid)
from service_role;

do $verify$
begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')) then
    raise exception 'VIBE_SECURITY_ANON_DEFINER_REMAINS';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and not coalesce(p.proconfig @> array['search_path=public, pg_temp'],false)) then
    raise exception 'VIBE_SECURITY_SEARCH_PATH_CONTRACT_FAILED';
  end if;
end;
$verify$;

notify pgrst,'reload schema';
commit;
