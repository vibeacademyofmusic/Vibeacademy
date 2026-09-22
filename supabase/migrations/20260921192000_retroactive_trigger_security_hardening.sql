-- VIBE Academy
-- Retroactive trigger helper security hardening
--
-- sync_retroactive_claim_action_cancel() is trigger-only.
-- It must never be directly callable from API roles.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception
      'RETROACTIVE_TRIGGER_HARDENING_REQUIRES_POSTGRES';
  end if;

  if to_regprocedure(
       'public.sync_retroactive_claim_action_cancel()'
     ) is null
  then
    raise exception
      'RETROACTIVE_TRIGGER_FUNCTION_MISSING';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname =
      'payroll_retroactive_action_cancel_sync'
      and tgrelid =
        'public.payroll_period_actions_v2'::regclass
      and not tgisinternal
  ) then
    raise exception
      'RETROACTIVE_TRIGGER_MISSING';
  end if;
end;
$preflight$;

-- Trigger-only function:
-- no direct API role should execute it.

revoke all
on function public.sync_retroactive_claim_action_cancel()
from public;

revoke all
on function public.sync_retroactive_claim_action_cancel()
from anon;

revoke all
on function public.sync_retroactive_claim_action_cancel()
from authenticated;

revoke all
on function public.sync_retroactive_claim_action_cancel()
from service_role;

-- Explicitly keep owner execution only.
grant execute
on function public.sync_retroactive_claim_action_cancel()
to postgres;

do $verify$
begin
  if has_function_privilege(
       'anon',
       'public.sync_retroactive_claim_action_cancel()',
       'EXECUTE'
     )
  then
    raise exception
      'RETROACTIVE_TRIGGER_ANON_EXECUTE_STILL_PRESENT';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.sync_retroactive_claim_action_cancel()',
       'EXECUTE'
     )
  then
    raise exception
      'RETROACTIVE_TRIGGER_AUTH_EXECUTE_STILL_PRESENT';
  end if;

  if has_function_privilege(
       'service_role',
       'public.sync_retroactive_claim_action_cancel()',
       'EXECUTE'
     )
  then
    raise exception
      'RETROACTIVE_TRIGGER_SERVICE_EXECUTE_STILL_PRESENT';
  end if;

  if has_function_privilege(
       'public',
       'public.sync_retroactive_claim_action_cancel()',
       'EXECUTE'
     )
  then
    raise exception
      'RETROACTIVE_TRIGGER_PUBLIC_EXECUTE_STILL_PRESENT';
  end if;

  if not has_function_privilege(
       'postgres',
       'public.sync_retroactive_claim_action_cancel()',
       'EXECUTE'
     )
  then
    raise exception
      'RETROACTIVE_TRIGGER_OWNER_EXECUTE_MISSING';
  end if;
end;
$verify$;

commit;
