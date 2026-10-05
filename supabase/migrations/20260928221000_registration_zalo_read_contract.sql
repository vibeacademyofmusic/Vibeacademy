-- Align incremental MAIN and clean installs with the named RPC contract used by the UI.
begin;
drop function public.registration_zalo_connection(uuid);
create function public.registration_zalo_connection(p_application uuid)
returns table(
  link_status text,
  external_link_key text,
  linked_at timestamptz,
  last_verified_at timestamptz,
  masked_user_id text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  branch uuid;
  existing public.customer_channel_links;
begin
  if auth.uid() is null or not public.account_is_active() then
    raise exception 'Unauthorized';
  end if;
  select app.branch_id into branch
  from public.registration_applications app
  where app.id = p_application;
  -- Missing and out-of-scope IDs have the same read result.
  if branch is null or not public.registration_can('registration.view', branch) then
    return;
  end if;

  select * into existing
  from public.customer_channel_links
  where provider = 'ZALO'
    and registration_application_id = p_application
    and status <> 'REVOKED';
  if not found then
    return query select 'NONE'::text, null::text, null::timestamptz, null::timestamptz, null::text;
    return;
  end if;

  return query select
    existing.status,
    existing.external_link_key,
    existing.linked_at,
    existing.last_verified_at,
    case
      when public.has_role('SUPER_ADMIN')
        and existing.provider_user_id is not null
        then '••••' || right(existing.provider_user_id, 4)
      else null
    end;
end;
$$;

revoke all on function public.registration_zalo_connection(uuid) from public,anon,authenticated,service_role;
grant execute on function public.registration_zalo_connection(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
