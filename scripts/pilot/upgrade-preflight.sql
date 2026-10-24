-- Read-only, fail-closed prerequisite check for a local upgrade clone.
-- Does not establish completeness of Storage object bytes or external secrets.
begin transaction read only;
do $preflight$
declare
  required text;
begin
  foreach required in array array['auth.users','auth.identities','auth.sessions',
    'storage.buckets','storage.objects','supabase_migrations.schema_migrations'] loop
    if to_regclass(required) is null then
      raise exception 'UPGRADE_PLATFORM_COMPONENT_MISSING: %', required;
    end if;
  end loop;
  if (select count(*) from information_schema.columns where table_schema='auth'
      and table_name='users' and column_name in ('id','email','encrypted_password','aud','role','created_at')) <> 6 then
    raise exception 'UPGRADE_AUTH_USERS_IS_NOT_PLATFORM_TABLE';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname like '%private' and p.prorettype='trigger'::regtype
      and md5(p.prosrc)='c86e1272f9dbdfdc013ed94c4b8f92c9') then
    raise exception 'UPGRADE_PLACEHOLDER_TRIGGER_BODY';
  end if;
  if not exists (select 1 from pg_proc where oid=to_regprocedure('auth.uid()')
    and prosrc like '%request.jwt%') then
    raise exception 'UPGRADE_AUTH_UID_IS_NOT_PLATFORM_FUNCTION';
  end if;
end
$preflight$;
rollback;
