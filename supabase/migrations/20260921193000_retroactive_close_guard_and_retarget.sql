-- ============================================================
-- VIBE Academy
-- Retroactive Payroll Close Guard + Retarget V1
--
-- Guarantees:
-- 1. A payroll period cannot move to APPROVED/FINALIZED while
--    an APPROVED retroactive claim targeting that period has
--    not been POSTED.
-- 2. An APPROVED unposted retroactive claim may be retargeted
--    to a later open payroll period without reopening history.
-- ============================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception
      'RETROACTIVE_CLOSE_GUARD_REQUIRES_POSTGRES';
  end if;

  if to_regclass(
       'public.payroll_retroactive_claims'
     ) is null
     or to_regclass(
       'public.payroll_periods'
     ) is null
     or to_regprocedure(
       'public.account_is_active()'
     ) is null
     or to_regprocedure(
       'public.has_permission(text,uuid)'
     ) is null
     or to_regprocedure(
       'public.has_role_permission(text,text,uuid)'
     ) is null
     or to_regprocedure(
       'public.is_global_super_admin()'
     ) is null
  then
    raise exception
      'RETROACTIVE_CLOSE_GUARD_PREREQUISITE_MISSING';
  end if;

  if to_regclass(
       'public.payroll_retroactive_events'
     ) is not null
     or to_regprocedure(
       'public.retarget_payroll_retroactive_claim(uuid,integer,uuid,text)'
     ) is not null
  then
    raise exception
      'RETROACTIVE_RETARGET_ALREADY_EXISTS';
  end if;
end;
$preflight$;

-- ============================================================
-- AUDIT HISTORY FOR RETARGETING
-- ============================================================

create table public.payroll_retroactive_events (
  id uuid primary key default gen_random_uuid(),

  claim_id uuid not null
    references public.payroll_retroactive_claims(id)
    on delete restrict,

  event_type text not null
    check (
      event_type in ('RETARGETED')
    ),

  from_target_period_id uuid
    references public.payroll_periods(id)
    on delete restrict,

  to_target_period_id uuid not null
    references public.payroll_periods(id)
    on delete restrict,

  reason text not null
    check (
      char_length(btrim(reason))
      between 1 and 2000
    ),

  actor_id uuid not null
    references auth.users(id),

  created_at timestamptz not null
    default clock_timestamp()
);

create index payroll_retroactive_events_claim
  on public.payroll_retroactive_events(
    claim_id,
    created_at
  );

alter table public.payroll_retroactive_events
  enable row level security;

create policy payroll_retroactive_events_read
on public.payroll_retroactive_events
for select
to authenticated
using (
  exists (
    select 1
    from public.payroll_retroactive_claims c
    where c.id =
      payroll_retroactive_events.claim_id
      and (
        coalesce(
          public.is_global_super_admin(),
          false
        )
        or coalesce(
          public.has_role_permission(
            'FINANCE',
            'payroll.view',
            c.branch_id
          ),
          false
        )
      )
  )
);

revoke all
on public.payroll_retroactive_events
from public, anon, authenticated, service_role;

grant select
on public.payroll_retroactive_events
to authenticated;

-- ============================================================
-- HARD DATABASE GUARD
-- ============================================================

create function
public.guard_payroll_pending_retroactive_close()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if new.status in ('APPROVED','FINALIZED')
     and new.status is distinct from old.status
     and exists (
       select 1
       from public.payroll_retroactive_claims r
       where r.target_period_id = new.id
         and r.status = 'APPROVED'
         and r.posted_action_id is null
     )
  then
    raise exception
      'PAYROLL_RETROACTIVE_PENDING_BLOCKS_CLOSE';
  end if;

  return new;
end;
$fn$;

revoke all
on function
  public.guard_payroll_pending_retroactive_close()
from public, anon, authenticated, service_role;

grant execute
on function
  public.guard_payroll_pending_retroactive_close()
to postgres;

create trigger payroll_pending_retroactive_close_guard
before update of status
on public.payroll_periods
for each row
execute function
  public.guard_payroll_pending_retroactive_close();

-- ============================================================
-- RETARGET APPROVED / UNPOSTED CLAIM
-- ============================================================

create function
public.retarget_payroll_retroactive_claim(
  p_claim uuid,
  p_version integer,
  p_target_period uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  c public.payroll_retroactive_claims%rowtype;
  source_row public.payroll_periods%rowtype;
  old_target public.payroll_periods%rowtype;
  new_target public.payroll_periods%rowtype;
begin
  if auth.uid() is null
     or not coalesce(
       public.account_is_active(),
       false
     )
  then
    raise exception
      'RETROACTIVE_UNAUTHORIZED';
  end if;

  select r.*
  into c
  from public.payroll_retroactive_claims r
  where r.id = p_claim
    and public.has_permission(
      'payroll.approve',
      r.branch_id
    )
    and (
      public.is_global_super_admin()
      or public.has_role_permission(
        'FINANCE',
        'payroll.approve',
        r.branch_id
      )
    )
  for update;

  if not found then
    raise exception
      'RETROACTIVE_UNAUTHORIZED';
  end if;

  if c.version is distinct from p_version then
    raise exception
      'RETROACTIVE_CHANGED_RELOAD';
  end if;

  if c.status <> 'APPROVED'
     or c.posted_action_id is not null
     or c.posted_at is not null
  then
    raise exception
      'RETROACTIVE_RETARGET_REQUIRES_APPROVED_UNPOSTED';
  end if;

  if p_reason is null
     or char_length(
       btrim(p_reason)
     ) not between 1 and 2000
  then
    raise exception
      'RETROACTIVE_RETARGET_REASON_REQUIRED';
  end if;

  select *
  into source_row
  from public.payroll_periods
  where id = c.source_period_id;

  if not found then
    raise exception
      'RETROACTIVE_SOURCE_PERIOD_MISSING';
  end if;

  if c.target_period_id is not null then
    select *
    into old_target
    from public.payroll_periods
    where id = c.target_period_id;
  end if;

  select *
  into new_target
  from public.payroll_periods
  where id = p_target_period
  for update;

  if not found then
    raise exception
      'RETROACTIVE_RETARGET_TARGET_MISSING';
  end if;

  if new_target.branch_id
       is distinct from c.branch_id
     or new_target.starts_on
        <= source_row.starts_on
  then
    raise exception
      'RETROACTIVE_RETARGET_SCOPE_INVALID';
  end if;

  if new_target.status
       not in ('DRAFT','GENERATED','REVIEW')
  then
    raise exception
      'RETROACTIVE_RETARGET_TARGET_MUST_BE_OPEN';
  end if;

  if c.target_period_id
       is not distinct from new_target.id
  then
    raise exception
      'RETROACTIVE_RETARGET_SAME_TARGET';
  end if;

  insert into public.payroll_retroactive_events(
    claim_id,
    event_type,
    from_target_period_id,
    to_target_period_id,
    reason,
    actor_id
  )
  values(
    c.id,
    'RETARGETED',
    c.target_period_id,
    new_target.id,
    btrim(p_reason),
    auth.uid()
  );

  update public.payroll_retroactive_claims
  set
    target_period_id = new_target.id,
    version = version + 1
  where id = c.id;

  return jsonb_build_object(
    'status','APPROVED',
    'claim_id',c.id,
    'from_target_period_id',
      c.target_period_id,
    'target_period_id',
      new_target.id,
    'payment_status',
      'NOT_PAID_BY_THIS_ACTION'
  );
end;
$fn$;

revoke all
on function
public.retarget_payroll_retroactive_claim(
  uuid,integer,uuid,text
)
from public, anon, authenticated, service_role;

grant execute
on function
public.retarget_payroll_retroactive_claim(
  uuid,integer,uuid,text
)
to authenticated;

-- ============================================================
-- VERIFY
-- ============================================================

do $verify$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname =
      'payroll_pending_retroactive_close_guard'
      and tgrelid =
        'public.payroll_periods'::regclass
      and not tgisinternal
  ) then
    raise exception
      'RETROACTIVE_CLOSE_TRIGGER_VERIFY_FAILED';
  end if;

  if to_regprocedure(
       'public.retarget_payroll_retroactive_claim(uuid,integer,uuid,text)'
     ) is null
  then
    raise exception
      'RETROACTIVE_RETARGET_RPC_VERIFY_FAILED';
  end if;

  if has_function_privilege(
       'anon',
       'public.retarget_payroll_retroactive_claim(uuid,integer,uuid,text)',
       'EXECUTE'
     )
  then
    raise exception
      'RETROACTIVE_RETARGET_ANON_EXECUTE_VERIFY_FAILED';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.retarget_payroll_retroactive_claim(uuid,integer,uuid,text)',
       'EXECUTE'
     )
  then
    raise exception
      'RETROACTIVE_RETARGET_AUTH_EXECUTE_VERIFY_FAILED';
  end if;

  if has_function_privilege(
       'anon',
       'public.guard_payroll_pending_retroactive_close()',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.guard_payroll_pending_retroactive_close()',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.guard_payroll_pending_retroactive_close()',
       'EXECUTE'
     )
  then
    raise exception
      'RETROACTIVE_CLOSE_TRIGGER_GRANT_VERIFY_FAILED';
  end if;
end;
$verify$;

notify pgrst,'reload schema';

commit;
